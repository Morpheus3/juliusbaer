from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import db
from app.impact.engine import ImpactResult, persist_run, run_impact
from app.impact.scenarios import SCENARIO_BY_ID, SCENARIOS, Scenario
from app.impact.shock import SEVERITY_MULTIPLIER, Severity, Shock
from app.settings import settings

router = APIRouter(prefix="/impact", tags=["impact"])


class ImpactRunRequest(BaseModel):
    client_id: str
    snapshot_date: str
    severity: Severity = "base"
    shocks: list[Shock] = Field(default_factory=list, description="Shocks from selected signals")
    scenario_id: str | None = None
    label: str | None = None
    save: bool = False
    request_echo: dict[str, Any] = Field(default_factory=dict)


class ScenariosResponse(BaseModel):
    scenarios: list[Scenario]


@router.get("/scenarios", response_model=ScenariosResponse)
def scenarios() -> ScenariosResponse:
    return ScenariosResponse(scenarios=SCENARIOS)


@router.post("/run", response_model=ImpactResult)
def run(req: ImpactRunRequest) -> ImpactResult:
    shocks = list(req.shocks)
    if req.scenario_id is not None:
        scenario = SCENARIO_BY_ID.get(req.scenario_id)
        if scenario is None:
            raise HTTPException(status_code=404, detail=f"unknown scenario {req.scenario_id}")
        shocks.append(scenario.shock)
    if not shocks:
        raise HTTPException(status_code=422, detail="select at least one signal or a scenario")
    combined = Shock.combine(shocks).scaled(SEVERITY_MULTIPLIER[req.severity])
    try:
        with db.connection() as conn:
            result = run_impact(
                conn,
                req.client_id,
                req.snapshot_date,
                combined,
                req.severity,
                settings.dataset_today,
            )
            if req.save:
                result.run_id = persist_run(
                    conn,
                    result,
                    req.request_echo or req.model_dump(exclude={"request_echo"}),
                    req.label,
                )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except psycopg.Error as e:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"database error: {e}") from e
    return result
