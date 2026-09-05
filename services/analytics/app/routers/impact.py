from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import db
from app.data.today import resolve_today
from app.impact.engine import ImpactResult, persist_run, run_impact
from app.impact.scenarios import Scenario, load_scenarios
from app.impact.shock import SEVERITY_MULTIPLIER, Severity, Shock

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
    try:
        with db.connection() as conn:
            return ScenariosResponse(scenarios=load_scenarios(conn))
    except psycopg.Error as e:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"database error: {e}") from e


@router.post("/run", response_model=ImpactResult)
def run(req: ImpactRunRequest) -> ImpactResult:
    shocks = list(req.shocks)
    try:
        with db.connection() as conn:
            if req.scenario_id is not None:
                scenario = next((s for s in load_scenarios(conn) if s.id == req.scenario_id), None)
                if scenario is None:
                    raise HTTPException(
                        status_code=404, detail=f"unknown scenario {req.scenario_id}"
                    )
                shocks.append(scenario.shock)
            if not shocks:
                raise HTTPException(
                    status_code=422, detail="select at least one signal or a scenario"
                )
            combined = Shock.combine(shocks).scaled(SEVERITY_MULTIPLIER[req.severity])
            today = resolve_today(conn)
            result = run_impact(
                conn, req.client_id, req.snapshot_date, combined, req.severity, today
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
