"""HTTP 路由：據點、QR 報到與自動派送。"""

from typing import Annotated

from fastapi import Depends

import townpass_backend.features.meal_relay as mr
from townpass_backend.db import SessionDep

from . import service

router = mr.meal_router("meal_dispatch")


@router.get("/stations")
def list_stations(
    _account: mr.CurrentAccount, session: SessionDep
) -> list[mr.schemas.Station]:
    return service.list_stations(session)


@router.get("/stations/mine")
def get_my_station(
    account: Annotated[mr.models.MealAccount, Depends(mr.require_roles("station"))],
    session: SessionDep,
) -> mr.schemas.MyStation:
    return service.get_my_station(session, account)


@router.post("/checkins")
def check_in(
    body: mr.schemas.CheckInCreate,
    account: Annotated[mr.models.MealAccount, Depends(mr.require_roles("volunteer"))],
    session: SessionDep,
) -> mr.schemas.CheckInResult:
    return service.check_in(session, account, body.qr_text)


@router.get("/assignments/mine")
def list_my_assignments(
    account: Annotated[mr.models.MealAccount, Depends(mr.require_roles("volunteer"))],
    session: SessionDep,
) -> list[mr.schemas.Assignment]:
    return service.my_assignments(session, account)
