"""The 12-month cash-need rule exists in TypeScript (apps/api/src/domain/cashflows.ts, tested in
attribution.test.ts) and twice in Python. These cases mirror the TypeScript test so all three
implementations agree."""

from datetime import date

import pandas as pd

from app.features.fx import Fx
from app.impact.engine import _add_months, _needs_12m

TODAY = "2026-08-26"
FX = Fx(pd.DataFrame([{"snapshot_date": TODAY, "series_id": "USDSGD", "value": 1.352}]))


def _needs(rows: list[dict[str, object]]) -> float:
    return _needs_12m(rows, FX, TODAY, TODAY)


def test_calendar_month_offset_matches_api() -> None:
    assert _add_months(date(2026, 8, 26), 12) == date(2027, 8, 26)
    assert _add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_annual_and_one_off_inside_the_window_count_in_full() -> None:
    assert (
        _needs(
            [
                {
                    "amount": 100,
                    "currency": "USD",
                    "recurrence": "Annual",
                    "due_from": "2026-09-01",
                    "due_to": "2031-09-01",
                    "certainty": "Confirmed",
                }
            ]
        )
        == 100
    )
    assert (
        _needs(
            [
                {
                    "amount": 100,
                    "currency": "USD",
                    "recurrence": "One-off",
                    "due_from": "2027-03-01",
                    "due_to": "2027-06-30",
                    "certainty": "Likely",
                }
            ]
        )
        == 100
    )


def test_aspirational_expired_and_beyond_horizon_are_ignored() -> None:
    assert (
        _needs(
            [
                {
                    "amount": 100,
                    "currency": "USD",
                    "recurrence": "One-off",
                    "due_from": "2028-01-01",
                    "due_to": "2028-12-31",
                    "certainty": "Aspirational",
                }
            ]
        )
        == 0
    )
    assert (
        _needs(
            [
                {
                    "amount": 100,
                    "currency": "USD",
                    "recurrence": "One-off",
                    "due_from": "2027-10-01",
                    "due_to": "2027-12-31",
                    "certainty": "Confirmed",
                }
            ]
        )
        == 0
    )
    assert (
        _needs(
            [
                {
                    "amount": 100,
                    "currency": "USD",
                    "recurrence": "One-off",
                    "due_from": "2025-10-01",
                    "due_to": "2025-12-31",
                    "certainty": "Confirmed",
                }
            ]
        )
        == 0
    )


def test_irregular_needs_are_prorated_over_their_window() -> None:
    v = _needs(
        [
            {
                "amount": 1000,
                "currency": "USD",
                "recurrence": "Irregular",
                "due_from": "2026-10-01",
                "due_to": "2028-03-31",
                "certainty": "Likely",
            }
        ]
    )
    assert 550 < v < 620
