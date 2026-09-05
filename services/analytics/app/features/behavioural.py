"""Behavioural feature vector per client, computed at household level from holdings and
transactions across the five snapshots. Every function is pure over the frames."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from itertools import pairwise

import numpy as np
import pandas as pd

from app.data.frames import BASELINE, CURRENT, SNAPSHOT_DATES, Frames
from app.features.fx import Fx
from app.features.manifest import FEATURE_NAMES

RISK_ASSET_CLASSES = {"Equity", "Structured Products", "Commodities", "Alternatives"}
CASH = "Cash and Equivalents"
STRESS_WINDOWS = [("2026-02-27", "2026-03-31"), ("2026-03-31", "2026-06-30")]
INCOME_TYPES = {"Dividend", "Coupon", "Interest", "Distribution"}
NEED_CERTAINTIES = {"Confirmed", "Likely"}

# Keyword heuristic linking source-of-wealth text to holding sectors.
SOURCE_SECTOR_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("coal", "energy", "oil", "gas", "commodities"), "Energy"),
    (("software", "e-commerce", "technology", "platform"), "Information Technology"),
    (("property", "real estate", "development"), "Real Estate"),
    (("shipping", "logistics", "port", "chartering", "industrial", "textiles"), "Industrials"),
    (("healthcare", "clinics", "pharmaceutical", "pharma"), "Health Care"),
    (("luxury", "retail", "franchise", "food and beverage"), "Consumer Discretionary"),
    (("palm oil", "plantation", "agribusiness", "food processing"), "Consumer Staples"),
    (("electronics", "manufacturing"), "Information Technology"),
    (("media", "artist"), "Communication Services"),
]


@dataclass
class ClientVector:
    client_id: str
    features: dict[str, float | None]
    evidence: dict[str, dict[str, object]] = field(default_factory=dict)


def _sector_for_source(text: str) -> str | None:
    t = text.lower()
    for keywords, sector in SOURCE_SECTOR_KEYWORDS:
        if any(k in t for k in keywords):
            return sector
    return None


def _none_if_nan(x: float) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)


def _days(from_iso: str, to_iso: str) -> int:
    return (date.fromisoformat(to_iso) - date.fromisoformat(from_iso)).days


def compute_client_vector(frames: Frames, fx: Fx, client_id: str, today: str) -> ClientVector:
    """Compute every feature in the manifest for one client."""
    client = frames.clients.loc[frames.clients.client_id == client_id].iloc[0]
    portfolios = frames.portfolios.loc[frames.portfolios.client_id == client_id]
    pids = set(portfolios.portfolio_id)
    h_all = frames.holdings.loc[frames.holdings.client_id == client_id].copy()
    h_now = h_all.loc[h_all.snapshot_date == CURRENT]
    aum_usd = float(h_now.market_value_usd.sum())
    f: dict[str, float | None] = {}
    ev: dict[str, dict[str, object]] = {}

    def pct_of_aum(mask: pd.Series) -> float:
        return float(h_now.loc[mask, "market_value_usd"].sum() / aum_usd * 100) if aum_usd else 0.0

    # --- Liquidity and cash flow -------------------------------------------------------
    cash_pct = pct_of_aum(h_now.asset_class == CASH)
    f["cash_pct"] = cash_pct
    h_base = h_all.loc[h_all.snapshot_date == BASELINE]
    base_aum = float(h_base.market_value_usd.sum())
    base_cash = float(h_base.loc[h_base.asset_class == CASH, "market_value_usd"].sum())
    f["cash_pct_change_ytd"] = cash_pct - (base_cash / base_aum * 100 if base_aum else 0.0)
    ev["cash_pct"] = {
        "sources": ["raw.holdings"],
        "snapshot": CURRENT,
        "portfolio_ids": sorted(pids),
    }
    ev["cash_pct_change_ytd"] = {"sources": ["raw.holdings"], "snapshots": [BASELINE, CURRENT]}

    needs = frames.planned_cash_needs.loc[frames.planned_cash_needs.client_id == client_id]
    horizon_end = (pd.Timestamp(today) + pd.DateOffset(months=12)).date().isoformat()
    needs_12m_usd = 0.0
    for n in needs.itertuples(index=False):
        if n.certainty not in NEED_CERTAINTIES or n.due_from > horizon_end:
            continue
        amount_usd = fx.to_usd(float(n.amount), n.currency, CURRENT)
        recurrence = str(n.recurrence).lower()
        if "annual" in recurrence:
            needs_12m_usd += amount_usd
        elif recurrence == "one-off":
            needs_12m_usd += amount_usd
        else:  # irregular: pro-rate the total over its window, take the 12-month share
            window_days = max(_days(n.due_from, n.due_to), 1)
            overlap = max(0, min(_days(n.due_from, horizon_end), window_days))
            needs_12m_usd += amount_usd * overlap / window_days
    daily_liquid = float(h_now.loc[h_now.liquidity_tier == "Daily", "market_value_usd"].sum())
    f["cash_needs_12m_pct_aum"] = needs_12m_usd / aum_usd * 100 if aum_usd else 0.0
    f["liquidity_runway_months"] = (
        min(120.0, daily_liquid / (needs_12m_usd / 12)) if needs_12m_usd > 0 else 120.0
    )
    ev["liquidity_runway_months"] = {
        "sources": ["raw.holdings", "raw.planned_cash_needs"],
        "daily_liquid_usd": daily_liquid,
        "needs_12m_usd": needs_12m_usd,
        "need_ids": sorted(needs.need_id),
    }
    ev["cash_needs_12m_pct_aum"] = ev["liquidity_runway_months"]
    upcoming = [n for n in needs.itertuples(index=False) if n.certainty in NEED_CERTAINTIES]
    started = [n for n in upcoming if n.due_from <= today <= n.due_to]
    future = sorted((n for n in upcoming if n.due_from > today), key=lambda n: n.due_from)
    if started:
        f["days_to_next_cash_need"] = 0.0
    elif future:
        f["days_to_next_cash_need"] = float(_days(today, future[0].due_from))
    else:
        f["days_to_next_cash_need"] = None
    ev["days_to_next_cash_need"] = {
        "sources": ["raw.planned_cash_needs"],
        "need_ids": sorted(needs.need_id),
    }

    tx = frames.transactions.loc[frames.transactions.client_id == client_id]
    withdrawals = tx.loc[tx.transaction_type == "Withdrawal"]
    f["withdrawal_count_ytd"] = float(len(withdrawals))
    w_usd = sum(
        fx.to_usd(abs(float(t.amount)), t.currency, CURRENT) for t in withdrawals.itertuples()
    )
    f["withdrawal_pct_aum_ytd"] = w_usd / aum_usd * 100 if aum_usd else 0.0
    ev["withdrawal_count_ytd"] = {
        "sources": ["raw.transactions"],
        "transaction_ids": sorted(withdrawals.transaction_id),
    }
    ev["withdrawal_pct_aum_ytd"] = ev["withdrawal_count_ytd"]
    income = tx.loc[tx.transaction_type.isin(INCOME_TYPES)]
    income_usd = sum(fx.to_usd(float(t.amount), t.currency, CURRENT) for t in income.itertuples())
    months_elapsed = max(_days("2026-01-01", today) / 30.4375, 1.0)
    f["income_yield_pct"] = income_usd * (12 / months_elapsed) / aum_usd * 100 if aum_usd else 0.0
    ev["income_yield_pct"] = {
        "sources": ["raw.transactions"],
        "rows": len(income),
        "months_elapsed": months_elapsed,
    }

    # --- Leverage ----------------------------------------------------------------------
    facs = frames.credit_facilities.loc[frames.credit_facilities.client_id == client_id]
    if len(facs):
        snaps = frames.credit_facility_snapshots.loc[
            frames.credit_facility_snapshots.facility_id.isin(facs.facility_id)
        ]
        now = snaps.loc[snaps.snapshot_date == CURRENT].merge(facs, on="facility_id")
        now = now.assign(headroom_pts=now.margin_call_ltv_pct - now.ltv_pct)
        tight = now.sort_values("headroom_pts").iloc[0]
        march = snaps.loc[
            (snaps.snapshot_date == "2026-03-31") & (snaps.facility_id == tight.facility_id)
        ].iloc[0]
        f["ltv_pct"] = float(tight.ltv_pct)
        f["ltv_headroom_pts"] = float(tight.headroom_pts)
        f["ltv_change_since_march_pts"] = float(tight.ltv_pct - march.ltv_pct)
        f["facility_utilisation_pct"] = float(facs.utilisation_pct_current.max())
        ev["ltv_pct"] = {
            "sources": ["raw.credit_facility_snapshots"],
            "facility_id": tight.facility_id,
            "snapshot": CURRENT,
        }
        ev["ltv_headroom_pts"] = ev["ltv_pct"]
        ev["ltv_change_since_march_pts"] = {**ev["ltv_pct"], "snapshots": ["2026-03-31", CURRENT]}
        ev["facility_utilisation_pct"] = {
            "sources": ["raw.credit_facilities"],
            "facility_ids": sorted(facs.facility_id),
        }
    else:
        for k in [
            "ltv_pct",
            "ltv_headroom_pts",
            "ltv_change_since_march_pts",
            "facility_utilisation_pct",
        ]:
            f[k] = None
            ev[k] = {"sources": ["raw.credit_facilities"], "note": "client has no credit facility"}

    # --- Behaviour under stress (implied trades from position changes) ------------------
    added = reduced = turnover = 0.0
    changed_ids: list[str] = []
    for prev_d, next_d in pairwise(SNAPSHOT_DATES):
        prev = h_all.loc[h_all.snapshot_date == prev_d].set_index(["portfolio_id", "instrument_id"])
        nxt = h_all.loc[h_all.snapshot_date == next_d].set_index(["portfolio_id", "instrument_id"])
        keys = prev.index.union(nxt.index)
        for key in keys:
            q0 = float(prev.quantity.get(key, 0.0))
            q1 = float(nxt.quantity.get(key, 0.0))
            row = nxt.loc[key] if key in nxt.index else prev.loc[key]
            if row.asset_class == CASH or math.isclose(q0, q1, rel_tol=1e-9):
                continue
            delta_usd = (
                (q1 - q0) * float(row.price_local) * fx.usd_per_unit(row.instrument_ccy, next_d)
            )
            turnover += abs(delta_usd)
            changed_ids.append(f"{key[0]}/{next_d}/{key[1]}")
            if (prev_d, next_d) in STRESS_WINDOWS and row.asset_class in RISK_ASSET_CLASSES:
                if delta_usd > 0:
                    added += delta_usd
                else:
                    reduced += -delta_usd
    f["risk_added_in_stress_pct_aum"] = added / aum_usd * 100 if aum_usd else 0.0
    f["risk_reduced_in_stress_pct_aum"] = reduced / aum_usd * 100 if aum_usd else 0.0
    f["stress_behaviour_score"] = (
        (added - reduced) / (added + reduced) if (added + reduced) > 0 else 0.0
    )
    f["turnover_pct_aum"] = turnover / aum_usd * 100 if aum_usd else 0.0
    stress_ev: dict[str, object] = {
        "sources": ["raw.holdings"],
        "method": "quantity change between snapshots x price x FX",
        "windows": STRESS_WINDOWS,
        "changed_positions": changed_ids,
    }
    for k in [
        "risk_added_in_stress_pct_aum",
        "risk_reduced_in_stress_pct_aum",
        "stress_behaviour_score",
        "turnover_pct_aum",
    ]:
        ev[k] = stress_ev

    f["risk_asset_pct"] = pct_of_aum(h_now.asset_class.isin(RISK_ASSET_CLASSES))
    ev["risk_asset_pct"] = {
        "sources": ["raw.holdings"],
        "asset_classes": sorted(RISK_ASSET_CLASSES),
    }

    values = [
        float(h_all.loc[h_all.snapshot_date == d, "market_value_usd"].sum()) for d in SNAPSHOT_DATES
    ]
    peak, max_dd = values[0], 0.0
    for v in values[1:]:
        peak = max(peak, v)
        max_dd = max(max_dd, (peak - v) / peak * 100 if peak else 0.0)
    rets = [(b / a - 1) * 100 for a, b in pairwise(values) if a]
    f["max_drawdown_pct"] = max_dd
    f["value_volatility_pct"] = float(np.std(rets, ddof=0)) if rets else 0.0
    f["ytd_return_pct"] = (values[-1] / values[0] - 1) * 100 if values[0] else 0.0
    ts_ev = {
        "sources": ["raw.holdings"],
        "snapshots": SNAPSHOT_DATES,
        "household_value_usd": values,
    }
    ev["max_drawdown_pct"] = ev["value_volatility_pct"] = ev["ytd_return_pct"] = ts_ev

    # --- Concentration -----------------------------------------------------------------
    by_instr = h_now.groupby("instrument_id", as_index=False).agg(
        mv=("market_value_usd", "sum"), name=("instrument_name", "first")
    )
    by_instr = by_instr.merge(
        frames.instruments[["instrument_id", "concentration_limit_applies", "sector"]],
        on="instrument_id",
    )
    by_instr["w"] = by_instr.mv / aum_usd * 100 if aum_usd else 0.0
    single = by_instr.loc[by_instr.concentration_limit_applies.astype(bool)]
    top1 = single.sort_values("w", ascending=False).head(1)
    f["top1_single_line_pct"] = float(top1.w.iloc[0]) if len(top1) else 0.0
    ev["top1_single_line_pct"] = {
        "sources": ["raw.holdings", "raw.instruments"],
        "instrument_id": top1.instrument_id.iloc[0] if len(top1) else None,
        "aggregated_across_portfolios": True,
    }
    top3 = by_instr.sort_values("w", ascending=False).head(3)
    f["top3_weight_pct"] = float(top3.w.sum())
    ev["top3_weight_pct"] = {
        "sources": ["raw.holdings"],
        "instrument_ids": list(top3.instrument_id),
    }
    f["structured_product_pct"] = pct_of_aum(h_now.asset_class == "Structured Products")
    ev["structured_product_pct"] = {"sources": ["raw.holdings"]}
    sector = _sector_for_source(str(client.source_of_wealth))
    f["source_of_wealth_overlap_pct"] = (
        float(by_instr.loc[by_instr.sector == sector, "w"].sum()) if sector else 0.0
    )
    ev["source_of_wealth_overlap_pct"] = {
        "sources": ["raw.clients", "raw.holdings", "raw.instruments"],
        "matched_sector": sector,
        "method": "keyword heuristic on source_of_wealth",
    }

    # --- Horizon and turnover ----------------------------------------------------------
    ages = h_now.acquired_date.map(lambda d: _days(str(d), today) / 365.25)
    f["avg_holding_period_years"] = (
        float((ages * h_now.market_value_usd).sum() / aum_usd) if aum_usd else 0.0
    )
    ev["avg_holding_period_years"] = {"sources": ["raw.holdings"], "weighting": "market_value_usd"}
    f["illiquid_pct"] = pct_of_aum(h_now.liquidity_tier.isin(["Illiquid", "Quarterly Gate"]))
    ev["illiquid_pct"] = {"sources": ["raw.holdings"], "tiers": ["Illiquid", "Quarterly Gate"]}
    f["stated_horizon_years"] = float(client.investment_horizon_years)
    ev["stated_horizon_years"] = {"sources": ["raw.clients"]}

    # --- Governance and currency -------------------------------------------------------
    drift = 0.0
    breaches: list[dict[str, object]] = []
    managed = portfolios.loc[portfolios.service_model != "Custody"]
    for p in managed.itertuples(index=False):
        hp = h_now.loc[h_now.portfolio_id == p.portfolio_id]
        p_share = float(hp.market_value_usd.sum()) / aum_usd if aum_usd else 0.0
        bands = frames.mandates.loc[frames.mandates.mandate_code == p.mandate_code]
        weights = hp.groupby("asset_class").weight_pct.sum()
        for b in bands.itertuples(index=False):
            w = float(weights.get(b.asset_class, 0.0))
            excess = max(0.0, float(b.min_pct) - w) + max(0.0, w - float(b.max_pct))
            if excess > 0:
                drift += excess * p_share
                breaches.append(
                    {
                        "portfolio_id": p.portfolio_id,
                        "asset_class": b.asset_class,
                        "weight": round(w, 2),
                        "band": [float(b.min_pct), float(b.max_pct)],
                    }
                )
    f["mandate_drift_pts"] = drift
    ev["mandate_drift_pts"] = {
        "sources": ["raw.holdings", "raw.mandates", "raw.portfolios"],
        "breaches": breaches,
        "custody_excluded": True,
    }

    f["fx_mismatch_pct"] = pct_of_aum(h_now.instrument_ccy != client.base_currency)
    ev["fx_mismatch_pct"] = {
        "sources": ["raw.holdings", "raw.clients"],
        "base_currency": client.base_currency,
    }
    ccy_share = (
        h_now.groupby("instrument_ccy").market_value_usd.sum() / aum_usd * 100
        if aum_usd
        else pd.Series(dtype=float)
    )
    total_needs_usd = 0.0
    mismatched_usd = 0.0
    for n in needs.itertuples(index=False):
        amt = fx.to_usd(float(n.amount), n.currency, CURRENT)
        total_needs_usd += amt
        if float(ccy_share.get(n.currency, 0.0)) < 20.0:
            mismatched_usd += amt
    f["obligation_ccy_mismatch_pct"] = (
        mismatched_usd / total_needs_usd * 100 if total_needs_usd else 0.0
    )
    ev["obligation_ccy_mismatch_pct"] = {
        "sources": ["raw.planned_cash_needs", "raw.holdings"],
        "threshold_pct_held": 20,
        "asset_ccy_shares": {k: round(float(v), 1) for k, v in ccy_share.items()},
    }

    f["age"] = _none_if_nan(float(client.age)) if pd.notna(client.age) else None
    f["stated_risk_score"] = float(client.risk_tolerance_score)
    ev["age"] = ev["stated_risk_score"] = {"sources": ["raw.clients"]}

    ordered: dict[str, float | None] = {}
    for name in FEATURE_NAMES:
        value = f.get(name)
        ordered[name] = None if value is None else round(float(value), 4)
    return ClientVector(client_id=client_id, features=ordered, evidence=ev)


def percentiles(vectors: list[ClientVector]) -> dict[str, dict[str, float | None]]:
    """Percentile rank (0-100) of each client's value among non-null values in the book."""
    out: dict[str, dict[str, float | None]] = {v.client_id: {} for v in vectors}
    for name in FEATURE_NAMES:
        vals = [(v.client_id, v.features[name]) for v in vectors if v.features[name] is not None]
        arr = np.array([x for _, x in vals], dtype=float)
        for cid, x in vals:
            assert x is not None
            out[cid][name] = round(float((arr < x).mean() * 100 + (arr == x).mean() * 50), 1)
        for v in vectors:
            if v.features[name] is None:
                out[v.client_id][name] = None
    return out
