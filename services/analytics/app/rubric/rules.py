"""Rules assessor: explicit thresholds over the behavioural vector. Every contribution is returned
so the RM can see exactly which fact moved the score."""

from __future__ import annotations

from pydantic import BaseModel

from app.rubric.definitions import Dimension


class Contribution(BaseModel):
    rule: str
    feature: str
    value: float | None
    effect: float
    note: str


class RulesResult(BaseModel):
    score: int
    raw: float
    contributions: list[Contribution]


def _clamp(x: float) -> int:
    return int(max(1, min(3, round(x))))


def _val(f: dict[str, float | None], name: str) -> float | None:
    v = f.get(name)
    return None if v is None else float(v)


def assess_rules(dimension: Dimension, f: dict[str, float | None]) -> RulesResult:
    c: list[Contribution] = []

    def add(rule: str, feature: str, effect: float, note: str) -> None:
        c.append(
            Contribution(
                rule=rule, feature=feature, value=_val(f, feature), effect=effect, note=note
            )
        )

    if dimension == "capacity":
        cash = _val(f, "cash_pct") or 0.0
        base = 1.0 if cash < 5 else (2.0 if cash <= 15 else 3.0)
        add("cash buffer band", "cash_pct", base, "under 5% → 1, 5-15% → 2, over 15% → 3")
        w = _val(f, "withdrawal_count_ytd") or 0.0
        if w >= 2:
            add(
                "repeated withdrawals",
                "withdrawal_count_ytd",
                -1.0,
                "two or more withdrawals this year",
            )
        runway = _val(f, "liquidity_runway_months")
        if runway is not None and runway < 12:
            add(
                "liquidity runway under 12 months",
                "liquidity_runway_months",
                -1.0,
                "daily-liquid assets cover less than a year of firm needs",
            )
        elif runway is not None and runway >= 60:
            add(
                "liquidity runway over 5 years",
                "liquidity_runway_months",
                0.5,
                "ample sellable assets against dated needs",
            )
        head = _val(f, "ltv_headroom_pts")
        if head is not None and head < 5:
            add("margin-call proximity", "ltv_headroom_pts", -1.0, "under 5 points of LTV headroom")
        needs = _val(f, "cash_needs_12m_pct_aum") or 0.0
        if needs > 25:
            add(
                "heavy near-term claims",
                "cash_needs_12m_pct_aum",
                -1.0,
                "over 25% of AUM due within 12 months",
            )
        yld = _val(f, "income_yield_pct") or 0.0
        if yld >= 4:
            add(
                "income covers needs",
                "income_yield_pct",
                0.5,
                "portfolio income of 4% or more reduces forced selling",
            )
    elif dimension == "appetite":
        risk = _val(f, "risk_asset_pct") or 0.0
        base = 1.0 if risk < 35 else (2.0 if risk <= 65 else 3.0)
        add(
            "risk-asset share band",
            "risk_asset_pct",
            base,
            "under 35% → 1, 35-65% → 2, over 65% → 3",
        )
        sb = _val(f, "stress_behaviour_score") or 0.0
        if sb > 0.3:
            add(
                "bought into drawdowns",
                "stress_behaviour_score",
                1.0,
                "added risk assets during the 2026 stress windows",
            )
        elif sb < -0.3:
            add(
                "sold into drawdowns",
                "stress_behaviour_score",
                -1.0,
                "reduced risk assets during the stress windows",
            )
        top1 = _val(f, "top1_single_line_pct") or 0.0
        if top1 > 15:
            add(
                "concentrated single line",
                "top1_single_line_pct",
                0.5,
                "largest single-name exposure above 15%",
            )
        sp = _val(f, "structured_product_pct") or 0.0
        if sp > 10:
            add(
                "structured products",
                "structured_product_pct",
                0.5,
                "more than 10% in notes with payoff complexity",
            )
        head = _val(f, "ltv_change_2_snapshots_pts")
        if head is not None and head > 5:
            add(
                "leverage rising into volatility",
                "ltv_change_2_snapshots_pts",
                0.5,
                "LTV up more than 5 points over the last two snapshots",
            )
    else:
        stated = _val(f, "stated_horizon_years") or 0.0
        base = 1.0 if stated < 3 else (2.0 if stated <= 7 else 3.0)
        add(
            "stated horizon band",
            "stated_horizon_years",
            base,
            "under 3 years → 1, 3-7 → 2, over 7 → 3",
        )
        hold = _val(f, "avg_holding_period_years")
        if hold is not None and hold < 3:
            add(
                "short holding periods",
                "avg_holding_period_years",
                -1.0,
                "average position age under 3 years",
            )
        turn = _val(f, "turnover_pct_aum") or 0.0
        if turn > 20:
            add(
                "high implied turnover",
                "turnover_pct_aum",
                -1.0,
                "position changes above 20% of AUM this year",
            )
        days = _val(f, "days_to_next_cash_need")
        if days is not None and days == 0:
            add(
                "recurring withdrawals already running",
                "days_to_next_cash_need",
                -1.0,
                "portfolio is funding current spending",
            )
        needs = _val(f, "cash_needs_12m_pct_aum") or 0.0
        if needs > 20:
            add(
                "large dated need inside 12 months",
                "cash_needs_12m_pct_aum",
                -1.0,
                "a sizeable liability falls due within a year",
            )
        age = _val(f, "age")
        if age is not None and age >= 70:
            add("age 70 or over", "age", -1.0, "effective horizon shortened by age")
        ill = _val(f, "illiquid_pct") or 0.0
        if ill > 30:
            add(
                "locked-up capital",
                "illiquid_pct",
                0.0,
                "over 30% illiquid: the horizon is long whether intended or not (flag only)",
            )

    raw = sum(x.effect for x in c)
    return RulesResult(score=_clamp(raw), raw=round(raw, 2), contributions=c)
