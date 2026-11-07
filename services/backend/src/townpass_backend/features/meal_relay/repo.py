"""DATA LAYER - 鄰食轉運站的查詢與寫入。只有查詢，不含商業規則（規則在 service.py）。

寫入函數預設會 commit；一次要寫多筆時傳 `commit=False`，最後再呼叫 `commit(session)`。
其他套件請透過 `from townpass_backend.features.meal_relay import repo` 使用（B5）。
"""

from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func
from sqlmodel import Session, SQLModel, col, select

from .models import (
    ALL_MODELS,
    MealAccount,
    MealAssignment,
    MealCheckin,
    MealClaim,
    MealElder,
    MealFood,
    MealImage,
    MealPoint,
    MealStation,
    MealSupplier,
    MealVisit,
)

# 「未完成」的申請狀態（M6、M8；ADR-025 後只剩這兩種）
ACTIVE_CLAIM_STATUSES = ("claimed", "delivering")


# ---------------------------------------------------------------- 共用寫入


def commit(session: Session) -> None:
    session.commit()


def save[T: SQLModel](session: Session, row: T, *, commit: bool = True) -> T:
    """新增或更新一筆（同一個 ORM 物件改完欄位再 save 就是更新）。"""
    session.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    else:
        session.flush()
    return row


def save_all(session: Session, rows: Iterable[SQLModel], *, commit: bool = True) -> None:
    session.add_all(list(rows))
    if commit:
        session.commit()
    else:
        session.flush()


def __update[T: SQLModel](session: Session, row: T, changes: dict[str, Any], commit: bool) -> T:
    for key, value in changes.items():
        if not hasattr(row, key):
            raise AttributeError(f"{type(row).__name__} 沒有欄位 {key}")
        setattr(row, key, value)
    return save(session, row, commit=commit)


def clear_all(session: Session) -> None:
    """刪除所有 meal_ 表的資料（重置 Demo 用）。"""
    for model in reversed(ALL_MODELS):
        session.exec(delete(model))  # type: ignore[call-overload]
    session.commit()


# ---------------------------------------------------------------- meal_account


def get_account(session: Session, account_id: str) -> MealAccount | None:
    return session.get(MealAccount, account_id)


def list_accounts(
    session: Session, role: str | None = None, station_id: str | None = None
) -> list[MealAccount]:
    stmt = select(MealAccount).order_by(col(MealAccount.id))
    if role:
        stmt = stmt.where(MealAccount.role == role)
    if station_id:
        stmt = stmt.where(MealAccount.station_id == station_id)
    return list(session.exec(stmt))


def has_any_account(session: Session) -> bool:
    return session.exec(select(MealAccount.id).limit(1)).first() is not None


def create_account(session: Session, row: MealAccount, *, commit: bool = True) -> MealAccount:
    return save(session, row, commit=commit)


def update_account(session: Session, row: MealAccount, *, commit: bool = True, **changes: Any) -> MealAccount:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_station


def get_station(session: Session, station_id: str) -> MealStation | None:
    return session.get(MealStation, station_id)


def get_station_by_code(session: Session, checkin_code: str) -> MealStation | None:
    return session.exec(select(MealStation).where(MealStation.checkin_code == checkin_code)).first()


def list_stations(session: Session) -> list[MealStation]:
    return list(session.exec(select(MealStation).order_by(col(MealStation.id))))


def create_station(session: Session, row: MealStation, *, commit: bool = True) -> MealStation:
    return save(session, row, commit=commit)


def update_station(session: Session, row: MealStation, *, commit: bool = True, **changes: Any) -> MealStation:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_supplier


def get_supplier(session: Session, supplier_id: str) -> MealSupplier | None:
    return session.get(MealSupplier, supplier_id)


def get_supplier_by_account(session: Session, account_id: str) -> MealSupplier | None:
    stmt = (
        select(MealSupplier)
        .where(MealSupplier.account_id == account_id)
        .order_by(col(MealSupplier.created_at))
    )
    return session.exec(stmt).first()


def list_suppliers(session: Session, status: str | None = None) -> list[MealSupplier]:
    stmt = select(MealSupplier).order_by(col(MealSupplier.created_at), col(MealSupplier.id))
    if status:
        stmt = stmt.where(MealSupplier.status == status)
    return list(session.exec(stmt))


def create_supplier(session: Session, row: MealSupplier, *, commit: bool = True) -> MealSupplier:
    return save(session, row, commit=commit)


def update_supplier(
    session: Session, row: MealSupplier, *, commit: bool = True, **changes: Any
) -> MealSupplier:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_point


def get_point(session: Session, point_id: str) -> MealPoint | None:
    return session.get(MealPoint, point_id)


def list_points(
    session: Session, ids: Sequence[str] | None = None, kind: str | None = None
) -> list[MealPoint]:
    stmt = select(MealPoint).order_by(col(MealPoint.id))
    if ids is not None:
        stmt = stmt.where(col(MealPoint.id).in_(list(ids)))
    if kind:
        stmt = stmt.where(MealPoint.kind == kind)
    return list(session.exec(stmt))


def create_point(session: Session, row: MealPoint, *, commit: bool = True) -> MealPoint:
    return save(session, row, commit=commit)


def update_point(session: Session, row: MealPoint, *, commit: bool = True, **changes: Any) -> MealPoint:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_food


def get_food(session: Session, food_id: str) -> MealFood | None:
    return session.get(MealFood, food_id)


def list_foods(
    session: Session,
    *,
    point_id: str | None = None,
    point_ids: Sequence[str] | None = None,
    category: str | None = None,
    supplier_id: str | None = None,
    include_closed: bool = True,
) -> list[MealFood]:
    """依食物點、種類、提供者篩選。剩餘份數與狀態（M1）由 service 計算。"""
    stmt = select(MealFood).order_by(col(MealFood.expires_at), col(MealFood.id))
    if point_id:
        stmt = stmt.where(MealFood.point_id == point_id)
    if point_ids is not None:
        stmt = stmt.where(col(MealFood.point_id).in_(list(point_ids)))
    if category:
        stmt = stmt.where(MealFood.category == category)
    if supplier_id:
        stmt = stmt.where(MealFood.supplier_id == supplier_id)
    if not include_closed:
        stmt = stmt.where(col(MealFood.closed).is_(False))
    return list(session.exec(stmt))


def list_foods_expired_before(session: Session, when: datetime) -> list[MealFood]:
    return list(session.exec(select(MealFood).where(MealFood.expires_at < when)))


def claimed_qty(session: Session, food_id: str) -> int:
    """未取消申請的份數合計（M1 的 Σ）。"""
    stmt = select(func.coalesce(func.sum(MealClaim.qty), 0)).where(
        MealClaim.food_id == food_id, MealClaim.status != "cancelled"
    )
    return int(session.exec(stmt).one())


def create_food(session: Session, row: MealFood, *, commit: bool = True) -> MealFood:
    return save(session, row, commit=commit)


def update_food(session: Session, row: MealFood, *, commit: bool = True, **changes: Any) -> MealFood:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_image


def get_image(session: Session, image_id: str) -> MealImage | None:
    return session.get(MealImage, image_id)


def create_image(session: Session, row: MealImage, *, commit: bool = True) -> MealImage:
    return save(session, row, commit=commit)


# ---------------------------------------------------------------- meal_elder


def get_elder(session: Session, elder_id: str) -> MealElder | None:
    return session.get(MealElder, elder_id)


def get_elder_by_account(session: Session, account_id: str) -> MealElder | None:
    """自己用 App 的長者以 account_id 唯一（M12）。"""
    stmt = select(MealElder).where(MealElder.account_id == account_id, col(MealElder.merged_into).is_(None))
    return session.exec(stmt).first()


def list_elders(
    session: Session,
    *,
    station_id: str | None = None,
    primary_volunteer_id: str | None = None,
    ids: Sequence[str] | None = None,
    include_merged: bool = False,
) -> list[MealElder]:
    """預設不含已合併的長者（M13）。"""
    stmt = select(MealElder).order_by(col(MealElder.id))
    if station_id:
        stmt = stmt.where(MealElder.station_id == station_id)
    if primary_volunteer_id:
        stmt = stmt.where(MealElder.primary_volunteer_id == primary_volunteer_id)
    if ids is not None:
        stmt = stmt.where(col(MealElder.id).in_(list(ids)))
    if not include_merged:
        stmt = stmt.where(col(MealElder.merged_into).is_(None))
    return list(session.exec(stmt))


def create_elder(session: Session, row: MealElder, *, commit: bool = True) -> MealElder:
    return save(session, row, commit=commit)


def update_elder(session: Session, row: MealElder, *, commit: bool = True, **changes: Any) -> MealElder:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_claim


def get_claim(session: Session, claim_id: str) -> MealClaim | None:
    return session.get(MealClaim, claim_id)


def list_claims(
    session: Session,
    *,
    status: str | None = None,
    statuses: Sequence[str] | None = None,
    exclude_status: str | None = None,
    food_id: str | None = None,
    food_ids: Sequence[str] | None = None,
    elder_id: str | None = None,
    elder_ids: Sequence[str] | None = None,
    volunteer_id: str | None = None,
    requested_by: str | None = None,
    assignment_id: str | None = None,
) -> list[MealClaim]:
    stmt = select(MealClaim).order_by(col(MealClaim.created_at), col(MealClaim.id))
    if status:
        stmt = stmt.where(MealClaim.status == status)
    if statuses is not None:
        stmt = stmt.where(col(MealClaim.status).in_(list(statuses)))
    if exclude_status:
        stmt = stmt.where(MealClaim.status != exclude_status)
    if food_id:
        stmt = stmt.where(MealClaim.food_id == food_id)
    if food_ids is not None:
        stmt = stmt.where(col(MealClaim.food_id).in_(list(food_ids)))
    if elder_id:
        stmt = stmt.where(MealClaim.elder_id == elder_id)
    if elder_ids is not None:
        stmt = stmt.where(col(MealClaim.elder_id).in_(list(elder_ids)))
    if volunteer_id:
        stmt = stmt.where(MealClaim.volunteer_id == volunteer_id)
    if requested_by:
        stmt = stmt.where(MealClaim.requested_by == requested_by)
    if assignment_id:
        stmt = stmt.where(MealClaim.assignment_id == assignment_id)
    return list(session.exec(stmt))


def create_claim(session: Session, row: MealClaim, *, commit: bool = True) -> MealClaim:
    return save(session, row, commit=commit)


def update_claim(session: Session, row: MealClaim, *, commit: bool = True, **changes: Any) -> MealClaim:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_visit


def get_visit(session: Session, visit_id: str) -> MealVisit | None:
    return session.get(MealVisit, visit_id)


def list_visits(
    session: Session,
    *,
    elder_id: str | None = None,
    volunteer_id: str | None = None,
    assignment_id: str | None = None,
    since: datetime | None = None,
) -> list[MealVisit]:
    stmt = select(MealVisit).order_by(col(MealVisit.visited_at), col(MealVisit.id))
    if elder_id:
        stmt = stmt.where(MealVisit.elder_id == elder_id)
    if volunteer_id:
        stmt = stmt.where(MealVisit.volunteer_id == volunteer_id)
    if assignment_id:
        stmt = stmt.where(MealVisit.assignment_id == assignment_id)
    if since is not None:
        stmt = stmt.where(MealVisit.visited_at >= since)
    return list(session.exec(stmt))


def create_visit(session: Session, row: MealVisit, *, commit: bool = True) -> MealVisit:
    return save(session, row, commit=commit)


def update_visit(session: Session, row: MealVisit, *, commit: bool = True, **changes: Any) -> MealVisit:
    return __update(session, row, changes, commit)


# ---------------------------------------------------------------- meal_checkin


def get_checkin(session: Session, checkin_id: str) -> MealCheckin | None:
    return session.get(MealCheckin, checkin_id)


def list_checkins(
    session: Session,
    *,
    station_id: str | None = None,
    volunteer_id: str | None = None,
    since: datetime | None = None,
) -> list[MealCheckin]:
    """傳 `since = service.local_day_start(now)` 就是「今天的報到」。"""
    stmt = select(MealCheckin).order_by(col(MealCheckin.checked_in_at), col(MealCheckin.id))
    if station_id:
        stmt = stmt.where(MealCheckin.station_id == station_id)
    if volunteer_id:
        stmt = stmt.where(MealCheckin.volunteer_id == volunteer_id)
    if since is not None:
        stmt = stmt.where(MealCheckin.checked_in_at >= since)
    return list(session.exec(stmt))


def create_checkin(session: Session, row: MealCheckin, *, commit: bool = True) -> MealCheckin:
    return save(session, row, commit=commit)


# ---------------------------------------------------------------- meal_assignment


def get_assignment(session: Session, assignment_id: str) -> MealAssignment | None:
    return session.get(MealAssignment, assignment_id)


def list_assignments(
    session: Session,
    *,
    status: str | None = None,
    volunteer_id: str | None = None,
    elder_id: str | None = None,
    station_id: str | None = None,
    checkin_id: str | None = None,
) -> list[MealAssignment]:
    """`status="assigned"` 搭配 volunteer_id／elder_id 就是進行中的任務。"""
    stmt = select(MealAssignment).order_by(col(MealAssignment.assigned_at), col(MealAssignment.id))
    if status:
        stmt = stmt.where(MealAssignment.status == status)
    if volunteer_id:
        stmt = stmt.where(MealAssignment.volunteer_id == volunteer_id)
    if elder_id:
        stmt = stmt.where(MealAssignment.elder_id == elder_id)
    if station_id:
        stmt = stmt.where(MealAssignment.station_id == station_id)
    if checkin_id:
        stmt = stmt.where(MealAssignment.checkin_id == checkin_id)
    return list(session.exec(stmt))


def create_assignment(session: Session, row: MealAssignment, *, commit: bool = True) -> MealAssignment:
    return save(session, row, commit=commit)


def update_assignment(
    session: Session, row: MealAssignment, *, commit: bool = True, **changes: Any
) -> MealAssignment:
    return __update(session, row, changes, commit)
