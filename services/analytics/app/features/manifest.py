"""The behavioural feature manifest. Order is the vector order; names are stable API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Rubric = Literal["capacity", "appetite", "horizon", "context"]

ENGINE_VERSION = "vector-engine/0.1.0"


class Feature(BaseModel):
    name: str
    label: str
    unit: str
    description: str
    rubric: Rubric
    higher_means: str
    group: str


MANIFEST: list[Feature] = [
    # Liquidity and cash flow → Risk Capacity
    Feature(
        name="cash_pct",
        label="Cash share",
        unit="%",
        description="Cash and equivalents as a share of all household assets at the current snapshot.",
        rubric="capacity",
        higher_means="More capacity to absorb losses and fund needs without selling.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="cash_pct_change_ytd",
        label="Cash share change YTD",
        unit="pts",
        description="Change in cash share between the 31 Dec 2025 baseline and today.",
        rubric="capacity",
        higher_means="Client has been building cash; negative means cash is being consumed.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="liquidity_runway_months",
        label="Liquidity runway",
        unit="months",
        description="Daily-liquid assets divided by the monthly average of confirmed and likely cash needs in the next 12 months. Capped at 120.",
        rubric="capacity",
        higher_means="Longer runway before illiquid assets must be sold.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="cash_needs_12m_pct_aum",
        label="Cash needs next 12m",
        unit="% AUM",
        description="Confirmed and likely cash needs falling due in the next 12 months as a share of household AUM.",
        rubric="capacity",
        higher_means="Larger near-term claims on the portfolio, lower capacity.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="days_to_next_cash_need",
        label="Days to next cash need",
        unit="days",
        description="Days from today to the start of the earliest planned cash need not yet begun. Recurring needs already running count as zero.",
        rubric="capacity",
        higher_means="More time before the next liability.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="withdrawal_count_ytd",
        label="Withdrawals YTD",
        unit="count",
        description="Number of withdrawal transactions in 2026 across all portfolios.",
        rubric="capacity",
        higher_means="More frequent drawings on the portfolio.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="withdrawal_pct_aum_ytd",
        label="Withdrawals YTD",
        unit="% AUM",
        description="Sum of withdrawals in 2026 as a share of current household AUM.",
        rubric="capacity",
        higher_means="Portfolio is funding lifestyle or obligations; lower capacity.",
        group="Liquidity and cash flow",
    ),
    Feature(
        name="income_yield_pct",
        label="Income yield (annualised)",
        unit="% p.a.",
        description="Dividends, coupons, interest and distributions received in 2026, annualised, as a share of AUM.",
        rubric="capacity",
        higher_means="More of the client's needs can be met from income rather than sales.",
        group="Liquidity and cash flow",
    ),
    # Leverage → Risk Capacity
    Feature(
        name="ltv_pct",
        label="Loan-to-value",
        unit="%",
        description="Highest current LTV across the client's credit facilities. Empty when the client has no facility.",
        rubric="capacity",
        higher_means="Closer to a margin call; lower capacity.",
        group="Leverage",
    ),
    Feature(
        name="ltv_headroom_pts",
        label="Headroom to margin call",
        unit="pts",
        description="Margin-call trigger minus current LTV for the tightest facility.",
        rubric="capacity",
        higher_means="More room before collateral action is forced.",
        group="Leverage",
    ),
    Feature(
        name="ltv_change_since_march_pts",
        label="LTV change since 31 Mar",
        unit="pts",
        description="Current LTV minus LTV at the 31 Mar 2026 snapshot for the tightest facility.",
        rubric="capacity",
        higher_means="Leverage is rising into volatility.",
        group="Leverage",
    ),
    Feature(
        name="facility_utilisation_pct",
        label="Facility utilisation",
        unit="%",
        description="Drawn amount as a share of the credit limit, highest across facilities.",
        rubric="capacity",
        higher_means="Less undrawn credit available as a buffer.",
        group="Leverage",
    ),
    # Behaviour under stress → Risk Appetite
    Feature(
        name="risk_added_in_stress_pct_aum",
        label="Risk added in stress",
        unit="% AUM",
        description="Value of increases in equity, structured-product, commodity and alternative positions between 27 Feb and 30 Jun 2026 (the conflict and technology drawdown windows), inferred from position changes and subscriptions.",
        rubric="appetite",
        higher_means="Client bought into the drawdowns.",
        group="Behaviour under stress",
    ),
    Feature(
        name="risk_reduced_in_stress_pct_aum",
        label="Risk reduced in stress",
        unit="% AUM",
        description="Value of decreases in risk-asset positions over the same windows.",
        rubric="appetite",
        higher_means="Client sold into the drawdowns; flight to safety.",
        group="Behaviour under stress",
    ),
    Feature(
        name="stress_behaviour_score",
        label="Stress behaviour",
        unit="-1..+1",
        description="(added minus reduced) over (added plus reduced). +1 bought dips, -1 sold dips, 0 held the line or did nothing.",
        rubric="appetite",
        higher_means="More aggressive behaviour when markets fell.",
        group="Behaviour under stress",
    ),
    Feature(
        name="risk_asset_pct",
        label="Risk-asset share",
        unit="%",
        description="Equity, structured products, commodities and alternatives as a share of household assets.",
        rubric="appetite",
        higher_means="Structurally higher risk allocation.",
        group="Behaviour under stress",
    ),
    Feature(
        name="max_drawdown_pct",
        label="Realised max drawdown",
        unit="%",
        description="Largest peak-to-trough fall in household USD value across the five snapshots. Includes flows, so read alongside withdrawals.",
        rubric="appetite",
        higher_means="Client has lived through a deeper fall this year.",
        group="Behaviour under stress",
    ),
    Feature(
        name="value_volatility_pct",
        label="Snapshot volatility",
        unit="%",
        description="Standard deviation of snapshot-to-snapshot household USD returns.",
        rubric="appetite",
        higher_means="A bumpier ride.",
        group="Behaviour under stress",
    ),
    Feature(
        name="ytd_return_pct",
        label="YTD change in value",
        unit="%",
        description="Household USD value today versus the 31 Dec 2025 baseline. Includes flows.",
        rubric="context",
        higher_means="Portfolio grew (or received inflows).",
        group="Behaviour under stress",
    ),
    # Concentration → Risk Appetite
    Feature(
        name="top1_single_line_pct",
        label="Largest single-line exposure",
        unit="%",
        description="Largest household weight in one instrument to which the concentration limit applies (single names, single assets), aggregated across portfolios.",
        rubric="appetite",
        higher_means="Willingness to hold a concentrated bet.",
        group="Concentration",
    ),
    Feature(
        name="top3_weight_pct",
        label="Top-3 holdings",
        unit="%",
        description="Combined household weight of the three largest instruments.",
        rubric="appetite",
        higher_means="Less diversified.",
        group="Concentration",
    ),
    Feature(
        name="structured_product_pct",
        label="Structured products",
        unit="%",
        description="Structured products as a share of household assets.",
        rubric="appetite",
        higher_means="More payoff complexity and issuer risk accepted.",
        group="Concentration",
    ),
    Feature(
        name="source_of_wealth_overlap_pct",
        label="Overlap with source of wealth",
        unit="%",
        description="Household weight in the sector that matches the client's source of wealth (keyword heuristic). The portfolio and the operating business are the same bet to this extent.",
        rubric="appetite",
        higher_means="Portfolio does not diversify the client's real economic exposure.",
        group="Concentration",
    ),
    # Horizon and turnover → Investment Horizon
    Feature(
        name="avg_holding_period_years",
        label="Average holding period",
        unit="years",
        description="Market-value-weighted years since acquisition of current positions.",
        rubric="horizon",
        higher_means="Buy-and-hold behaviour; longer effective horizon.",
        group="Horizon and turnover",
    ),
    Feature(
        name="turnover_pct_aum",
        label="Implied turnover",
        unit="% AUM",
        description="Absolute value of inferred position changes across all snapshot intervals, as a share of AUM.",
        rubric="horizon",
        higher_means="More trading; shorter effective horizon.",
        group="Horizon and turnover",
    ),
    Feature(
        name="illiquid_pct",
        label="Illiquid and gated",
        unit="%",
        description="Illiquid and quarterly-gated positions as a share of household assets.",
        rubric="horizon",
        higher_means="Capital committed for the long term whether or not the client intends it.",
        group="Horizon and turnover",
    ),
    Feature(
        name="stated_horizon_years",
        label="Stated horizon",
        unit="years",
        description="Investment horizon recorded on the client file.",
        rubric="horizon",
        higher_means="Client says they can wait longer.",
        group="Horizon and turnover",
    ),
    # Context
    Feature(
        name="mandate_drift_pts",
        label="Mandate drift",
        unit="pts",
        description="Sum of percentage points outside the mandate's asset-class bands across managed portfolios, weighted by each portfolio's share of household assets. Custody accounts excluded.",
        rubric="context",
        higher_means="Portfolios sit further outside their agreed bands.",
        group="Governance and currency",
    ),
    Feature(
        name="fx_mismatch_pct",
        label="Assets outside base currency",
        unit="%",
        description="Share of household assets denominated in a currency other than the client's base currency.",
        rubric="context",
        higher_means="More reporting-currency volatility.",
        group="Governance and currency",
    ),
    Feature(
        name="obligation_ccy_mismatch_pct",
        label="Needs in currencies not held",
        unit="%",
        description="Share of planned cash needs (by USD amount) in a currency where the client holds under 20% of assets.",
        rubric="context",
        higher_means="Obligations must be funded through FX conversion.",
        group="Governance and currency",
    ),
    Feature(
        name="age",
        label="Age",
        unit="years",
        description="Client age. Empty for entities.",
        rubric="context",
        higher_means="",
        group="Client file",
    ),
    Feature(
        name="stated_risk_score",
        label="Stated risk tolerance",
        unit="1-10",
        description="Risk tolerance score recorded on the client file. Shown so behaviour can be compared with what the client says.",
        rubric="context",
        higher_means="Client says they accept more risk.",
        group="Client file",
    ),
]

FEATURE_NAMES: list[str] = [f.name for f in MANIFEST]
