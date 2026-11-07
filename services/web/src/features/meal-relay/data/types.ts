/**
 * DATA LAYER - 鄰食轉運站的型別（合約 docs/system/11-meal-relay.md §4、§8）。
 * 必須與後端 `features/meal_relay/schemas.py` 完全一致：改一邊就要改另一邊。
 * 時間是含 +08:00 的 ISO 8601 字串；位置一律是 Location。
 */

// ---------------------------------------------------------------- 列舉值（§4）

/** ADR-026：長者不是帳號（elder 已取消）；沒匯入的帳號是一般市民 citizen */
export type Role = 'citizen' | 'volunteer' | 'supplier' | 'station' | 'admin'
export type Allergen =
  | 'crustacean'
  | 'mango'
  | 'peanut'
  | 'milk'
  | 'egg'
  | 'nut'
  | 'sesame'
  | 'gluten'
  | 'soy'
  | 'fish'
  | 'sulfite'
export type FoodCategory = 'meal_box' | 'bakery' | 'produce' | 'dry_goods' | 'drink' | 'other'
export type OrgType = 'person' | 'school' | 'agency' | 'shop' | 'other'
export type SupplierStatus = 'pending' | 'approved' | 'rejected'
export type PointKind = 'station' | 'village_office' | 'school' | 'custom'
export type FoodStatus = 'open' | 'claimed' | 'expired' | 'closed'
/** ADR-025：申請只由報到派送建立（M7、M17），只剩送餐 */
export type ClaimMethod = 'delivery'
export type ClaimStatus = 'claimed' | 'delivering' | 'done' | 'cancelled'
export type VisitKind = 'meal' | 'care'
export type VisitResult = 'seen' | 'left_at_door' | 'returned'
export type AssignmentStatus = 'assigned' | 'done' | 'released'

/** ISO 8601 含 +08:00 */
export type IsoDateTime = string

// ---------------------------------------------------------------- 回應

export interface Location {
  lat: number
  lng: number
}

export interface Supplier {
  id: string
  account_id: string
  name: string
  org_type: OrgType
  location: Location
  status: SupplierStatus
  created_at: IsoDateTime
  reviewed_at: IsoDateTime | null
}

export interface Station {
  id: string
  name: string
  location: Location
  source: string
}

export interface Point {
  id: string
  name: string
  kind: PointKind
  location: Location
  source: string
  created_by: string | null
  /** 這個點目前 status = open 的食物數（依查詢條件篩選後） */
  open_food_count: number
}

export interface Food {
  id: string
  point_id: string
  supplier_id: string
  name: string
  category: FoodCategory
  allergens: Allergen[]
  qty: number
  expires_at: IsoDateTime
  image_id: string | null
  source_note: string
  closed: boolean
  created_at: IsoDateTime
  location: Location
  point_name: string
  supplier_name: string
  /** M1 */
  remaining: number
  /** M1 派出中：claimed＋delivering 的份數 */
  dispatched_qty: number
  /** M1 已送達：done 的份數 */
  delivered_qty: number
  /** M1 */
  status: FoodStatus
  /** M5 */
  unclaimed: boolean
  /** 相對於後端網址，例：/meal-relay/images/img-xxxx；顯示用 imageSrc() 轉成完整網址 */
  image_url: string | null
}

export interface Elder {
  id: string
  alias: string
  account_id: string | null
  station_id: string
  allergens: Allergen[]
  created_by: string
  created_at: IsoDateTime
  last_seen_at: IsoDateTime | null
  last_meal_at: IsoDateTime | null
  next_care_at: IsoDateTime | null
  next_meal_at: IsoDateTime | null
  primary_volunteer_id: string | null
  merged_into: string | null
  location: Location
  /** M10 */
  care_due: boolean
  meal_due: boolean
  alert: boolean
  /** 從未見到 → null */
  days_since_seen: number | null
  days_since_meal: number | null
  /** 欄位保留但一律 false（ADR-025：長者不訂餐） */
  pending_request: boolean
}

export interface ClaimElder {
  id: string
  alias: string
  location: Location
}

export interface Claim {
  id: string
  food_id: string
  elder_id: string
  qty: number
  method: ClaimMethod
  status: ClaimStatus
  requested_by: string
  volunteer_id: string | null
  assignment_id: string | null
  created_at: IsoDateTime
  claimed_at: IsoDateTime | null
  picked_up_at: IsoDateTime | null
  done_at: IsoDateTime | null
  cancel_reason: string | null
  food: Food
  elder: ClaimElder
}

export interface Visit {
  id: string
  elder_id: string
  volunteer_id: string
  kind: VisitKind
  claim_id: string | null
  assignment_id: string | null
  result: VisitResult
  photo_image_id: string | null
  visited_at: IsoDateTime
  photo_url: string | null
}

export interface Checkin {
  id: string
  volunteer_id: string
  volunteer_name: string
  station_id: string
  checked_in_at: IsoDateTime
}

export interface Assignment {
  id: string
  checkin_id: string
  volunteer_id: string
  elder_id: string
  station_id: string
  needs_meal: boolean
  needs_care: boolean
  claim_id: string | null
  status: AssignmentStatus
  assigned_at: IsoDateTime
  expires_at: IsoDateTime
  done_at: IsoDateTime | null
  elder: Elder
  claim: Claim | null
}

export interface CheckInResult {
  checkin: Checkin
  station: Station
  assignments: Assignment[]
}

/** GET /stations/mine */
export interface MyStation {
  station: Station
  /** M15：meal-relay:checkin:<checkin_code>:<token>，token 每 QR_ROTATE_SEC 換一次 */
  qr_text: string
  /** M15：目前時間窗結束的時間，據點頁在這之前重新取得 */
  qr_expires_at: IsoDateTime
  checkins: Checkin[]
}

export interface Me {
  id: string
  role: Role
  name: string
  station_id: string | null
  supplier: Supplier | null
}

export interface ImageUploaded {
  id: string
  image_url: string
  mime: string
  size: number
}

export interface DemoResetResult {
  imported: number
}

export interface BoardStats {
  foods_open: number
  delivered_today: number
  seen_today: number
  alerts: number
  checkins_today: number
}

export interface Board {
  stations: Station[]
  points: Point[]
  foods: Food[]
  elders: Elder[]
  /** 不含 cancelled */
  claims: Claim[]
  stats: BoardStats
}

export interface ErrorDetail {
  code: string
  message: string
}

// ---------------------------------------------------------------- 請求（後端 extra="forbid"：不要多送欄位）

export interface SupplierApply {
  name: string
  org_type: OrgType
  location: Location
}

export interface PointCreate {
  name: string
  kind?: PointKind
  location: Location
}

export interface FoodCreate {
  point_id: string
  name: string
  category: FoodCategory
  allergens?: Allergen[]
  qty: number
  expires_at: IsoDateTime
  image_id?: string | null
  source_note?: string
}

/** PATCH /foods/{id}（M14）：qty 不能小於已派出＋已送達（QTY_BELOW_USED）；expires_at 不能早於現在 */
export interface FoodUpdate {
  qty?: number | null
  expires_at?: IsoDateTime | null
  closed?: boolean | null
}

export interface ImageUpload {
  /** data:image/jpeg;base64,...（前端先壓到長邊 800px，M19） */
  data_url: string
}

export interface ClaimCancel {
  reason?: string | null
}

export interface ElderCreate {
  alias: string
  location: Location
  allergens?: Allergen[]
  /** 管理員登記，必填（ADR-026） */
  station_id: string
  next_care_at?: IsoDateTime | null
  next_meal_at?: IsoDateTime | null
}

export interface ElderUpdate {
  alias?: string | null
  location?: Location | null
  allergens?: Allergen[] | null
  station_id?: string | null
  next_care_at?: IsoDateTime | null
  next_meal_at?: IsoDateTime | null
  primary_volunteer_id?: string | null
}

export interface VisitCreate {
  elder_id: string
  kind: VisitKind
  result: VisitResult
  claim_id?: string | null
  assignment_id?: string | null
  photo_image_id?: string | null
  next_care_at?: IsoDateTime | null
  next_meal_at?: IsoDateTime | null
}

export interface CheckInCreate {
  qr_text: string
}

// ---------------------------------------------------------------- 前端專用

/** 斷網時回傳的上次資料會帶 stale_at（存下來的時間，ISO）；線上資料沒有這個欄位 */
export type Cached<T> = T & { stale_at?: IsoDateTime }
