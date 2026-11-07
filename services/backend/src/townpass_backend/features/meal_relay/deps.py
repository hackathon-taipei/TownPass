"""PRESENTATION (HTTP) - 鄰食轉運站各套件共用的 FastAPI 相依與錯誤格式（合約 §2、§7）。

用法（其他 meal_* 套件的 api.py）：

    from townpass_backend.features.meal_relay import CurrentAccount, MealError, meal_router, require_roles

    router = meal_router("meal-food")          # prefix /meal-relay，錯誤自動轉成 §7 格式

    @router.post("/foods")
    def create_food(account: Annotated[MealAccount, Depends(require_roles("supplier"))], ...): ...

    @router.get("/me")
    def get_me(account: CurrentAccount, session: SessionDep) -> Me: ...

不 import repo（B1–B4），一律經過 service。
"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute, APIRouter

from townpass_backend.db import SessionDep

from . import service
from .models import MealAccount
from .service import MealError


def http_error(err: MealError) -> HTTPException:
    """MealError → HTTPException，detail 為 `{"code", "message"}`（§7）。"""
    return HTTPException(status_code=err.status, detail={"code": err.code, "message": err.message})


def error_response(code: str, message: str, status: int | None = None) -> JSONResponse:
    err = MealError(code, message, status)
    return JSONResponse(
        status_code=err.status, content={"detail": {"code": err.code, "message": err.message}}
    )


def current_account(
    session: SessionDep, x_demo_user: Annotated[str | None, Header(alias="X-Demo-User")] = None
) -> MealAccount:
    """讀 `X-Demo-User`。沒帶 → 401 UNAUTHENTICATED；沒匯入的 id 視為一般市民（V2）。先跑 refresh（M20）。"""
    account_id = (x_demo_user or "").strip()
    if not account_id:
        raise http_error(MealError("UNAUTHENTICATED", "缺少 X-Demo-User"))
    service.refresh(session, service.now())  # M20
    return service.get_account_or_default(session, account_id)


CurrentAccount = Annotated[MealAccount, Depends(current_account)]


def require_roles(*roles: str) -> Callable[[MealAccount], MealAccount]:
    """只允許這些角色呼叫，其他 → 403 FORBIDDEN_ROLE。

    `account: Annotated[MealAccount, Depends(require_roles("volunteer", "admin"))]`
    """
    allowed = frozenset(roles)

    def dependency(account: CurrentAccount) -> MealAccount:
        if account.role not in allowed:
            raise http_error(MealError("FORBIDDEN_ROLE", "這個角色不能使用這個功能"))
        return account

    return dependency


def validation_message(err: RequestValidationError) -> str:
    """FastAPI 的驗證錯誤 → 一句中文說明（第一個錯誤欄位）。"""
    first = next(iter(err.errors()), None)
    if not first:
        return "欄位格式錯誤"
    where = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path"))
    return f"欄位格式錯誤：{where} {first.get('msg', '')}".strip()


class MealRoute(APIRoute):
    """讓路由的錯誤都符合 §7：MealError → 對應狀態碼；FastAPI 的 422 → VALIDATION_ERROR。"""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await original(request)
            except MealError as err:
                return error_response(err.code, err.message, err.status)
            except RequestValidationError as err:
                return error_response("VALIDATION_ERROR", validation_message(err))

        return handler


def meal_router(tag: str) -> APIRouter:
    """建立 `/meal-relay` 底下的路由（各 meal_* 套件自己的 router 用這個建）。"""
    return APIRouter(prefix="/meal-relay", tags=[tag], route_class=MealRoute)
