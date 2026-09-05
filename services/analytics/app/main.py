from fastapi import FastAPI
from pydantic import BaseModel

from app import db
from app.settings import settings

app = FastAPI(
    title="RM Workbench Analytics",
    version=settings.service_version,
    description="Deterministic numeric engines: customer vectors, impact models, validator.",
)


class Health(BaseModel):
    status: str
    version: str
    dataset_today: str
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
