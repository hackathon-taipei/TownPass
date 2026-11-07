"""長者名冊與拜訪回報的 HTTP 端點。"""

from typing import Annotated

from fastapi import Depends

from townpass_backend.db import SessionDep
from townpass_backend.features.meal_relay import (
    meal_router,
    models,
    require_roles,
    schemas,
)

from . import service

router = meal_router("meal_elder")


@router.get("/elders", response_model=list[schemas.Elder])
def list_elders(
    account: Annotated[models.MealAccount, Depends(require_roles("admin"))], session: SessionDep
) -> list[schemas.Elder]:
    return service.list_elders(session)


@router.post("/elders", response_model=schemas.Elder)
def create_elder(
    payload: schemas.ElderCreate,
    account: Annotated[models.MealAccount, Depends(require_roles("admin"))],
    session: SessionDep,
) -> schemas.Elder:
    return service.create_elder(session, account, payload)


@router.patch("/elders/{elder_id}", response_model=schemas.Elder)
def update_elder(
    elder_id: str,
    payload: schemas.ElderUpdate,
    account: Annotated[models.MealAccount, Depends(require_roles("admin"))],
    session: SessionDep,
) -> schemas.Elder:
    return service.update_elder(session, elder_id, payload)


@router.post("/visits", response_model=schemas.Visit)
def report_visit(
    payload: schemas.VisitCreate,
    account: Annotated[models.MealAccount, Depends(require_roles("volunteer"))],
    session: SessionDep,
) -> schemas.Visit:
    return service.report_visit(session, account, payload)
