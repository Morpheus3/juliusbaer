"""Stress windows are discovered from the data, not assumed.

A snapshot interval counts as a stress window when any of these hold: the median broad equity
index fell by more than EQUITY_DROP_PCT between the two snapshots; volatility rose by more than
VOL_RISE_POINTS; or the event log records a Severe market or geopolitical event inside the
interval. High-severity events alone do not qualify: most intervals contain one, which would make
every interval a stress window."""

from __future__ import annotations

from itertools import pairwise

import pandas as pd

EQUITY_DROP_PCT = -2.0
VOL_RISE_POINTS = 5.0


STRESS_EVENT_SEVERITIES = {"Severe"}
STRESS_EVENT_TYPES = {"Market", "Geopolitical"}


def stress_windows(
    market: pd.DataFrame, events: pd.DataFrame, snapshots: list[str]
) -> tuple[list[tuple[str, str]], str]:
    eq = market.loc[market.category.str.lower().str.contains("equity")]
    vol = market.loc[market.category.str.lower().str.contains("volatil")]
    windows: list[tuple[str, str]] = []
    ev = events.loc[
        events.severity.isin(STRESS_EVENT_SEVERITIES) & events.event_type.isin(STRESS_EVENT_TYPES)
    ]
    if eq.empty and vol.empty and ev.empty:
        return [], "no market context or event log: stress windows unavailable"
    for a, b in pairwise(snapshots):
        stressed = (
            bool(((ev.event_date > a) & (ev.event_date <= b)).any()) if not ev.empty else False
        )
        if not eq.empty:
            ea = eq.loc[eq.snapshot_date == a].set_index("series_id").value
            eb = eq.loc[eq.snapshot_date == b].set_index("series_id").value
            common = ea.index.intersection(eb.index)
            if len(common):
                rets = (eb[common] / ea[common] - 1) * 100
                if float(rets.median()) < EQUITY_DROP_PCT:
                    stressed = True
        if not stressed and not vol.empty:
            va = vol.loc[vol.snapshot_date == a].value
            vb = vol.loc[vol.snapshot_date == b].value
            if len(va) and len(vb) and float(vb.iloc[0]) - float(va.iloc[0]) > VOL_RISE_POINTS:
                stressed = True
        if stressed:
            windows.append((a, b))
    method = (
        f"intervals where median equity index return < {EQUITY_DROP_PCT}%,"
        f" volatility rose > {VOL_RISE_POINTS} points,"
        " or the event log holds a Severe market or geopolitical event"
    )
    return windows, method
