from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.rubric.definitions import DEFINITIONS, DIMENSIONS, Definition
from app.rubric.rules import RulesResult, assess_rules
from app.rubric.statistical import StatResult, assess_statistical

router = APIRouter(prefix="/rubric", tags=["rubric"])
ENGINE_VERSION = "rubric-assessors/0.1.0"


class DefinitionsResponse(BaseModel):
    definitions: list[Definition]


class DimensionAssessment(BaseModel):
    dimension: str
    rules: RulesResult
    statistical: StatResult


class AssessResponse(BaseModel):
    client_id: str
    vector_run_id: str
    engine_version: str
    features: dict[str, float | None]
    dimensions: list[DimensionAssessment]


@router.get("/definitions", response_model=DefinitionsResponse)
def definitions() -> DefinitionsResponse:
    return DefinitionsResponse(definitions=DEFINITIONS)


@router.get("/assess/{client_id}", response_model=AssessResponse)
def assess(client_id: str) -> AssessResponse:
    """Rules and statistical assessments for one client from the stored behavioural vector."""
    try:
        with db.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT run_id, features FROM derived.client_vectors WHERE client_id=%s",
                (client_id,),
            )
            row: dict[str, Any] | None = cur.fetchone()
    except psycopg.Error as e:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"database error: {e}") from e
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"no vector for {client_id}; build vectors first"
        )
    features: dict[str, float | None] = {
        k: (None if v is None else float(v)) for k, v in row["features"].items()
    }
    return AssessResponse(
        client_id=client_id,
        vector_run_id=str(row["run_id"]),
        engine_version=ENGINE_VERSION,
        features=features,
        dimensions=[
            DimensionAssessment(
                dimension=d,
                rules=assess_rules(d, features),
                statistical=assess_statistical(d, features),
            )
            for d in DIMENSIONS
        ],
    )
