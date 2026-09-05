from pathlib import Path

import pytest

from app.data.frames import from_csv_dir
from app.features.build import build
from app.rubric.rules import assess_rules
from app.rubric.statistical import assess_statistical

DATA = Path(__file__).resolve().parents[3] / "data"


@pytest.fixture(scope="module")
def vectors():  # noqa: ANN201
    r = build(from_csv_dir(DATA), "2026-08-26")
    return {v.client_id: v.features for v in r.vectors}


def test_rules_capacity_penalises_leverage_and_claims(vectors) -> None:  # noqa: ANN001
    lau = assess_rules("capacity", vectors["CL-0014"])
    assert lau.score == 1
    assert any(c.rule == "margin-call proximity" for c in lau.contributions)
    assert any(c.rule == "heavy near-term claims" for c in lau.contributions)


def test_rules_appetite_reads_behaviour_not_the_file(vectors) -> None:  # noqa: ANN001
    voss = assess_rules("appetite", vectors["CL-0003"])
    assert voss.score == 3  # 71% equity inherited: behaviour of the portfolio, not the person
    ravi = assess_rules("appetite", vectors["CL-0002"])
    assert ravi.score == 3  # 68% risk assets, one-line concentration, leverage rising
    kim = assess_rules("appetite", vectors["CL-0015"])
    assert any(c.rule == "bought into drawdowns" for c in kim.contributions)


def test_rules_horizon_shortens_for_drawdown_and_age(vectors) -> None:  # noqa: ANN001
    cheung = assess_rules("horizon", vectors["CL-0012"])
    assert cheung.score <= 2
    rules = {c.rule for c in cheung.contributions}
    assert "recurring withdrawals already running" in rules and "age 70 or over" in rules


def test_statistical_assessor_is_calibrated_and_deterministic(vectors) -> None:  # noqa: ANN001
    a = assess_statistical("capacity", vectors["CL-0014"])
    b = assess_statistical("capacity", vectors["CL-0014"])
    assert a.score == b.score and a.probabilities == b.probabilities
    assert abs(sum(a.probabilities.values()) - 1) < 1e-6
    assert a.training["holdout_accuracy"] > 0.85
    assert a.score in (1, 2)


def test_statistical_handles_missing_features(vectors) -> None:  # noqa: ANN001
    voss = assess_statistical("capacity", vectors["CL-0003"])  # no facility → ltv features None
    assert voss.score in (1, 2, 3)
