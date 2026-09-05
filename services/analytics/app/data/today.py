"""The dataset's "today": an explicit setting if given, else the latest snapshot in the data."""

from __future__ import annotations

from typing import Any

import psycopg

from app.settings import settings


def resolve_today(conn: psycopg.Connection[Any]) -> str:
    if settings.dataset_today:
        return settings.dataset_today
    with conn.cursor() as cur:
        cur.execute("SELECT max(snapshot_date) AS d FROM raw.snapshots")
        row = cur.fetchone()
    if row is None or row["d"] is None:
        msg = "no snapshots loaded; seed the database first"
        raise ValueError(msg)
    return str(row["d"])
