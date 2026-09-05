import json
from pathlib import Path

import pytest

from app.impact.models import bond_duration, price_instrument
from app.impact.scenarios import Scenario
from app.impact.shock import Shock


def test_bond_duration_from_name_and_default() -> None:
    assert bond_duration("US Treasury 2.375% due 2045", "Government Bond", 2026) > 12
    assert bond_duration("US Treasury 4.125% due 2028", "Government Bond", 2026) < 3
    assert bond_duration("Global IG Fund", "Investment Grade Credit", 2026) == 6.0


def test_long_bond_loses_more_than_short_bond_on_rate_rise() -> None:
    shock = Shock(rates_bps={"USD": 28})
    kw = dict(
        asset_class="Fixed Income",
        sub_asset_class="Government Bond",
        sector="Sovereign",
        region="North America",
        concentration_applies=False,
        legs=[],
        shock=shock,
        currency="USD",
        as_of_year=2026,
    )
    long = price_instrument(name="US Treasury 2.375% due 2045", **kw)  # type: ignore[arg-type]
    short = price_instrument(name="US Treasury 4.125% due 2028", **kw)  # type: ignore[arg-type]
    assert long.rates_pct < short.rates_pct < 0
    assert long.rates_pct == pytest.approx(
        -bond_duration("US Treasury 2.375% due 2045", "Government Bond", 2026) * 0.28, abs=1e-6
    )


def test_single_name_carries_beta_and_sector_overlay() -> None:
    shock = Shock(
        equity_pct={"north_america": -5}, sector_overlay_pct={"Information Technology": -15}
    )
    p = price_instrument(
        name="Helios Cloud Systems Inc",
        asset_class="Equity",
        sub_asset_class="Single Stock",
        sector="Information Technology",
        region="North America",
        concentration_applies=True,
        legs=[],
        shock=shock,
        currency="USD",
        as_of_year=2026,
    )
    assert p.equity_pct == pytest.approx(-5 * 1.2 - 15)


def test_structured_note_payoffs() -> None:
    down = Shock(equity_pct={"greater_china": -6}, sector_overlay_pct={"Real Estate": -15})
    legs = [
        {"leg": "Golden Harbour", "weight": 1.0, "sector": "Real Estate", "region": "Hong Kong"}
    ]
    acc = price_instrument(
        name="Accumulator",
        asset_class="Structured Products",
        sub_asset_class="Accumulator",
        sector="Real Estate",
        region="Hong Kong",
        concentration_applies=True,
        legs=legs,
        shock=down,
        currency="HKD",
        as_of_year=2026,
    )
    assert acc.equity_pct == pytest.approx(2 * (-6 * 1.2 - 15))  # double-up below strike
    cpn = price_instrument(
        name="CPN",
        asset_class="Structured Products",
        sub_asset_class="Capital Protected",
        sector="Gold",
        region="Global",
        concentration_applies=True,
        legs=[{"leg": "XAU", "weight": 0.7, "sector": "Gold", "region": "Global"}],
        shock=Shock(gold_pct=-10),
        currency="USD",
        as_of_year=2026,
    )
    assert cpn.equity_pct == 0.0  # protected


def test_private_marks_are_not_revalued() -> None:
    p = price_instrument(
        name="Meridian PE VII",
        asset_class="Alternatives",
        sub_asset_class="Private Equity",
        sector="Diversified",
        region="Global",
        concentration_applies=True,
        legs=[],
        shock=Shock(equity_pct={"global": -20}),
        currency="USD",
        as_of_year=2026,
    )
    assert p.equity_pct == 0.0 and p.model.startswith("private mark")


def test_reference_scenarios_parse_combine_and_scale() -> None:
    ref_path = Path(__file__).resolve().parents[3] / "data" / "reference" / "scenarios.json"
    ref = json.loads(ref_path.read_text())
    scenarios = [
        Scenario(
            id=s["id"],
            name=s["name"],
            description=s["description"],
            shock=Shock.model_validate(s["shock"]),
            horizon_days=s["horizonDays"],
            probability_note=s["probabilityNote"],
        )
        for s in ref["scenarios"]
    ]
    assert len(scenarios) >= 1
    first = scenarios[0].shock
    assert first.scaled(2).brent_pct == 2 * first.brent_pct
    both = Shock.combine([first, first])
    for k, v in first.rates_bps.items():
        assert both.rates_bps[k] == 2 * v
