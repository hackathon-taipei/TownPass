"""DATA - 鄰食轉運站全部資料表（合約 docs/system/11-meal-relay.md §3）。

- 表名前綴 `meal_`；位置存 `lat`、`lng` 兩欄（API 輸出時才組成 Location）。
- 時間一律存 UTC（有時區的 datetime；SQLModel 的 UTCDateTime 會拒收沒時區的值），輸出時由 service 轉成 +08:00。
- 每個欄位都有預設值或可為 NULL，讓 `sync_schema()` 只增不減地補欄位。
- 不宣告資料庫外鍵：種子匯入與重置不受順序限制；關聯檢查放在 service。
"""

from datetime import UTC, datetime

from sqlalchemy import JSON, Column, LargeBinary
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class MealAccount(SQLModel, table=True):
    __tablename__ = "meal_account"

    id: str = Field(primary_key=True)  # 前綴 u，或台北通 id
    role: str = Field(default="citizen", index=True)  # 沒匯入的帳號是一般市民（ADR-026）
    name: str = ""
    station_id: str | None = Field(default=None, index=True)  # 志工與據點帳號必填
    supplier_id: str | None = None
    elder_id: str | None = None  # v2.2 起不使用（ADR-026），欄位保留不刪
    created_at: datetime = Field(default_factory=_utcnow)


class MealStation(SQLModel, table=True):
    __tablename__ = "meal_station"

    id: str = Field(primary_key=True)  # 前綴 st
    name: str = ""
    lat: float = 0.0
    lng: float = 0.0
    checkin_code: str = Field(default="", index=True)  # M15：QR 內容用，不等於據點 id
    source: str = "模擬"
    image_id: str | None = None  # 入口照片（ADR-028）：只拍入口或建築外觀，不能有人臉、車牌、門牌
    address: str = ""  # 據點地址（v2.5，ADR-030）：開放資料的機構地址，空字串代表沒填


class MealSupplier(SQLModel, table=True):
    __tablename__ = "meal_supplier"

    id: str = Field(primary_key=True)  # 前綴 s
    account_id: str = Field(default="", index=True)
    name: str = ""
    org_type: str = "other"
    lat: float = 0.0
    lng: float = 0.0
    status: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    reviewed_at: datetime | None = None
    # 店面照片（ADR-029）：只拍招牌或店門口，不能有人臉、車牌、個資；個人提供者（person）一律 None
    image_id: str | None = None
    # 單位地址（v2.5，ADR-030）：只存機構地址；個人提供者（person）一律空字串（AGENTS.md 第 5 條）
    address: str = ""


class MealPoint(SQLModel, table=True):
    __tablename__ = "meal_point"

    id: str = Field(primary_key=True)  # 前綴 p
    name: str = ""
    kind: str = "custom"
    lat: float = 0.0
    lng: float = 0.0
    source: str = "模擬"
    created_by: str | None = None
    image_id: str | None = None  # 入口照片（ADR-028）：只拍入口或建築外觀，不能有人臉、車牌、門牌
    address: str = ""  # 食物點地址（v2.5，ADR-030）：取餐地點的公開地址（機構或店面），空字串代表沒填


class MealFood(SQLModel, table=True):
    __tablename__ = "meal_food"

    id: str = Field(primary_key=True)  # 前綴 f
    point_id: str = Field(default="", index=True)
    supplier_id: str = Field(default="", index=True)
    name: str = ""
    category: str = Field(default="other", index=True)
    allergens: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    qty: int = 0
    expires_at: datetime = Field(default_factory=_utcnow, index=True)
    image_id: str | None = None
    source_note: str = ""
    closed: bool = False  # 下架
    created_at: datetime = Field(default_factory=_utcnow)


class MealImage(SQLModel, table=True):
    __tablename__ = "meal_image"

    id: str = Field(primary_key=True)  # 前綴 img
    mime: str = "image/jpeg"
    data: bytes = Field(default=b"", sa_column=Column(LargeBinary))
    size: int = 0
    uploaded_by: str = ""
    created_at: datetime = Field(default_factory=_utcnow)


class MealElder(SQLModel, table=True):
    __tablename__ = "meal_elder"

    id: str = Field(primary_key=True)  # 前綴 e
    alias: str = ""  # 只存稱呼（例：王阿嬤），不存姓名、身分證、電話
    address: str = ""  # 地址只能是模擬資料（ADR-027）；只給管理員與被派到的志工看（M13）
    account_id: str | None = Field(default=None, index=True)  # v2.2 起不使用（ADR-026），欄位保留不刪
    station_id: str = Field(default="", index=True)
    lat: float = 0.0
    lng: float = 0.0
    allergens: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_by: str = ""  # 登記的管理員帳號 id（長者名冊只有管理員維護，ADR-026）
    created_at: datetime = Field(default_factory=_utcnow)
    last_seen_at: datetime | None = None
    last_meal_at: datetime | None = None
    next_care_at: datetime | None = None
    next_meal_at: datetime | None = None
    primary_volunteer_id: str | None = Field(default=None, index=True)
    merged_into: str | None = None  # v2.2 起不使用（ADR-026），欄位保留不刪


class MealClaim(SQLModel, table=True):
    __tablename__ = "meal_claim"

    id: str = Field(primary_key=True)  # 前綴 c
    food_id: str = Field(default="", index=True)
    elder_id: str = Field(default="", index=True)
    qty: int = 1
    method: str = "delivery"  # ADR-025：只剩送餐（欄位保留）
    status: str = Field(default="claimed", index=True)  # M7：派送建立時就是 claimed
    requested_by: str = ""
    volunteer_id: str | None = Field(default=None, index=True)
    assignment_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    claimed_at: datetime | None = None
    picked_up_at: datetime | None = None
    done_at: datetime | None = None
    cancel_reason: str | None = None


class MealVisit(SQLModel, table=True):
    __tablename__ = "meal_visit"

    id: str = Field(primary_key=True)  # 前綴 vi
    elder_id: str = Field(default="", index=True)
    volunteer_id: str = ""
    kind: str = "care"
    claim_id: str | None = None
    assignment_id: str | None = None
    result: str = "seen"
    photo_image_id: str | None = None
    visited_at: datetime = Field(default_factory=_utcnow, index=True)


class MealCheckin(SQLModel, table=True):
    __tablename__ = "meal_checkin"

    id: str = Field(primary_key=True)  # 前綴 ck
    volunteer_id: str = Field(default="", index=True)  # 帳號 id
    station_id: str = Field(default="", index=True)
    checked_in_at: datetime = Field(default_factory=_utcnow, index=True)


class MealAssignment(SQLModel, table=True):
    __tablename__ = "meal_assignment"

    id: str = Field(primary_key=True)  # 前綴 as
    checkin_id: str = ""
    volunteer_id: str = Field(default="", index=True)
    elder_id: str = Field(default="", index=True)
    station_id: str = Field(default="", index=True)
    needs_meal: bool = False
    needs_care: bool = False
    claim_id: str | None = None
    status: str = Field(default="assigned", index=True)
    assigned_at: datetime = Field(default_factory=_utcnow)
    expires_at: datetime = Field(default_factory=_utcnow)
    done_at: datetime | None = None


# 重置 Demo 時依序清空（M20／§10）；新增 meal_ 表時記得加進來
ALL_MODELS: tuple[type[SQLModel], ...] = (
    MealAccount,
    MealStation,
    MealSupplier,
    MealPoint,
    MealFood,
    MealImage,
    MealElder,
    MealClaim,
    MealVisit,
    MealCheckin,
    MealAssignment,
)
