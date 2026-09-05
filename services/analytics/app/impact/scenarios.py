"""Named scenarios come from the dataset's reference data (derived.scenarios, seeded from
data/reference/scenarios.json). The engine holds no scenario of its own."""

from __future__ import annotations

from typing import Any

import psycopg
from pydantic import BaseModel

from app.impact.shock import Shock


class Scenario(BaseModel):
    id: str
    name: str
    description: str
    shock: Shock
    horizon_days: int
    probability_note: str


def load_scenarios(conn: psycopg.Connection[Any]) -> list[Scenario]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, description, shock, horizon_days, probability_note"
            " FROM derived.scenarios ORDER BY ordinal"
        )
        rows = cur.fetchall()
    return [
        Scenario(
            id=r["id"],
            name=r["name"],
            description=r["description"],
            shock=Shock.model_validate(r["shock"]),
            horizon_days=int(r["horizon_days"]),
            probability_note=r["probability_note"],
        )
        for r in rows
    ]
