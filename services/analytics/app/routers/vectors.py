import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.data.frames import from_postgres
from app.data.today import resolve_today
from app.features.build import build, persist
from app.features.manifest import ENGINE_VERSION, MANIFEST, Feature

router = APIRouter(prefix="/vectors", tags=["vectors"])


class BuildResponse(BaseModel):
    run_id: str
    engine_version: str
    client_count: int
    feature_count: int


class ManifestResponse(BaseModel):
    engine_version: str
    features: list[Feature]


@router.get("/manifest", response_model=ManifestResponse)
def manifest() -> ManifestResponse:
    return ManifestResponse(engine_version=ENGINE_VERSION, features=MANIFEST)


@router.post("/build", response_model=BuildResponse)
def build_vectors() -> BuildResponse:
    """Recompute factual records and behavioural vectors for every client from raw.*."""
    try:
        with db.connection() as conn:
            frames = from_postgres(conn)
            if frames.clients.empty:
                raise HTTPException(
                    status_code=409, detail="raw.clients is empty; seed the database first"
                )
            today = resolve_today(conn)
            result = build(frames, today)
            run_id = persist(conn, result, today)
    except psycopg.Error as e:  # pragma: no cover - surfaced to the API caller
        raise HTTPException(status_code=503, detail=f"database error: {e}") from e
    return BuildResponse(
        run_id=run_id,
        engine_version=ENGINE_VERSION,
        client_count=result.client_count,
        feature_count=result.feature_count,
    )
