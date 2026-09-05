"""Named scenarios. Each is a stated view, not a forecast; the RM picks the severity."""

from __future__ import annotations

from pydantic import BaseModel

from app.impact.shock import Shock


class Scenario(BaseModel):
    id: str
    name: str
    description: str
    shock: Shock
    horizon_days: int
    probability_note: str


SCENARIOS: list[Scenario] = [
    Scenario(
        id="hormuz-reopens",
        name="Strait of Hormuz reopens",
        description="Ceasefire holds, tanker traffic normalises, energy risk premium unwinds. Energy and shipping give back gains; risk assets and Asian currencies recover; gold and duration lose their safe-haven bid.",
        shock=Shock(
            brent_pct=-25,
            equity_pct={"global": 3, "asia_ex_japan": 4, "greater_china": 3},
            sector_overlay_pct={"Energy": -15, "Industrials": -8, "Information Technology": 2},
            gold_pct=-5,
            rates_bps={"USD": -20, "EUR": -15},
            fx_pct_vs_usd={"SGD": 1.5, "IDR": 2.5, "INR": 1.5, "THB": 2, "HKD": 0},
            vix_points=-8,
        ),
        horizon_days=60,
        probability_note="Unresolved as of 26 Aug 2026; the blockade was reimposed on 5 Aug. Treat as a plausible, not central, case.",
    ),
    Scenario(
        id="escalation",
        name="Middle East escalation",
        description="Renewed attacks on shipping, sustained closure. Energy and shipping rally further, risk assets fall, dollar and gold bid, rates rise on inflation.",
        shock=Shock(
            brent_pct=30,
            equity_pct={
                "global": -8,
                "asia_ex_japan": -7,
                "greater_china": -6,
                "north_america": -6,
                "europe": -9,
            },
            sector_overlay_pct={"Energy": 15, "Industrials": 6, "Information Technology": -4},
            gold_pct=8,
            rates_bps={"USD": 15, "EUR": 20},
            credit_spread_bps={"hy": 80, "em": 60, "ig": 25},
            fx_pct_vs_usd={"SGD": -2, "IDR": -4, "INR": -2.5, "THB": -3, "EUR": -2, "JPY": 1},
            vix_points=14,
        ),
        horizon_days=30,
        probability_note="The 5 Aug blockade makes this the path of least surprise; magnitude is the uncertainty.",
    ),
    Scenario(
        id="fed-hike",
        name="Fed hikes 25bp",
        description="Market pricing shifts from holds to a hike. Duration sells off, growth valuations compress, dollar strengthens.",
        shock=Shock(
            rates_bps={"USD": 25},
            equity_pct={"north_america": -5, "global": -3},
            sector_overlay_pct={"Information Technology": -5},
            fx_pct_vs_usd={"SGD": -1, "EUR": -1.5, "JPY": -2, "HKD": 0},
            credit_spread_bps={"ig": 10, "hy": 30},
        ),
        horizon_days=45,
        probability_note="Two holds with dissents (17 Jun, 29 Jul); the 10-year is already at 4.66%.",
    ),
    Scenario(
        id="tech-drawdown",
        name="Technology drawdown repeats",
        description="A second AI-capex scare of the 5 June kind: megacap technology falls hard, concentrated single names fall harder, tech-backed collateral shrinks.",
        shock=Shock(
            equity_pct={"north_america": -6, "global": -3},
            sector_overlay_pct={"Information Technology": -18},
            vix_points=12,
        ),
        horizon_days=20,
        probability_note="Narrow, technology-led leadership at the half-year close makes a repeat plausible.",
    ),
    Scenario(
        id="hk-property-down",
        name="Hong Kong property leg down",
        description="Hong Kong residential and commercial prices fall a further leg; developers, their perpetuals and accumulators referencing them fall together.",
        shock=Shock(
            equity_pct={"greater_china": -6},
            sector_overlay_pct={"Real Estate": -15, "Financials": -5},
            credit_spread_bps={"hy": 60},
        ),
        horizon_days=90,
        probability_note="The accumulator is already settling against the client; this is the concentration risk in one move.",
    ),
]

SCENARIO_BY_ID: dict[str, Scenario] = {s.id: s for s in SCENARIOS}
