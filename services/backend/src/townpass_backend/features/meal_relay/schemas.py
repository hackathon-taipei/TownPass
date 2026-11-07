"""INTERFACE TYPES - 鄰食轉運站全部請求與回應型別（合約 §4、§8）。

前端 `services/web/src/features/meal-relay/data/types.ts` 必須與這裡一致。
- 回應的時間是含 +08:00 的 ISO 8601；位置一律是 `Location {lat, lng}`。
- 請求型別 `extra="forbid"`：多送欄位就 422（VALIDATION_ERROR）。
"""

from datetime import datetime
from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------- 列舉值（§4）

# ADR-026：長者不是帳號（elder 已取消）；沒匯入的帳號是一般市民 citizen
Role = Literal["citizen", "volunteer", "supplier", "station", "admin"]
Allergen = Literal[
    "crustacean", "mango", "peanut", "milk", "egg", "nut", "sesame", "gluten", "soy", "fish", "sulfite"
]
FoodCategory = Literal["meal_box", "bakery", "produce", "dry_goods", "drink", "other"]
OrgType = Literal["person", "school", "agency", "shop", "other"]
SupplierStatus = Literal["pending", "approved", "rejected"]
PointKind = Literal["station", "village_office", "school", "custom"]
# M1：open 可派送、claimed 已全數派出、expired 已過期、closed 已下架
FoodStatus = Literal["open", "claimed", "expired", "closed"]
# ADR-025：申請只由報到派送建立（M7、M17），只剩送餐；pickup、requested、ready_for_pickup 已取消
ClaimMethod = Literal["delivery"]
ClaimStatus = Literal["claimed", "delivering", "done", "cancelled"]
VisitKind = Literal["meal", "care"]
VisitResult = Literal["seen", "left_at_door", "returned"]
AssignmentStatus = Literal["assigned", "done", "released"]

ROLES: tuple[str, ...] = get_args(Role)
ALLERGENS: tuple[str, ...] = get_args(Allergen)
FOOD_CATEGORIES: tuple[str, ...] = get_args(FoodCategory)


class MealRequest(BaseModel):
    """所有請求型別的基底：多送欄位就 422。"""

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- 共用


class Location(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ---------------------------------------------------------------- 回應


class Supplier(BaseModel):
    id: str
    account_id: str
    name: str
    org_type: OrgType
    location: Location
    status: SupplierStatus
    created_at: datetime
    reviewed_at: datetime | None


class Station(BaseModel):
    """不含 checkin_code（只在據點自己的 MyStation.qr_text 出現，M15）。"""

    id: str
    name: str
    location: Location
    source: str


class Point(BaseModel):
    id: str
    name: str
    kind: PointKind
    location: Location
    source: str
    created_by: str | None
    open_food_count: int = 0  # 這個點目前 status = open 的食物數（依查詢條件篩選後）


class Food(BaseModel):
    id: str
    point_id: str
    supplier_id: str
    name: str
    category: FoodCategory
    allergens: list[Allergen]
    qty: int
    expires_at: datetime
    image_id: str | None
    source_note: str
    closed: bool
    created_at: datetime
    # 計算欄位
    location: Location  # 食物點位置
    point_name: str
    supplier_name: str
    remaining: int  # M1
    dispatched_qty: int  # M1 派出中
    delivered_qty: int  # M1 已送達
    status: FoodStatus  # M1
    unclaimed: bool  # M5
    image_url: str | None  # /meal-relay/images/{id}


class Elder(BaseModel):
    id: str
    alias: str
    account_id: str | None  # 一律 null（ADR-026：長者不是帳號）
    station_id: str
    allergens: list[Allergen]
    created_by: str
    created_at: datetime
    last_seen_at: datetime | None
    last_meal_at: datetime | None
    next_care_at: datetime | None
    next_meal_at: datetime | None
    primary_volunteer_id: str | None
    merged_into: str | None  # 一律 null（ADR-026：合併長者已取消）
    # 計算欄位（M10）
    location: Location
    care_due: bool
    meal_due: bool
    alert: bool
    days_since_seen: int | None  # 從未見到 → null
    days_since_meal: int | None
    pending_request: bool = False  # 欄位保留但一律 false（ADR-025：長者不訂餐）


class ClaimElder(BaseModel):
    id: str
    alias: str
    location: Location


class Claim(BaseModel):
    id: str
    food_id: str
    elder_id: str
    qty: int
    method: ClaimMethod
    status: ClaimStatus
    requested_by: str
    volunteer_id: str | None
    assignment_id: str | None
    created_at: datetime
    claimed_at: datetime | None
    picked_up_at: datetime | None
    done_at: datetime | None
    cancel_reason: str | None
    food: Food
    elder: ClaimElder


class Visit(BaseModel):
    id: str
    elder_id: str
    volunteer_id: str
    kind: VisitKind
    claim_id: str | None
    assignment_id: str | None
    result: VisitResult
    photo_image_id: str | None
    visited_at: datetime
    photo_url: str | None  # /meal-relay/images/{photo_image_id}


class Checkin(BaseModel):
    id: str
    volunteer_id: str
    volunteer_name: str
    station_id: str
    checked_in_at: datetime


class Assignment(BaseModel):
    id: str
    checkin_id: str
    volunteer_id: str
    elder_id: str
    station_id: str
    needs_meal: bool
    needs_care: bool
    claim_id: str | None
    status: AssignmentStatus
    assigned_at: datetime
    expires_at: datetime
    done_at: datetime | None
    elder: Elder
    claim: Claim | None


class CheckInResult(BaseModel):
    checkin: Checkin
    station: Station
    assignments: list[Assignment]


class MyStation(BaseModel):
    """GET /stations/mine：據點頁顯示 QR 與今天的報到。"""

    station: Station
    qr_text: str  # M15：meal-relay:checkin:<checkin_code>:<token>，token 每 QR_ROTATE_SEC 換一次
    qr_expires_at: datetime  # M15：目前時間窗結束的時間，據點頁在這之前重新取得
    checkins: list[Checkin]


class Me(BaseModel):
    """GET /me（`elder` 欄位已移除，ADR-026）"""

    id: str
    role: Role
    name: str
    station_id: str | None
    supplier: Supplier | None


class ImageUploaded(BaseModel):
    id: str
    image_url: str
    mime: str
    size: int


class DemoResetResult(BaseModel):
    """POST /demo/reset 的回應：重新匯入的種子筆數。"""

    imported: int


class BoardStats(BaseModel):
    foods_open: int
    delivered_today: int
    seen_today: int
    alerts: int
    checkins_today: int


class Board(BaseModel):
    stations: list[Station]
    points: list[Point]
    foods: list[Food]
    elders: list[Elder]
    claims: list[Claim]  # 不含 cancelled
    stats: BoardStats


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    detail: ErrorDetail


# ---------------------------------------------------------------- 請求


class SupplierApply(MealRequest):
    """POST /suppliers"""

    name: str = Field(min_length=1, max_length=60)
    org_type: OrgType
    location: Location


class PointCreate(MealRequest):
    """POST /points"""

    name: str = Field(min_length=1, max_length=60)
    kind: PointKind = "custom"
    location: Location


class FoodCreate(MealRequest):
    """POST /foods"""

    point_id: str
    name: str = Field(min_length=1, max_length=60)
    category: FoodCategory
    allergens: list[Allergen] = Field(default_factory=list)
    qty: int = Field(ge=1, le=999)
    expires_at: datetime
    image_id: str | None = None
    source_note: str = Field(default="", max_length=200)


class FoodUpdate(MealRequest):
    """PATCH /foods/{id}（M14：可改份數、到期時間（最晚食用時間）與下架；只改有送的欄位）"""

    qty: int | None = Field(default=None, ge=0, le=999)  # 不能小於已派出加已送達 → QTY_BELOW_USED
    expires_at: datetime | None = None  # 不能早於現在 → VALIDATION_ERROR
    closed: bool | None = None


class ImageUpload(MealRequest):
    """POST /images：前端壓縮後的 base64 data URL（M19），例：data:image/jpeg;base64,...."""

    data_url: str = Field(min_length=1)


class ClaimCancel(MealRequest):
    """POST /claims/{id}/cancel（body 可省略）"""

    reason: str | None = Field(default=None, max_length=100)


class ElderCreate(MealRequest):
    """POST /elders（admin）：管理員登記長者名冊，回傳建立的 Elder（ADR-026）。"""

    alias: str = Field(min_length=1, max_length=20)
    location: Location
    allergens: list[Allergen] = Field(default_factory=list)
    station_id: str
    next_care_at: datetime | None = None
    next_meal_at: datetime | None = None


class ElderUpdate(MealRequest):
    """PATCH /elders/{id}（admin）：只改有送的欄位。"""

    alias: str | None = Field(default=None, min_length=1, max_length=20)
    location: Location | None = None
    allergens: list[Allergen] | None = None
    station_id: str | None = None
    next_care_at: datetime | None = None
    next_meal_at: datetime | None = None
    primary_volunteer_id: str | None = None


class VisitCreate(MealRequest):
    """POST /visits（M9、M11）。只限志工自己 assigned 任務上的長者（M13）。next_*_at 可順便約下次時間。"""

    elder_id: str
    kind: VisitKind
    result: VisitResult
    claim_id: str | None = None
    assignment_id: str | None = None
    photo_image_id: str | None = None
    next_care_at: datetime | None = None
    next_meal_at: datetime | None = None


class CheckInCreate(MealRequest):
    """POST /checkins：qr_text = 掃到的據點 QR（M15）"""

    qr_text: str = Field(min_length=1, max_length=200)
