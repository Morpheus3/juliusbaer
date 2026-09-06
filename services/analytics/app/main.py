import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from app import db
from app.routers import impact, rubric, vectors
from app.rubric.statistical import warm_up
from app.settings import settings

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Train the statistical assessors before serving so no request pays for training."""
    started = time.perf_counter()
    accuracy = warm_up()
    log.info("rubric models trained in %.1fs: %s", time.perf_counter() - started, accuracy)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="RM Workbench Analytics",
    version=settings.service_version,
    description="Deterministic numeric engines: customer vectors, impact models, validator.",
)
app.include_router(vectors.router)
app.include_router(impact.router)
app.include_router(rubric.router)


class Health(BaseModel):
    status: str
    version: str
    dataset_today: str | None
    database_reachable: bool


@app.get("/health", response_model=Health)
def health() -> Health:
    reachable = db.ping()
    return Health(
        status="ok" if reachable else "degraded",
        version=settings.service_version,
        dataset_today=settings.dataset_today,
        database_reachable=reachable,
    )
