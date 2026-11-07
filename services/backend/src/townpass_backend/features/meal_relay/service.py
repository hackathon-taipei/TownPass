"""LOGIC LAYER - 鄰食轉運站的共用規則（合約 docs/system/11-meal-relay.md）。

其他 meal_* 套件只從套件根 `townpass_backend.features.meal_relay` 使用這裡的東西（B5）。
- 設定值（§5）：`settings()`，依環境變數 MEAL_RELAY_MODE（預設 demo）
- 時間：資料庫存 UTC（有時區）；`now()` 回傳 UTC，`to_local()` 轉成 +08:00 輸出
- `refresh(session, now)`：M6、M18 寫回資料庫（M20：每個請求先跑）
- 計算欄位：M1（remaining／status）、M5（unclaimed）、M10（長者警示）
- `to_xxx()`：資料列 → 回應型別（schemas.py）
- 種子匯入、`seed()`、`reset_demo()`
"""

import json
import math
import os
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Protocol

from sqlmodel import Session, SQLModel

from . import repo
from .models import (
    MealAccount,
    MealAssignment,
    MealCheckin,
    MealClaim,
    MealElder,
    MealFood,
    MealPoint,
    MealStation,
    MealSupplier,
    MealVisit,
)
from .schemas import (
    Assignment,
    Checkin,
    Claim,
    ClaimElder,
    Elder,
    Food,
    Location,
    Me,
    Point,
    Station,
    Supplier,
    Visit,
)

# ---------------------------------------------------------------- 設定值（§5）


@dataclass(frozen=True)
class Settings:
    mode: str
    CLAIM_WINDOW_SEC: int
    CARE_ALERT_DAYS: int
    MEAL_ALERT_DAYS: int
    DISPATCH_LIMIT: int
    ASSIGNMENT_TTL_MIN: int
    MAX_QTY_PER_CLAIM: int
    DUPLICATE_RADIUS_M: int
    IMAGE_MAX_BYTES: int


DEMO_SETTINGS = Settings("demo", 20, 1, 1, 3, 30, 2, 30, 200_000)
PROD_SETTINGS = Settings("prod", 600, 3, 3, 5, 240, 2, 30, 200_000)


def settings() -> Settings:
    """每次呼叫都讀環境變數 MEAL_RELAY_MODE（demo|prod，預設 demo），測試可直接改環境變數。"""
    return PROD_SETTINGS if os.getenv("MEAL_RELAY_MODE", "demo").strip().lower() == "prod" else DEMO_SETTINGS


# ---------------------------------------------------------------- 錯誤（§7）

ERROR_STATUS: dict[str, int] = {
    "UNAUTHENTICATED": 401,
    "FORBIDDEN_ROLE": 403,
    "NOT_OWNER": 403,
    "WRONG_STATION": 403,
    "SUPPLIER_NOT_APPROVED": 403,
    "NOT_FOUND": 404,
    "VALIDATION_ERROR": 422,
    "QTY_EXCEEDED": 409,
    "FOOD_NOT_OPEN": 409,
    "ALLERGEN_CONFLICT": 409,
    "INVALID_STATE": 409,
    "ALREADY_APPLIED": 409,
    "ELDER_PROFILE_REQUIRED": 409,
    "FRESH_CANNOT_LEAVE": 409,
    "PHOTO_REQUIRED": 422,
    "IMAGE_TOO_LARGE": 413,
}


class MealError(Exception):
    """業務錯誤。api 層（或 deps.MealRoute）轉成 `{"detail": {"code", "message"}}`。"""

    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status if status is not None else ERROR_STATUS.get(code, 400)


# ---------------------------------------------------------------- 時間與 ID

TAIPEI = timezone(timedelta(hours=8), "Asia/Taipei")


def now() -> datetime:
    """現在時間（UTC，有時區，跟資料庫存的格式一樣）。"""
    return datetime.now(UTC)


def to_utc(dt: datetime) -> datetime:
    """請求送來的時間 → 存資料庫的格式。沒時區的視為 +08:00（台北時間）。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TAIPEI)
    return dt.astimezone(UTC)


def to_local(dt: datetime | None) -> datetime | None:
    """資料庫時間（UTC）→ 輸出用的 +08:00。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(TAIPEI)


def local_day_start(at: datetime | None = None) -> datetime:
    """「今天」（以 +08:00 判斷）的 0 點，回傳 UTC 格式，可直接拿來查詢 `>= since`。"""
    local = to_local(at or now())
    assert local is not None
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.astimezone(UTC)


def new_id(prefix: str) -> str:
    """後端產生的 ID：`<前綴>-<8 碼隨機>`（§3）。"""
    return f"{prefix}-{secrets.token_hex(4)}"


__RELATIVE_TIME = re.compile(r"^now(?:\s*([+-])\s*(\d+)\s*([smhd]))?$")
__UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_time(value: str | datetime | None, at: datetime | None = None) -> datetime | None:
    """種子用的時間：`"now"`、`"now+90m"`、`"now-2d"`（單位 s／m／h／d）或 ISO 8601。"""
    if value is None or isinstance(value, datetime):
        return to_utc(value) if isinstance(value, datetime) else None
    base = at or now()
    m = __RELATIVE_TIME.match(value.strip())
    if m:
        sign, amount, unit = m.groups()
        if sign is None:
            return base
        delta = timedelta(seconds=int(amount) * __UNIT_SECONDS[unit])
        return base + delta if sign == "+" else base - delta
    return to_utc(datetime.fromisoformat(value))


# ---------------------------------------------------------------- 距離與過敏原


class HasLatLng(Protocol):
    lat: float
    lng: float


def distance_m(a: HasLatLng, b: HasLatLng) -> float:
    """兩點距離（公尺，haversine）。資料列與 Location 都可以傳。"""
    r = 6_371_000.0
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp, dl = p2 - p1, math.radians(b.lng - a.lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def allergen_conflict(food: MealFood | Food, elder: MealElder | Elder) -> list[str]:
    """M4：食物與長者過敏原的交集（空 list = 沒衝突）。"""
    return sorted(set(food.allergens or []) & set(elder.allergens or []))


# ---------------------------------------------------------------- M1 / M5 食物計算


def food_remaining(session: Session, food: MealFood) -> int:
    """M1：qty − Σ 未取消申請的 qty（不會小於 0）。"""
    return max(0, food.qty - repo.claimed_qty(session, food.id))


def food_status(food: MealFood, remaining: int, at: datetime | None = None) -> str:
    """M1：優先序 closed > expired > claimed > open。"""
    t = at or now()
    if food.closed:
        return "closed"
    if t > food.expires_at:
        return "expired"
    if remaining <= 0:
        return "claimed"
    return "open"


def food_unclaimed(food: MealFood, status: str, at: datetime | None = None) -> bool:
    """M5：status = open 且 now > created_at + CLAIM_WINDOW_SEC。只是提醒，仍可申請。"""
    t = at or now()
    return status == "open" and t > food.created_at + timedelta(seconds=settings().CLAIM_WINDOW_SEC)


# ---------------------------------------------------------------- M10 長者警示


def __due(next_at: datetime | None, last_at: datetime | None, days: int, at: datetime) -> bool:
    if next_at is not None:
        return at >= next_at
    return last_at is None or at - last_at > timedelta(days=days)


def __days_since(last_at: datetime | None, at: datetime) -> int | None:
    if last_at is None:
        return None
    return max(0, math.floor((at - last_at).total_seconds() / 86400))


def care_due(elder: MealElder, at: datetime | None = None) -> bool:
    """M10：next_care_at 有值 ? now ≥ next_care_at : (last_seen_at 為空 或 超過 CARE_ALERT_DAYS)。"""
    return __due(elder.next_care_at, elder.last_seen_at, settings().CARE_ALERT_DAYS, at or now())


def meal_due(elder: MealElder, at: datetime | None = None, pending_request: bool = False) -> bool:
    """M10：同 care_due，用 next_meal_at／last_meal_at／MEAL_ALERT_DAYS；有 requested 申請一律 true。"""
    if pending_request:
        return True
    return __due(elder.next_meal_at, elder.last_meal_at, settings().MEAL_ALERT_DAYS, at or now())


@dataclass(frozen=True)
class ElderFlags:
    care_due: bool
    meal_due: bool
    alert: bool
    days_since_seen: int | None
    days_since_meal: int | None
    pending_request: bool


def elder_flags(session: Session, elder: MealElder, at: datetime | None = None) -> ElderFlags:
    t = at or now()
    pending = repo.has_claim_with_status(session, elder.id, "requested")
    care = care_due(elder, t)
    meal = meal_due(elder, t, pending)
    return ElderFlags(
        care_due=care,
        meal_due=meal,
        alert=care or meal,
        days_since_seen=__days_since(elder.last_seen_at, t),
        days_since_meal=__days_since(elder.last_meal_at, t),
        pending_request=pending,
    )


# ---------------------------------------------------------------- M6 / M18 refresh（M20）

CANCEL_EXPIRED = "expired"  # M6
CANCEL_RETURNED = "returned"  # M9
CANCEL_RELEASED = "released"  # M18：自動建立、還沒取餐的申請


@dataclass
class RefreshResult:
    cancelled_claims: int = 0
    done_assignments: int = 0
    released_assignments: int = 0


def is_auto_claim(claim: MealClaim, assignment: MealAssignment) -> bool:
    """M17 自動挑食物建立的申請：掛在這個任務上，且 requested_by 是這位志工。

    （T-112 建立自動申請時 requested_by 必須填志工帳號 id；長者自己申請的 requested_by 是長者帳號。）
    """
    return claim.assignment_id == assignment.id and claim.requested_by == assignment.volunteer_id


def refresh(session: Session, at: datetime | None = None) -> RefreshResult:
    """M20：每個請求在業務邏輯前執行。M6（過期取消）＋ M18（任務完成／釋出），寫回資料庫。"""
    t = at or now()
    result = RefreshResult()

    # M6：過期食物的未完成申請一律取消
    expired_ids = [f.id for f in repo.list_foods_expired_before(session, t)]
    if expired_ids:
        for c in repo.list_claims(session, food_ids=expired_ids, statuses=repo.ACTIVE_CLAIM_STATUSES):
            repo.update_claim(session, c, commit=False, status="cancelled", cancel_reason=CANCEL_EXPIRED)
            result.cancelled_claims += 1

    # M18：進行中的任務
    for a in repo.list_assignments(session, status="assigned"):
        visits = [
            v
            for v in repo.list_visits(session, elder_id=a.elder_id, since=a.assigned_at)
            if v.visited_at <= t
        ]
        if visits:  # 該長者有一筆拜訪回報就 done
            repo.update_assignment(session, a, commit=False, status="done", done_at=visits[0].visited_at)
            result.done_assignments += 1
            continue
        if t <= a.expires_at:
            continue
        repo.update_assignment(session, a, commit=False, status="released")
        result.released_assignments += 1
        claim = repo.get_claim(session, a.claim_id) if a.claim_id else None
        if claim is None or claim.status != "claimed":
            continue  # 已在 delivering（或已結束）的不動
        if is_auto_claim(claim, a):
            repo.update_claim(session, claim, commit=False, status="cancelled", cancel_reason=CANCEL_RELEASED)
            result.cancelled_claims += 1
        else:  # 原本是長者 requested 的申請退回 requested
            repo.update_claim(
                session,
                claim,
                commit=False,
                status="requested",
                volunteer_id=None,
                assignment_id=None,
                claimed_at=None,
            )

    repo.commit(session)
    return result


# ---------------------------------------------------------------- 身分（§2）


def get_account_or_default(session: Session, account_id: str) -> MealAccount:
    """匯入過的帳號；沒匯入的 id 一律視為長者（V2）。回傳的預設帳號不寫進資料庫。"""
    account = repo.get_account(session, account_id)
    if account is not None:
        return account
    return MealAccount(id=account_id, role="elder", name="", created_at=now())


def ensure_station_access(account: MealAccount, station_id: str) -> None:
    """M13：志工只能看、改自己據點；管理員全部。其他角色不在這裡判斷。"""
    if account.role == "volunteer" and account.station_id != station_id:
        raise MealError("WRONG_STATION", "這位長者不屬於你的據點")


QR_PREFIX = "meal-relay:checkin:"


def station_qr_text(station: MealStation) -> str:
    """M15：據點 QR 內容。"""
    return f"{QR_PREFIX}{station.checkin_code}"


def parse_qr_text(text: str) -> str | None:
    """M15：QR 文字 → checkin_code；格式不對回傳 None。"""
    text = text.strip()
    if not text.startswith(QR_PREFIX):
        return None
    return text[len(QR_PREFIX) :] or None


# ---------------------------------------------------------------- 轉成回應型別


def image_url(image_id: str | None) -> str | None:
    """相對於後端網址的圖片路徑（前端要自己接上 API base）。"""
    return f"/meal-relay/images/{image_id}" if image_id else None


def to_location(row: HasLatLng) -> Location:
    return Location(lat=row.lat, lng=row.lng)


def __local(dt: datetime) -> datetime:
    out = to_local(dt)
    assert out is not None
    return out


def to_supplier(row: MealSupplier) -> Supplier:
    return Supplier(
        id=row.id,
        account_id=row.account_id,
        name=row.name,
        org_type=row.org_type,  # type: ignore[arg-type]
        location=to_location(row),
        status=row.status,  # type: ignore[arg-type]
        created_at=__local(row.created_at),
        reviewed_at=to_local(row.reviewed_at),
    )


def to_station(row: MealStation) -> Station:
    return Station(id=row.id, name=row.name, location=to_location(row), source=row.source)


def to_point(row: MealPoint, open_food_count: int = 0) -> Point:
    return Point(
        id=row.id,
        name=row.name,
        kind=row.kind,  # type: ignore[arg-type]
        location=to_location(row),
        source=row.source,
        created_by=row.created_by,
        open_food_count=open_food_count,
    )


def to_food(session: Session, row: MealFood, at: datetime | None = None) -> Food:
    t = at or now()
    point = repo.get_point(session, row.point_id)
    supplier = repo.get_supplier(session, row.supplier_id)
    remaining = food_remaining(session, row)
    status = food_status(row, remaining, t)
    return Food(
        id=row.id,
        point_id=row.point_id,
        supplier_id=row.supplier_id,
        name=row.name,
        category=row.category,  # type: ignore[arg-type]
        allergens=list(row.allergens or []),  # type: ignore[arg-type]
        qty=row.qty,
        expires_at=__local(row.expires_at),
        image_id=row.image_id,
        source_note=row.source_note,
        closed=row.closed,
        created_at=__local(row.created_at),
        location=to_location(point) if point else Location(lat=0, lng=0),
        point_name=point.name if point else "",
        supplier_name=supplier.name if supplier else "",
        remaining=remaining,
        status=status,  # type: ignore[arg-type]
        unclaimed=food_unclaimed(row, status, t),
        image_url=image_url(row.image_id),
    )


def to_elder(session: Session, row: MealElder, at: datetime | None = None) -> Elder:
    flags = elder_flags(session, row, at)
    return Elder(
        id=row.id,
        alias=row.alias,
        account_id=row.account_id,
        station_id=row.station_id,
        allergens=list(row.allergens or []),  # type: ignore[arg-type]
        created_by=row.created_by,
        created_at=__local(row.created_at),
        last_seen_at=to_local(row.last_seen_at),
        last_meal_at=to_local(row.last_meal_at),
        next_care_at=to_local(row.next_care_at),
        next_meal_at=to_local(row.next_meal_at),
        primary_volunteer_id=row.primary_volunteer_id,
        merged_into=row.merged_into,
        location=to_location(row),
        care_due=flags.care_due,
        meal_due=flags.meal_due,
        alert=flags.alert,
        days_since_seen=flags.days_since_seen,
        days_since_meal=flags.days_since_meal,
        pending_request=flags.pending_request,
    )


def to_claim(session: Session, row: MealClaim, at: datetime | None = None) -> Claim:
    food = repo.get_food(session, row.food_id)
    elder = repo.get_elder(session, row.elder_id)
    if food is None:
        raise MealError("NOT_FOUND", f"找不到申請 {row.id} 的食物")
    return Claim(
        id=row.id,
        food_id=row.food_id,
        elder_id=row.elder_id,
        qty=row.qty,
        method=row.method,  # type: ignore[arg-type]
        status=row.status,  # type: ignore[arg-type]
        requested_by=row.requested_by,
        volunteer_id=row.volunteer_id,
        assignment_id=row.assignment_id,
        created_at=__local(row.created_at),
        claimed_at=to_local(row.claimed_at),
        picked_up_at=to_local(row.picked_up_at),
        done_at=to_local(row.done_at),
        cancel_reason=row.cancel_reason,
        food=to_food(session, food, at),
        elder=ClaimElder(
            id=row.elder_id,
            alias=elder.alias if elder else "",
            location=to_location(elder) if elder else Location(lat=0, lng=0),
        ),
    )


def to_visit(row: MealVisit) -> Visit:
    return Visit(
        id=row.id,
        elder_id=row.elder_id,
        volunteer_id=row.volunteer_id,
        kind=row.kind,  # type: ignore[arg-type]
        claim_id=row.claim_id,
        assignment_id=row.assignment_id,
        result=row.result,  # type: ignore[arg-type]
        photo_image_id=row.photo_image_id,
        visited_at=__local(row.visited_at),
        photo_url=image_url(row.photo_image_id),
    )


def to_checkin(session: Session, row: MealCheckin) -> Checkin:
    volunteer = repo.get_account(session, row.volunteer_id)
    return Checkin(
        id=row.id,
        volunteer_id=row.volunteer_id,
        volunteer_name=volunteer.name if volunteer else "",
        station_id=row.station_id,
        checked_in_at=__local(row.checked_in_at),
    )


def to_assignment(session: Session, row: MealAssignment, at: datetime | None = None) -> Assignment:
    elder = repo.get_elder(session, row.elder_id)
    if elder is None:
        raise MealError("NOT_FOUND", f"找不到任務 {row.id} 的長者")
    claim = repo.get_claim(session, row.claim_id) if row.claim_id else None
    return Assignment(
        id=row.id,
        checkin_id=row.checkin_id,
        volunteer_id=row.volunteer_id,
        elder_id=row.elder_id,
        station_id=row.station_id,
        needs_meal=row.needs_meal,
        needs_care=row.needs_care,
        claim_id=row.claim_id,
        status=row.status,  # type: ignore[arg-type]
        assigned_at=__local(row.assigned_at),
        expires_at=__local(row.expires_at),
        done_at=to_local(row.done_at),
        elder=to_elder(session, elder, at),
        claim=to_claim(session, claim, at) if claim else None,
    )


def to_me(session: Session, account: MealAccount, at: datetime | None = None) -> Me:
    supplier = (
        repo.get_supplier(session, account.supplier_id)
        if account.supplier_id
        else repo.get_supplier_by_account(session, account.id)
    )
    elder = repo.get_elder(session, account.elder_id) if account.elder_id else None
    if elder is None:
        elder = repo.get_elder_by_account(session, account.id)
    return Me(
        id=account.id,
        role=account.role,  # type: ignore[arg-type]
        name=account.name,
        station_id=account.station_id,
        supplier=to_supplier(supplier) if supplier else None,
        elder=to_elder(session, elder, at) if elder else None,
    )


# ---------------------------------------------------------------- 種子（§10）

SEED_DIR = Path(__file__).parent / "seed"

# 匯入順序與對應的資料表
__SEED_FILES: tuple[tuple[str, type[SQLModel]], ...] = (
    ("accounts.json", MealAccount),
    ("stations.json", MealStation),
    ("suppliers.json", MealSupplier),
    ("points.json", MealPoint),
    ("foods.json", MealFood),
    ("elders.json", MealElder),
    ("claims.json", MealClaim),
)


def __seed_row(model: type[SQLModel], record: dict[str, Any], at: datetime) -> SQLModel:
    data = dict(record)
    data.pop("_note", None)  # 種子檔裡給人看的說明
    for key, value in list(data.items()):
        if key.endswith("_at"):
            data[key] = parse_time(value, at)
    return model(**data)


def import_seed(session: Session, at: datetime | None = None, seed_dir: Path | None = None) -> int:
    """讀 seed/*.json 寫進資料庫（相對時間以 `at` 換算）。回傳匯入筆數。不檢查是否已有資料。"""
    t = at or now()
    folder = seed_dir or SEED_DIR
    rows: list[SQLModel] = []
    for filename, model in __SEED_FILES:
        path = folder / filename
        if not path.exists():
            continue
        records = json.loads(path.read_text(encoding="utf-8"))
        rows.extend(__seed_row(model, r, t) for r in records)
    repo.save_all(session, rows)
    return len(rows)


def seed(session: Session) -> None:
    """啟動時執行；冪等：已經有任何 meal_account 就跳過。"""
    if repo.has_any_account(session):
        return
    import_seed(session)


def reset_demo(session: Session, at: datetime | None = None) -> int:
    """POST /demo/reset：清空所有 meal_ 表並重新匯入種子（V17）。"""
    repo.clear_all(session)
    return import_seed(session, at)
