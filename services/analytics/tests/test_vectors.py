from pathlib import Path

import pytest

from app.data.frames import from_csv_dir
from app.features.build import build
from app.features.manifest import FEATURE_NAMES

DATA = Path(__file__).resolve().parents[3] / "data"
TODAY = "2026-08-26"


@pytest.fixture(scope="module")
def result():  # noqa: ANN201
    return build(from_csv_dir(DATA), TODAY)


def _vec(result, cid: str) -> dict[str, float | None]:  # noqa: ANN001
    return next(v for v in result.vectors if v.client_id == cid).features


def test_every_client_has_every_feature(result) -> None:  # noqa: ANN001
    assert result.client_count == 20
    for v in result.vectors:
        assert list(v.features) == FEATURE_NAMES


def test_ravi_leverage_and_stress_buying(result) -> None:  # noqa: ANN001
    f = _vec(result, "CL-0002")
    assert f["ltv_pct"] == pytest.approx(73.71, abs=0.01)
    assert f["ltv_headroom_pts"] == pytest.approx(1.29, abs=0.01)
    assert f["ltv_change_since_march_pts"] == pytest.approx(73.71 - 61.68, abs=0.01)
    # Drew the facility and bought a pre-IPO secondary into the June drawdown.
    assert f["stress_behaviour_score"] is not None and f["stress_behaviour_score"] > 0


def test_lau_is_one_bet_on_hong_kong_property(result) -> None:  # noqa: ANN001
    f = _vec(result, "CL-0014")
    assert f["ltv_headroom_pts"] == pytest.approx(70.0 - 69.41, abs=0.01)
    assert f["facility_utilisation_pct"] == pytest.approx(82.86, abs=0.01)
    assert f["source_of_wealth_overlap_pct"] is not None and f["source_of_wealth_overlap_pct"] > 25


def test_voss_brenner_conservative_file_but_equity_heavy_portfolio(result) -> None:  # noqa: ANN001
    f = _vec(result, "CL-0003")
    assert f["stated_risk_score"] == 2
    assert f["risk_asset_pct"] is not None and f["risk_asset_pct"] > 65
    assert f["mandate_drift_pts"] is not None and f["mandate_drift_pts"] > 50
    assert f["ltv_pct"] is None  # no facility


def test_cheung_draws_income_and_withdraws(result) -> None:  # noqa: ANN001
    f = _vec(result, "CL-0012")
    assert f["withdrawal_count_ytd"] == 3
    assert f["days_to_next_cash_need"] == 0  # living expenses already running


def test_lindqvist_sits_in_cash(result) -> None:  # noqa: ANN001
    f = _vec(result, "CL-0009")
    assert f["cash_pct"] is not None and f["cash_pct"] > 40


def test_percentiles_and_peers(result) -> None:  # noqa: ANN001
    p = result.percentiles["CL-0002"]
    assert p["ltv_pct"] is not None and 0 <= p["ltv_pct"] <= 100
    assert result.percentiles["CL-0003"]["ltv_pct"] is None
    peers = result.peers["CL-0002"]
    assert len(peers) == 3
    assert all(peer["clientId"] != "CL-0002" for peer in peers)


def test_factual_record(result) -> None:  # noqa: ANN001
    fong = result.factual["CL-0017"]
    assert fong["is_entity"] is True and fong["age"] is None
    voss = result.factual["CL-0003"]
    assert voss["domicile_differs_from_residence"] is True
    assert voss["kyc_status"] == "current"
    tan = result.factual["CL-0011"]
    assert tan["kyc_status"] == "due_soon" and tan["kyc_days_to_due"] == 5
