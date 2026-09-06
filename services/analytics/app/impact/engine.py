"""Stress engine: apply a factor shock to a client's household at a snapshot."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

import psycopg
from pydantic import BaseModel, Field

from app.features.fx import Fx
from app.impact.models import price_instrument
from app.impact.shock import Severity, Shock

ENGINE_VERSION = "impact-engine/0.1.0"
NEED_CERTAINTIES = {"Confirmed", "Likely"}


class ImpactLine(BaseModel):
    portfolio_id: str
    instrument_id: str
    name: str
    asset_class: str
    currency: str
    mv_usd: float
    rates_usd: float
    credit_usd: float
    equity_usd: float
    fx_usd: float
    commodity_usd: float
    total_usd: float
    total_pct: float
    model: str
    parameters: dict[str, Any]


class Collateral(BaseModel):
    facility_id: str
    drawn: float
    lending_value_before: float
    lending_value_after: float
    ltv_before_pct: float
    ltv_after_pct: float
    margin_call_ltv_pct: float
    breached_after: bool
    shortfall_ccy: float


class Liquidity(BaseModel):
    daily_liquid_before_usd: float
    daily_liquid_after_usd: float
    needs_12m_usd: float
    coverage_before: float | None
    coverage_after: float | None


class Coverage(BaseModel):
    modelled_pct_of_aum: float
    unmodelled_usd: float
    unmodelled_names: list[str]


class Confidence(BaseModel):
    point: float
    low_usd: float
    high_usd: float
    notes: list[str]


class ImpactResult(BaseModel):
    run_id: str | None = None
    engine_version: str = ENGINE_VERSION
    client_id: str
    snapshot_date: str
    severity: Severity
    shock: Shock
    start_usd: float
    stressed_usd: float
    total_usd: float
    total_pct: float
    by_factor: dict[str, float]
    by_asset_class: list[dict[str, Any]]
    lines: list[ImpactLine]
    collateral: list[Collateral]
    liquidity: Liquidity
    coverage: Coverage
    confidence: Confidence
    assumptions: list[str] = Field(default_factory=list)


ASSUMPTIONS = [
    "Fixed income: modified duration x parallel yield shift in the instrument's currency; duration from maturity where the name states it, else a sub-asset-class default. Credit funds add spread duration x spread shock.",
    "Equity: beta-adjusted regional index move (single names 1.2, diversified funds 1.0) plus a sector overlay.",
    "Structured products: decomposed into look-through legs; yield-enhancement notes take full downside and 15% of upside, accumulators double the downside, capital-protected notes take no downside.",
    "FX: every non-USD position is revalued by the shock to its currency against USD; results are in USD.",
    "Private equity and real estate are not revalued: their marks lag by a quarter, so the true impact arrives later and is flagged rather than estimated.",
    "Collateral: lending value is recomputed as post-shock market value x advance rate per position; LTV = drawn / lending value.",
    "Shocks from several signals are added together. Severity scales the whole vector (mild x0.5, base x1, severe x2).",
    "Modelled estimates only. They are not forecasts and carry the confidence band shown.",
]


def _load(conn: psycopg.Connection[Any], client_id: str, snapshot: str) -> dict[str, Any]:
    q: dict[str, str] = {
        "holdings": "SELECT * FROM raw.holdings WHERE client_id=%s AND snapshot_date=%s",
        "instruments": "SELECT * FROM raw.instruments",
        "legs": "SELECT * FROM derived.lookthrough_legs",
        "facilities": (
            "SELECT f.*, s.drawn, s.lending_value, s.ltv_pct FROM raw.credit_facilities f"
            " JOIN raw.credit_facility_snapshots s ON s.facility_id=f.facility_id"
            " WHERE f.client_id=%s AND s.snapshot_date=%s"
        ),
        "needs": "SELECT * FROM raw.planned_cash_needs WHERE client_id=%s",
        "fx": "SELECT snapshot_date, series_id, value FROM raw.market_context WHERE category='FX'",
    }
    out: dict[str, Any] = {}
    with conn.cursor() as cur:
        for k, sql in q.items():
            params = (
                (client_id, snapshot)
                if "%s" in sql and sql.count("%s") == 2
                else ((client_id,) if "%s" in sql else ())
            )
            cur.execute(sql, params)
            out[k] = cur.fetchall()
    return out


def run_impact(
    conn: psycopg.Connection[Any],
    client_id: str,
    snapshot: str,
    shock: Shock,
    severity: Severity,
    today: str,
) -> ImpactResult:
    data = _load(conn, client_id, snapshot)
    holdings: list[dict[str, Any]] = data["holdings"]
    if not holdings:
        msg = f"no holdings for {client_id} at {snapshot}"
        raise ValueError(msg)
    instruments = {r["instrument_id"]: r for r in data["instruments"]}
    legs_by: dict[str, list[dict[str, Any]]] = {}
    for leg in data["legs"]:
        legs_by.setdefault(leg["instrument_id"], []).append({**leg, "weight": float(leg["weight"])})
    fx = Fx(_fx_frame(data["fx"]))
    as_of_year = date.fromisoformat(snapshot).year

    lines: list[ImpactLine] = []
    post_mv: dict[tuple[str, str], float] = {}
    unmodelled_usd = 0.0
    unmodelled_names: list[str] = []
    for h in holdings:
        inst = instruments[h["instrument_id"]]
        mv = float(h["market_value_usd"])
        priced = price_instrument(
            name=h["instrument_name"],
            asset_class=h["asset_class"],
            sub_asset_class=h["sub_asset_class"],
            sector=h["sector"],
            region=h["region"],
            concentration_applies=bool(inst["concentration_limit_applies"]),
            legs=legs_by.get(h["instrument_id"], []),
            shock=shock,
            currency=h["instrument_ccy"],
            as_of_year=as_of_year,
        )
        local_pct = priced.rates_pct + priced.credit_pct + priced.equity_pct + priced.commodity_pct
        fx_pct = (
            shock.fx_pct_vs_usd.get(h["instrument_ccy"], 0.0)
            if h["instrument_ccy"] != "USD"
            else 0.0
        )
        # USD value after: mv x (1 + local) x (1 + fx); attribute the cross term to FX.
        after = mv * (1 + local_pct / 100) * (1 + fx_pct / 100)
        fx_usd = after - mv * (1 + local_pct / 100)
        rates_usd = mv * priced.rates_pct / 100
        credit_usd = mv * priced.credit_pct / 100
        equity_usd = mv * priced.equity_pct / 100
        commodity_usd = mv * priced.commodity_pct / 100
        total = after - mv
        if priced.model.startswith(
            (
                "private mark",
                "unmodelled",
                "structured product without",
                "alternative: assumed",
                "macro hedge",
            )
        ):
            unmodelled_usd += mv
            unmodelled_names.append(h["instrument_name"])
        post_mv[(h["portfolio_id"], h["instrument_id"])] = after
        lines.append(
            ImpactLine(
                portfolio_id=h["portfolio_id"],
                instrument_id=h["instrument_id"],
                name=h["instrument_name"],
                asset_class=h["asset_class"],
                currency=h["instrument_ccy"],
                mv_usd=round(mv, 2),
                rates_usd=round(rates_usd, 2),
                credit_usd=round(credit_usd, 2),
                equity_usd=round(equity_usd, 2),
                fx_usd=round(fx_usd, 2),
                commodity_usd=round(commodity_usd, 2),
                total_usd=round(total, 2),
                total_pct=round(total / mv * 100, 3) if mv else 0.0,
                model=priced.model,
                parameters=priced.parameters or {},
            )
        )

    start = sum(ln.mv_usd for ln in lines)
    total = sum(ln.total_usd for ln in lines)
    by_factor = {
        "rates": round(sum(ln.rates_usd for ln in lines), 2),
        "credit": round(sum(ln.credit_usd for ln in lines), 2),
        "equity": round(sum(ln.equity_usd for ln in lines), 2),
        "fx": round(sum(ln.fx_usd for ln in lines), 2),
        "commodity": round(sum(ln.commodity_usd for ln in lines), 2),
    }
    by_class: dict[str, dict[str, float]] = {}
    for ln in lines:
        c = by_class.setdefault(ln.asset_class, {"mv_usd": 0.0, "impact_usd": 0.0})
        c["mv_usd"] += ln.mv_usd
        c["impact_usd"] += ln.total_usd
    by_asset_class = [
        {
            "asset_class": k,
            "mv_usd": round(v["mv_usd"], 2),
            "impact_usd": round(v["impact_usd"], 2),
            "impact_pct": round(v["impact_usd"] / v["mv_usd"] * 100, 3) if v["mv_usd"] else 0.0,
        }
        for k, v in sorted(by_class.items(), key=lambda kv: kv[1]["impact_usd"])
    ]

    # Collateral: recompute lending value from post-shock market values in portfolio base currency.
    collateral: list[Collateral] = []
    for f in data["facilities"]:
        pid = f["collateral_portfolio_id"]
        lv_after_usd = 0.0
        for h in holdings:
            if h["portfolio_id"] != pid:
                continue
            after_usd = post_mv[(pid, h["instrument_id"])]
            lv_after_usd += after_usd * float(h["advance_rate_pct"]) / 100
        # Facility figures are in facility currency; convert the USD lending value back.
        lv_after = lv_after_usd / fx.usd_per_unit(f["facility_ccy"], snapshot)
        drawn = float(f["drawn"])
        lv_before = float(f["lending_value"])
        ltv_after = drawn / lv_after * 100 if lv_after else 999.0
        trigger = float(f["margin_call_ltv_pct"])
        shortfall = max(0.0, drawn - lv_after * trigger / 100)
        collateral.append(
            Collateral(
                facility_id=f["facility_id"],
                drawn=drawn,
                lending_value_before=round(lv_before, 2),
                lending_value_after=round(lv_after, 2),
                ltv_before_pct=round(float(f["ltv_pct"]), 2),
                ltv_after_pct=round(ltv_after, 2),
                margin_call_ltv_pct=trigger,
                breached_after=ltv_after > trigger,
                shortfall_ccy=round(shortfall, 2),
            )
        )

    daily_before = sum(
        ln.mv_usd for ln, h in zip(lines, holdings, strict=True) if h["liquidity_tier"] == "Daily"
    )
    daily_after = sum(
        post_mv[(h["portfolio_id"], h["instrument_id"])]
        for h in holdings
        if h["liquidity_tier"] == "Daily"
    )
    needs_12m = _needs_12m(data["needs"], fx, snapshot, today)
    liquidity = Liquidity(
        daily_liquid_before_usd=round(daily_before, 2),
        daily_liquid_after_usd=round(daily_after, 2),
        needs_12m_usd=round(needs_12m, 2),
        coverage_before=round(daily_before / needs_12m, 2) if needs_12m else None,
        coverage_after=round(daily_after / needs_12m, 2) if needs_12m else None,
    )

    modelled_pct = (start - unmodelled_usd) / start * 100 if start else 0.0
    # Confidence: coverage of the book by a model, penalised for stacked/severe shocks.
    point = 0.85 * modelled_pct / 100
    if severity == "severe":
        point -= 0.1
    point = round(max(0.3, min(0.9, point)), 2)
    band = abs(total) * (1 - point)
    confidence = Confidence(
        point=point,
        low_usd=round(total - band, 2),
        high_usd=round(total + band, 2),
        notes=[
            f"{modelled_pct:.0f}% of the household value has a pricing model; {len(unmodelled_names)} positions are carried flat.",
            "Band widens with the share of unmodelled assets and with severe scenarios.",
        ],
    )

    return ImpactResult(
        client_id=client_id,
        snapshot_date=snapshot,
        severity=severity,
        shock=shock,
        start_usd=round(start, 2),
        stressed_usd=round(start + total, 2),
        total_usd=round(total, 2),
        total_pct=round(total / start * 100, 3) if start else 0.0,
        by_factor=by_factor,
        by_asset_class=by_asset_class,
        lines=sorted(lines, key=lambda ln: ln.total_usd),
        collateral=collateral,
        liquidity=liquidity,
        coverage=Coverage(
            modelled_pct_of_aum=round(modelled_pct, 1),
            unmodelled_usd=round(unmodelled_usd, 2),
            unmodelled_names=unmodelled_names,
        ),
        confidence=confidence,
        assumptions=ASSUMPTIONS,
    )


def _fx_frame(rows: list[dict[str, Any]]) -> Any:
    import pandas as pd

    return pd.DataFrame(
        [
            {
                "snapshot_date": str(r["snapshot_date"]),
                "series_id": r["series_id"],
                "value": float(r["value"]),
            }
            for r in rows
        ]
    )


def _add_months(d: date, months: int) -> date:
    """Calendar-month offset matching the API's addMonths (day clamped to month end)."""
    import calendar

    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return d.replace(year=year, month=month, day=min(d.day, calendar.monthrange(year, month)[1]))


def _needs_12m(needs: list[dict[str, Any]], fx: Fx, snapshot: str, today: str) -> float:
    t = date.fromisoformat(today)
    horizon_end = _add_months(t, 12)
    total = 0.0
    for n in needs:
        if n["certainty"] not in NEED_CERTAINTIES:
            continue
        due_from = date.fromisoformat(str(n["due_from"]))
        due_to = date.fromisoformat(str(n["due_to"]))
        if due_from > horizon_end or due_to < t:
            continue
        amt = fx.to_usd(float(n["amount"]), n["currency"], snapshot)
        rec = str(n["recurrence"]).lower()
        if "annual" in rec or rec == "one-off":
            total += amt
        else:
            window = max((due_to - due_from).days, 1)
            overlap = max(0, min((horizon_end - due_from).days, window))
            total += amt * overlap / window
    return total


def persist_run(
    conn: psycopg.Connection[Any], result: ImpactResult, request: dict[str, Any], label: str | None
) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO derived.impact_runs (client_id, snapshot_date, label, request, result, engine_version)"
            " VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s) RETURNING id",
            (
                result.client_id,
                result.snapshot_date,
                label,
                json.dumps(request),
                result.model_dump_json(),
                ENGINE_VERSION,
            ),
        )
        row = cur.fetchone()
        assert row is not None
        conn.commit()
        return str(row["id"])
