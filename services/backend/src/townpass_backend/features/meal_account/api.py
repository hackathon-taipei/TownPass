"""PRESENTATION (HTTP) - 帳號、提供者申請與審核、重置 Demo（合約 §8）。只呼叫 service。

`meal_router` 會把 `MealError` 與 422 轉成 §7 的錯誤格式；身分用 `CurrentAccount`、`require_roles`。
"""

from typing import Annotated

from fastapi import Depends

from townpass_backend.db import SessionDep
from townpass_backend.features.meal_relay import CurrentAccount, meal_router, models, require_roles, schemas

from . import service

router = meal_router("meal_account")

Admin = Annotated[models.MealAccount, Depends(require_roles("admin"))]
Citizen = Annotated[models.MealAccount, Depends(require_roles("citizen"))]
CitizenOrSupplier = Annotated[models.MealAccount, Depends(require_roles("citizen", "supplier"))]


@router.get("/me")
def get_me(account: CurrentAccount, session: SessionDep) -> schemas.Me:
    """全部角色；沒匯入的 id 是一般市民 citizen（V2）。"""
    return service.get_me(session, account)


@router.post("/demo/reset")
def reset_demo(_: Admin, session: SessionDep) -> schemas.DemoResetResult:
    """admin：回到種子狀態（V17）。"""
    return service.reset(session)


@router.post("/suppliers")
def apply_supplier(account: Citizen, body: schemas.SupplierApply, session: SessionDep) -> schemas.Supplier:
    """citizen：申請成為提供者（pending）。已申請過 → 409 ALREADY_APPLIED。"""
    return service.apply_supplier(session, account, body)


@router.get("/suppliers/mine")
def get_my_supplier(account: CitizenOrSupplier, session: SessionDep) -> schemas.Supplier | None:
    """citizen、supplier：自己的申請；沒有申請回傳 null。"""
    return service.get_my_supplier(session, account)


@router.get("/suppliers")
def list_suppliers(
    _: Admin, session: SessionDep, status: schemas.SupplierStatus | None = None
) -> list[schemas.Supplier]:
    """admin：全部申請，可用 `status` 篩選。"""
    return service.list_suppliers(session, status)


@router.post("/suppliers/{supplier_id}/approve")
def approve_supplier(supplier_id: str, _: Admin, session: SessionDep) -> schemas.Supplier:
    """admin：通過（只能審 pending，否則 409 INVALID_STATE）；申請人變成 supplier。"""
    return service.approve_supplier(session, supplier_id)


@router.post("/suppliers/{supplier_id}/reject")
def reject_supplier(supplier_id: str, _: Admin, session: SessionDep) -> schemas.Supplier:
    """admin：不通過（只能審 pending，否則 409 INVALID_STATE）；申請人維持 citizen。"""
    return service.reject_supplier(session, supplier_id)
