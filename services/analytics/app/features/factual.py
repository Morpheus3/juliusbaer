"""The normalised factual record for a client: what the file says, plus derived flags."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from app.data.frames import Frames
from app.features.fx import Fx


def _days(from_iso: str, to_iso: str) -> int:
    return (date.fromisoformat(to_iso) - date.fromisoformat(from_iso)).days


def _num(x: Any) -> float | None:
    return None if x is None or pd.isna(x) else float(x)


def compute_client_factual(frames: Frames, fx: Fx, client_id: str, today: str) -> dict[str, object]:
    c = frames.clients.loc[frames.clients.client_id == client_id].iloc[0]
    portfolios = frames.portfolios.loc[frames.portfolios.client_id == client_id]
    holdings = frames.holdings.loc[frames.holdings.client_id == client_id]
    aum_now = float(
        holdings.loc[holdings.snapshot_date == frames.current, "market_value_usd"].sum()
    )
    aum_base = float(
        holdings.loc[holdings.snapshot_date == frames.baseline, "market_value_usd"].sum()
    )
    notes = frames.rm_notes.loc[frames.rm_notes.client_id == client_id].sort_values("note_date")
    last_contact = str(notes.note_date.iloc[-1]) if len(notes) else None
    needs = frames.planned_cash_needs.loc[frames.planned_cash_needs.client_id == client_id]
    facs = frames.credit_facilities.loc[frames.credit_facilities.client_id == client_id]
    fac_now = frames.credit_facility_snapshots.loc[
        frames.credit_facility_snapshots.facility_id.isin(facs.facility_id)
        & (frames.credit_facility_snapshots.snapshot_date == frames.current)
    ]
    commits = frames.commitments.loc[frames.commitments.client_id == client_id]
    kyc_days = _days(today, str(c.kyc_review_due))

    return {
        "client_id": client_id,
        "name": c.client_name,
        "is_entity": c.gender == "Entity",
        "age": _num(c.age),
        "gender": None if c.gender == "Entity" else c.gender,
        "nationality": c.nationality,
        "country_of_residence": c.country_of_residence,
        "tax_domicile": c.tax_domicile,
        "domicile_differs_from_residence": c.tax_domicile != c.country_of_residence,
        "booking_centre": c.booking_centre,
        "base_currency": c.base_currency,
        "reporting_language": c.reporting_language,
        "wealth_band": c.wealth_band,
        "life_stage": c.life_stage,
        "source_of_wealth": c.source_of_wealth,
        "objectives": [o.strip() for o in str(c.objectives).split(";") if o.strip()],
        "stated_risk_profile": c.risk_profile,
        "stated_risk_score": int(c.risk_tolerance_score),
        "stated_horizon_years": int(c.investment_horizon_years),
        "stated_liquidity_needs": c.liquidity_needs,
        "client_since": str(c.client_since),
        "relationship_years": round(_days(str(c.client_since), today) / 365.25, 1),
        "kyc_review_due": str(c.kyc_review_due),
        "kyc_days_to_due": kyc_days,
        "kyc_status": "overdue" if kyc_days < 0 else ("due_soon" if kyc_days <= 45 else "current"),
        "pep": bool(c.pep_status),
        "aum_usd_current": round(aum_now, 2),
        "aum_usd_baseline": round(aum_base, 2),
        "portfolios": [
            {
                "portfolio_id": p.portfolio_id,
                "name": p.portfolio_name,
                "mandate_code": p.mandate_code,
                "mandate_name": p.mandate_name,
                "service_model": p.service_model,
                "base_currency": p.base_currency,
                "aum_usd_current": float(p.aum_usd_current),
                "managed": p.service_model != "Custody",
            }
            for p in portfolios.itertuples(index=False)
        ],
        "credit_facilities": [
            {
                "facility_id": r.facility_id,
                "type": r.facility_type,
                "currency": r.facility_ccy,
                "limit": float(r.credit_limit),
                "drawn": float(r.drawn),
                "ltv_pct": float(r.ltv_pct),
                "margin_call_ltv_pct": float(r.margin_call_ltv_pct),
                "headroom": float(r.headroom),
            }
            for r in fac_now.merge(facs, on="facility_id").itertuples(index=False)
        ],
        "commitments_uncalled_usd": float(commits.uncalled.sum()) if len(commits) else 0.0,
        "planned_cash_needs": [
            {
                "need_id": n.need_id,
                "description": n.description,
                "currency": n.currency,
                "amount": float(n.amount),
                "amount_usd": round(fx.to_usd(float(n.amount), n.currency, frames.current), 2),
                "due_from": str(n.due_from),
                "due_to": str(n.due_to),
                "recurrence": n.recurrence,
                "certainty": n.certainty,
                "days_until_due_from": _days(today, str(n.due_from)),
            }
            for n in needs.sort_values("due_from").itertuples(index=False)
        ],
        "notes_count": len(notes),
        "last_contact_date": last_contact,
        "days_since_last_contact": _days(last_contact, today) if last_contact else None,
        "last_contact_channel": str(notes.channel.iloc[-1]) if len(notes) else None,
    }
