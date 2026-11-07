"""PRESENTATION (HTTP) - meal_food API 端點（合約 §8、T-109）。"""

from typing import Annotated

from fastapi import Depends, Response

from townpass_backend.db import SessionDep
from townpass_backend.features.meal_relay import (
    CurrentAccount,
    meal_router,
    models,
    require_roles,
    schemas,
)

from . import service
from .service import MealFoodUpdate

router = meal_router("meal_food")

SupplierOrAdmin = Annotated[models.MealAccount, Depends(require_roles("supplier", "admin"))]
SupplierOrVolunteer = Annotated[models.MealAccount, Depends(require_roles("supplier", "volunteer"))]
FoodReader = Annotated[models.MealAccount, Depends(require_roles("supplier", "volunteer", "admin"))]


def approved_supplier(
    session: SessionDep,
    account: CurrentAccount,
) -> models.MealAccount:
    service.get_approved_supplier(session, account)
    return account


ApprovedSupplier = Annotated[models.MealAccount, Depends(approved_supplier)]


@router.get("/points")
def list_points(
    session: SessionDep,
    account: SupplierOrAdmin,
    category: str | None = None,
    for_elder: str | None = None,
) -> list[schemas.Point]:
    """GET /points?category=&for_elder= (supplier, admin)"""
    return service.list_points(session, category=category, for_elder=for_elder)


@router.post("/points")
def create_point(
    session: SessionDep,
    account: ApprovedSupplier,
    payload: schemas.PointCreate,
) -> schemas.Point:
    """POST /points (supplier only, approved)"""
    return service.create_point(session, account, payload)


@router.get("/foods")
def list_foods(
    session: SessionDep,
    account: SupplierOrAdmin,
    point_id: str | None = None,
    category: str | None = None,
    for_elder: str | None = None,
    mine: int | None = None,
) -> list[schemas.Food]:
    """GET /foods?point_id=&category=&for_elder=&mine=1 (supplier, admin)"""
    return service.list_foods(
        session,
        account,
        point_id=point_id,
        category=category,
        for_elder=for_elder,
        mine=bool(mine),
    )


@router.get("/foods/{id}")
def get_food(
    session: SessionDep,
    account: FoodReader,
    id: str,
) -> schemas.Food:
    """GET /foods/{id} (supplier, volunteer, admin)"""
    return service.get_food(session, id)


@router.post("/foods")
def create_food(
    session: SessionDep,
    account: ApprovedSupplier,
    payload: schemas.FoodCreate,
) -> schemas.Food:
    """POST /foods (supplier only, approved)"""
    return service.create_food(session, account, payload)


@router.patch("/foods/{id}")
def update_food(
    session: SessionDep,
    account: ApprovedSupplier,
    id: str,
    payload: MealFoodUpdate,
) -> schemas.Food:
    """PATCH /foods/{id} (supplier only, approved)"""
    return service.update_food(session, account, id, payload)


@router.post("/images")
def upload_image(
    session: SessionDep,
    account: SupplierOrVolunteer,
    payload: schemas.ImageUpload,
) -> schemas.ImageUploaded:
    """POST /images (supplier, volunteer)"""
    return service.upload_image(session, account, payload)


@router.get("/images/{id}")
def get_image(
    session: SessionDep,
    id: str,
) -> Response:
    """GET /images/{id} (public, no auth)"""
    return service.get_image(session, id)
