"""meal_food 邏輯層 - 食物點、食物、庫存去向與圖片（合約 §8、T-109）。"""

import base64
import binascii
from datetime import datetime
from typing import Any

from fastapi import Response
from pydantic import Field
from sqlmodel import Session

from townpass_backend.features.meal_relay import (
    CurrentAccount,
    MealError,
    allergen_conflict,
    image_url,
    models,
    new_id,
    now,
    refresh,
    repo,
    schemas,
    settings,
    to_food,
    to_point,
    to_utc,
)


class MealFoodUpdate(schemas.MealRequest):
    """PATCH /foods/{id} 請求型別（合約 M14）。"""

    qty: int | None = Field(default=None, ge=0, le=999)
    expires_at: datetime | None = None
    closed: bool | None = None


def get_approved_supplier(session: Session, account: CurrentAccount) -> models.MealSupplier:
    supplier = repo.get_supplier_by_account(session, account.id)
    if supplier:
        if supplier.status != "approved":
            raise MealError("SUPPLIER_NOT_APPROVED", "提供者未通過審核", 403)
        return supplier
    if account.role != "supplier":
        raise MealError("FORBIDDEN_ROLE", "這個角色不能使用這個功能", 403)
    raise MealError("SUPPLIER_NOT_APPROVED", "提供者未通過審核", 403)


def list_points(
    session: Session,
    *,
    category: str | None = None,
    for_elder: str | None = None,
) -> list[schemas.Point]:
    """GET /points?category=&for_elder="""
    refresh(session, now())
    elder = repo.get_elder(session, for_elder) if for_elder else None

    points = repo.list_points(session)
    result: list[schemas.Point] = []
    for p in points:
        foods = repo.list_foods(session, point_id=p.id, category=category)
        open_count = 0
        for f in foods:
            if f.closed:
                continue
            if elder and allergen_conflict(f, elder):
                continue
            food_obj = to_food(session, f)
            if food_obj.status == "open":
                open_count += 1
        result.append(to_point(p, open_food_count=open_count))
    return result


def create_point(
    session: Session,
    account: CurrentAccount,
    payload: schemas.PointCreate,
) -> schemas.Point:
    """POST /points (supplier only, must be approved)."""
    get_approved_supplier(session, account)
    row = models.MealPoint(
        id=new_id("p"),
        name=payload.name,
        kind=payload.kind,
        lat=payload.location.lat,
        lng=payload.location.lng,
        source="custom",
        created_by=account.id,
        image_id=payload.image_id,  # ADR-028 入口照片（選填）
    )
    repo.create_point(session, row)
    return to_point(row, open_food_count=0)


def list_foods(
    session: Session,
    account: CurrentAccount,
    *,
    point_id: str | None = None,
    category: str | None = None,
    for_elder: str | None = None,
    mine: bool = False,
) -> list[schemas.Food]:
    """GET /foods?point_id=&category=&for_elder=&mine=1"""
    refresh(session, now())
    supplier_id: str | None = None
    if mine:
        supplier = repo.get_supplier_by_account(session, account.id)
        if not supplier:
            return []
        supplier_id = supplier.id

    elder = repo.get_elder(session, for_elder) if for_elder else None

    foods = repo.list_foods(
        session,
        point_id=point_id,
        category=category,
        supplier_id=supplier_id,
    )
    result: list[schemas.Food] = []
    for f in foods:
        if elder and allergen_conflict(f, elder):
            continue
        result.append(to_food(session, f))
    return result


def get_food(session: Session, food_id: str) -> schemas.Food:
    """GET /foods/{id}"""
    refresh(session, now())
    food = repo.get_food(session, food_id)
    if not food:
        raise MealError("NOT_FOUND", "找不到食物", 404)
    return to_food(session, food)


def create_food(
    session: Session,
    account: CurrentAccount,
    payload: schemas.FoodCreate,
) -> schemas.Food:
    """POST /foods (supplier only, must be approved)."""
    refresh(session, now())
    supplier = get_approved_supplier(session, account)

    point = repo.get_point(session, payload.point_id)
    if not point:
        raise MealError("NOT_FOUND", "找不到食物點", 404)

    expires_at_utc = to_utc(payload.expires_at)
    if expires_at_utc <= now():
        raise MealError("VALIDATION_ERROR", "最晚食用時間必須在未來", 422)

    row = models.MealFood(
        id=new_id("f"),
        point_id=payload.point_id,
        supplier_id=supplier.id,
        name=payload.name,
        category=payload.category,
        allergens=payload.allergens,
        qty=payload.qty,
        expires_at=expires_at_utc,
        image_id=payload.image_id,
        source_note=payload.source_note,
        closed=False,
        created_at=now(),
    )
    repo.create_food(session, row)
    return to_food(session, row)


def _calc_used_qty(session: Session, food_id: str) -> int:
    """計算已派出與已送達的份數 (claimed, delivering, done)"""
    claims = repo.list_claims(session, food_id=food_id)
    return sum(c.qty for c in claims if c.status in ("claimed", "delivering", "done"))


def update_food(
    session: Session,
    account: CurrentAccount,
    food_id: str,
    payload: MealFoodUpdate,
) -> schemas.Food:
    """PATCH /foods/{id} (supplier only, must own food, M14)."""
    refresh(session, now())
    food = repo.get_food(session, food_id)
    if not food:
        raise MealError("NOT_FOUND", "找不到食物", 404)

    supplier = repo.get_supplier_by_account(session, account.id)
    if not supplier or food.supplier_id != supplier.id:
        raise MealError("NOT_OWNER", "只能修改自己的食物", 403)

    if payload.expires_at is not None:
        expires_at_utc = to_utc(payload.expires_at)
        if expires_at_utc <= now():
            raise MealError("VALIDATION_ERROR", "最晚食用時間不能早於現在", 422)

    if payload.qty is not None:
        used_qty = _calc_used_qty(session, food.id)
        if payload.qty < used_qty:
            raise MealError("QTY_BELOW_USED", "份數不能小於已派出加已送達的份數", 409)

    changes: dict[str, Any] = {}
    if payload.qty is not None:
        changes["qty"] = payload.qty
    if payload.expires_at is not None:
        changes["expires_at"] = to_utc(payload.expires_at)
    if payload.closed is not None:
        changes["closed"] = payload.closed

    if changes:
        repo.update_food(session, food, **changes)

    return to_food(session, food)


ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def upload_image(
    session: Session,
    account: CurrentAccount,
    payload: schemas.ImageUpload,
) -> schemas.ImageUploaded:
    """POST /images (M19: data URL 解析、大小與格式檢查)。"""
    raw_url = payload.data_url.strip()
    if not raw_url.startswith("data:") or ";base64," not in raw_url:
        raise MealError("VALIDATION_ERROR", "圖片格式必須為 base64 data URL", 422)

    header, encoded = raw_url.split(";base64,", 1)
    mime = header[len("data:") :]
    if mime not in ALLOWED_MIME_TYPES:
        raise MealError("VALIDATION_ERROR", f"不支援的圖片格式: {mime}", 422)

    try:
        data_bytes = base64.b64decode(encoded)
    except (binascii.Error, ValueError):
        raise MealError("VALIDATION_ERROR", "base64 編碼無效", 422)

    size = len(data_bytes)
    max_bytes = settings().IMAGE_MAX_BYTES
    if size > max_bytes:
        raise MealError("IMAGE_TOO_LARGE", f"圖片大小超過上限 {max_bytes} bytes", 413)

    row = models.MealImage(
        id=new_id("img"),
        mime=mime,
        data=data_bytes,
        size=size,
        uploaded_by=account.id,
        created_at=now(),
    )
    repo.create_image(session, row)

    return schemas.ImageUploaded(
        id=row.id,
        image_url=image_url(row.id) or "",
        mime=row.mime,
        size=row.size,
    )


def get_image(session: Session, image_id: str) -> Response:
    """GET /images/{id} 公開讀取圖片二進位串流。"""
    row = repo.get_image(session, image_id)
    if not row:
        raise MealError("NOT_FOUND", "找不到圖片", 404)
    return Response(content=row.data, media_type=row.mime)
