/**
 * 提供者頁 MR-P06 的邏輯（T-117）。合約 docs/system/11-meal-relay.md v2.2：
 * §2 提供者、§3 meal_food、M1、M5、M14、M19、§7 錯誤、§8 帳號與食物端點、V4、V21。
 *
 * 一般市民：申請（有店面照片先 uploadImage → applySupplier，個人不附照片，ADR-029）→ 審核中／未通過（getMySupplier）。
 *         審核中不能上架（V4）。
 * 提供者：食物點地圖（listPoints）、選點或新增食物點（有入口照片先 uploadImage → createPoint，ADR-028）、
 *         上架（uploadImage → createFood）、
 *         我的庫存（listFoods mine）、改份數與最晚食用時間（updateFood，V21）、下架（updateFood closed）。
 * 讀取失敗用裝置上的資料（stale_at）、寫入停用（ADR-024）。錯誤顯示後端回傳的中文訊息（§7）。
 *
 * 設計 v2（T-136，docs/meal-relay/design-v2/README.md §3.4）：申請 → 審核中／未通過 → 我的庫存｜上架食物，
 * 分頁與網址 `?tab=inventory|publish` 同步（useSupplierTab，router push，App 返回鍵可退回上一個分頁）。
 */
import { computed, reactive, ref, type Ref } from 'vue'
import {
  MealApiError,
  applySupplier,
  createFood,
  createPoint,
  getMe,
  getMySupplier,
  imageSrc,
  listFoods,
  listPoints,
  updateFood,
  uploadImage,
} from '../data'
import type {
  Allergen,
  Food,
  FoodCategory,
  FoodCreate,
  FoodUpdate,
  Location,
  Me,
  OrgType,
  Point,
  PointCreate,
  PointKind,
  Supplier,
  SupplierApply,
} from '../data'
import { useTabQuery } from './brand'
import { qtyHint, QTY_MAX_DEFAULT } from './foodQty'
import { SUPPLIER_STATUS_LABEL } from './mealLabels'
import { showsStorefrontPhoto, supplierPhotoOf } from './placePhoto'
import type { Marker } from './mapMarker'
import { toast } from './toast'

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），本頁用到的型別從這裡轉出去 */
export type { Allergen, Food, FoodCategory, Location, OrgType, Point, PointKind, Supplier } from '../data'

/* ---------------------------------------------------------------- 中文（§4） */

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  person: '個人',
  school: '學校',
  agency: '機關',
  shop: '店家',
  other: '其他',
}
export const ORG_TYPES = Object.keys(ORG_TYPE_LABEL) as OrgType[]
/** 申請表「提供者類型」5 格的順序（設計 v2 03 左：店家、學校、機關、個人、其他） */
export const ORG_TYPE_ORDER: readonly OrgType[] = ['shop', 'school', 'agency', 'person', 'other']

export const POINT_KIND_LABEL: Record<PointKind, string> = {
  station: '關懷據點',
  village_office: '里辦公處',
  school: '學校',
  custom: '自訂',
}

/** 名稱欄位的長度上限（後端 schemas：max_length=60） */
export const NAME_MAX = 60

/** 地址欄位的長度上限（合約 v2.5：SupplierApply.address、PointCreate.address 最長 120 字，ADR-030） */
export const ADDRESS_MAX = 120

/** 審核中（或未通過）的提供者不能上架（V4）；畫面與送出前的檢查都用這句 */
export const NOT_APPROVED_TEXT = '提供者審核中，管理員通過後才能上架食物'

/** 未通過時的說明。合約的 Supplier 沒有「不通過原因」欄位，所以用固定說法（T-136 偏離） */
export const REJECTED_TEXT = '管理員沒有通過這次申請。想知道原因或重新申請，請洽管理員。'

/* ---------------------------------------------------------------- 份數（M1、M14） */

/** 已用掉的份數＝派出中＋已送達（M1）；改份數不能少於這個數（M14） */
export function qtyFloorOf(food: Pick<Food, 'dispatched_qty' | 'delivered_qty'>): number {
  return food.dispatched_qty + food.delivered_qty
}

/** 改份數輸入框的下限：已用掉的份數，至少 1（改成 0 份請用下架） */
export function editQtyMin(food: Pick<Food, 'dispatched_qty' | 'delivered_qty'>): number {
  return Math.max(1, qtyFloorOf(food))
}

/** 份數輸入的錯誤；空字串＝合法（文字沿用 kit 的 qtyHint） */
export function qtyError(qty: number | null, min = 1, max = QTY_MAX_DEFAULT): string {
  return qtyHint(qty === null ? '' : String(qty), min, max)
}

/* ---------------------------------------------------------------- 時間（+08:00） */

const __TAIPEI_OFFSET_MS = 8 * 3600_000

/** <input type="datetime-local"> 的值（台北時間）→ 含 +08:00 的 ISO；格式不對回 null */
export function toTaipeiIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+08:00` : null
}

/** ISO 或毫秒 → datetime-local 的值（台北時間，到分鐘） */
export function toTaipeiLocal(time: string | number): string {
  const t = typeof time === 'number' ? time : Date.parse(time)
  if (Number.isNaN(t)) return ''
  return new Date(t + __TAIPEI_OFFSET_MS).toISOString().slice(0, 16)
}

/** 上架時最晚食用時間的預設值：現在起 3 小時 */
export function defaultExpiresLocal(now: number): string {
  return toTaipeiLocal(now + 3 * 3600_000)
}

/** 最晚食用時間的錯誤（M14：不能早於現在）；空字串＝合法 */
export function expiresError(local: string, now: number): string {
  const iso = toTaipeiIso(local)
  if (!iso) return '請選擇最晚食用時間'
  return Date.parse(iso) <= now ? '最晚食用時間不能早於現在' : ''
}

/* ---------------------------------------------------------------- 表單 */

/** 申請表：店面照片選填，個人提供者（person）不顯示也不送（ADR-029） */
export type ApplyForm = {
  name: string
  org_type: OrgType | null
  location: Location | null
  /** 單位地址（選填，ADR-030）；個人提供者不顯示也不送 */
  address: string
  image: FoodImage | null
  image_preview: string | null
}
export type FoodImage = { data: string; mime: string }
/** 新增食物點：入口照片選填（ADR-028），image_preview 是 ImageInput 的預覽 data URL */
export type PointForm = {
  name: string
  location: Location | null
  /** 食物點地址（選填，ADR-030）：取餐地點的公開地址，不填住家 */
  address: string
  image: FoodImage | null
  image_preview: string | null
}
export type FoodForm = {
  point_id: string | null
  name: string
  category: FoodCategory | null
  allergens: Allergen[]
  qty: number | null
  expires_local: string
  image: FoodImage | null
  /** 預覽用的 data URL（ImageInput 的 previewUrl） */
  image_preview: string | null
}
export type EditForm = { qty: number | null; expires_local: string }

export function emptyApplyForm(): ApplyForm {
  return { name: '', org_type: null, location: null, address: '', image: null, image_preview: null }
}
export function emptyPointForm(): PointForm {
  return { name: '', location: null, address: '', image: null, image_preview: null }
}

/** MR-C06 壓縮後的圖片（base64，不含 data: 前綴）寫進表單；null ＝ 移除 */
export function setFormImage(
  form: { image: FoodImage | null; image_preview: string | null },
  payload: { data: string; mime: string } | null,
): void {
  form.image = payload ? { data: payload.data, mime: payload.mime } : null
  form.image_preview = payload ? `data:${payload.mime};base64,${payload.data}` : null
}
export function emptyFoodForm(now: number, point_id: string | null = null): FoodForm {
  return {
    point_id,
    name: '',
    category: null,
    allergens: [],
    qty: 1,
    expires_local: defaultExpiresLocal(now),
    image: null,
    image_preview: null,
  }
}
export function editFormOf(food: Pick<Food, 'qty' | 'expires_at'>): EditForm {
  return { qty: food.qty, expires_local: toTaipeiLocal(food.expires_at) }
}

type Built<T> = { ok: true; body: T } | { ok: false; errors: Record<string, string> }

function __nameError(name: string, empty: string): string {
  const n = name.trim()
  if (!n) return empty
  return n.length > NAME_MAX ? `最多 ${NAME_MAX} 個字` : ''
}

function __addressError(address: string | undefined): string {
  return (address ?? '').trim().length > ADDRESS_MAX ? `地址最多 ${ADDRESS_MAX} 個字` : ''
}

/** 有填才送地址（選填；空白不送，後端存空字串） */
function __addressBody(address: string | undefined): { address?: string } {
  const a = (address ?? '').trim()
  return a ? { address: a } : {}
}

function __built<T>(errors: Record<string, string>, body: () => T): Built<T> {
  const bad = Object.fromEntries(Object.entries(errors).filter(([, v]) => v))
  return Object.keys(bad).length ? { ok: false, errors: bad } : { ok: true, body: body() }
}

/** 申請表 → POST /suppliers 的內容（後端不收多的欄位）。image_id 由上傳店面照片後補上；個人提供者照片與地址一律不送 */
export function buildSupplierApply(form: ApplyForm, image_id: string | null = null): Built<SupplierApply> {
  const person = form.org_type === 'person'
  return __built(
    {
      name: __nameError(form.name, '請輸入單位名稱'),
      org_type: form.org_type ? '' : '請選擇類型',
      location: form.location ? '' : '請在地圖上選位置',
      address: person ? '' : __addressError(form.address),
    },
    () => ({
      name: form.name.trim(),
      org_type: form.org_type!,
      location: { ...form.location! },
      ...(person ? {} : __addressBody(form.address)),
      ...(image_id && showsStorefrontPhoto(form.org_type) ? { image_id } : {}),
    }),
  )
}

/** 新增食物點 → POST /points（kind 一律 custom；image_id 由上傳入口照片後補上，ADR-028） */
export function buildPointCreate(form: PointForm, image_id: string | null = null): Built<PointCreate> {
  return __built(
    {
      name: __nameError(form.name, '請輸入食物點名稱'),
      location: form.location ? '' : '請在地圖上選位置',
      address: __addressError(form.address),
    },
    () => ({
      name: form.name.trim(),
      kind: 'custom',
      location: { ...form.location! },
      ...__addressBody(form.address),
      ...(image_id ? { image_id } : {}),
    }),
  )
}

/** 上架表單 → POST /foods 的內容（image_id 由上傳圖片後補上） */
export function buildFoodCreate(form: FoodForm, now: number, image_id: string | null = null): Built<FoodCreate> {
  return __built(
    {
      point_id: form.point_id ? '' : '請先選擇食物點',
      name: __nameError(form.name, '請輸入食物名稱'),
      category: form.category ? '' : '請選擇類別',
      qty: qtyError(form.qty),
      expires_at: expiresError(form.expires_local, now),
    },
    () => ({
      point_id: form.point_id!,
      name: form.name.trim(),
      category: form.category!,
      allergens: [...form.allergens],
      qty: form.qty!,
      expires_at: toTaipeiIso(form.expires_local)!,
      ...(image_id ? { image_id } : {}),
    }),
  )
}

/** 修改 → PATCH /foods/{id}：只送有改的欄位；qty 不能少於派出中＋已送達（M14） */
export function buildFoodUpdate(
  food: Pick<Food, 'qty' | 'expires_at' | 'dispatched_qty' | 'delivered_qty'>,
  form: EditForm,
  now: number,
): Built<FoodUpdate> {
  const qtyChanged = form.qty !== food.qty
  const expiresChanged = form.expires_local !== toTaipeiLocal(food.expires_at)
  return __built(
    {
      qty: qtyChanged ? qtyError(form.qty, editQtyMin(food)) : '',
      expires_at: expiresChanged ? expiresError(form.expires_local, now) : '',
      form: qtyChanged || expiresChanged ? '' : '沒有修改任何欄位',
    },
    () => ({
      ...(qtyChanged ? { qty: form.qty! } : {}),
      ...(expiresChanged ? { expires_at: toTaipeiIso(form.expires_local)! } : {}),
    }),
  )
}

/* ---------------------------------------------------------------- 錯誤（§7） */

/** 錯誤要顯示的中文：後端回傳的訊息；不是 MealApiError 就用通用說法 */
export function errorText(e: unknown): string {
  if (e instanceof MealApiError) return e.message || e.code
  return '發生錯誤，請稍後再試'
}

/** 修改失敗時要標在哪個欄位：QTY_BELOW_USED → 份數（V21）、VALIDATION_ERROR 且提到時間 → 最晚食用時間 */
export function editErrorOf(e: unknown): { field: 'qty' | 'expires_at' | null; message: string } {
  const message = errorText(e)
  if (e instanceof MealApiError && e.code === 'QTY_BELOW_USED') return { field: 'qty', message }
  if (e instanceof MealApiError && e.code === 'VALIDATION_ERROR' && /時間/.test(message)) return { field: 'expires_at', message }
  return { field: null, message }
}

/* ---------------------------------------------------------------- 顯示 */

/** 還能上架嗎（V4：只有 approved 的提供者） */
export function canPublishWith(me: Pick<Me, 'role'> | null, supplier: Pick<Supplier, 'status'> | null): boolean {
  return me?.role === 'supplier' && supplier?.status === 'approved'
}

/** 我的庫存的順序：還能派送的（open、claimed）在前，新的在前；過期、下架的在後 */
export function sortInventory(foods: readonly Food[]): Food[] {
  const rank = (f: Food) => (f.status === 'open' || f.status === 'claimed' ? 0 : 1)
  return [...foods].sort((a, b) => rank(a) - rank(b) || Date.parse(b.created_at) - Date.parse(a.created_at))
}

/** 我的庫存的總數（M1、M5）：還能派送的批次的剩餘、派出中、已送達（全部批次），還沒被派出的批數 */
export function inventoryTotals(foods: readonly Food[]) {
  let remaining = 0
  let dispatched = 0
  let delivered = 0
  let unclaimed = 0
  for (const f of foods) {
    if (f.status === 'open') remaining += f.remaining
    dispatched += f.dispatched_qty
    delivered += f.delivered_qty
    if (f.status === 'open' && f.unclaimed) unclaimed += 1
  }
  return { remaining, dispatched, delivered, unclaimed }
}

/* ---------------------------------------------------------------- 設計 v2（T-136） */

/** 提供者頁要顯示哪一個畫面：沒有申請 → 申請表；pending → 審核中；rejected → 未通過；approved → 我的庫存／上架食物 */
export type SupplierStage = 'apply' | 'pending' | 'rejected' | 'approved'

export function supplierStageOf(supplier: Pick<Supplier, 'status'> | null): SupplierStage {
  return supplier ? supplier.status : 'apply'
}

/** 分頁（網址 ?tab=）；第一個是預設 */
export const SUPPLIER_TABS = ['inventory', 'publish'] as const
export const SUPPLIER_TAB_LABEL: Record<SupplierTab, string> = {
  inventory: '我的庫存',
  publish: '上架食物',
}

/**
 * 分頁與網址 `?tab=inventory|publish` 同步（只能在元件 setup 裡呼叫，要有 vue-router）。
 * 寫入用 router push、保留 ?as= 等其他 query，App 返回鍵能退回上一個分頁；網址沒有或不合法時是 inventory。
 */
export function useSupplierTab(): Ref<SupplierTab> {
  return useTabQuery('tab', SUPPLIER_TABS)
}

/** 上架的三個步驟（MR-C63 StepIndicator，數字圓圈版） */
export const PUBLISH_STEPS: readonly { label: string }[] = [{ label: '拍照' }, { label: '填寫資訊' }, { label: '上架' }]

/**
 * 上架目前在第幾步（從 0 起算）：還沒有照片也沒按「略過」→ 0 拍照；必填還沒填好 → 1 填寫資訊；都填好 → 2 上架。
 * photoDone ＝ 按過「略過」或拍過照（照片選填，M19）。
 */
export function publishStepOf(form: FoodForm, now: number, photoDone: boolean): 0 | 1 | 2 {
  if (!photoDone && !form.image_preview) return 0
  return buildFoodCreate(form, now).ok ? 2 : 1
}

/** 類別晶片（設計 v2 03 右）：常用三個直接列出，其他三個收在「其他」裡；值對應合約 §4 FoodCategory */
export const CATEGORY_MAIN: readonly { value: FoodCategory; label: string }[] = [
  { value: 'meal_box', label: '便當' },
  { value: 'bakery', label: '麵包' },
  { value: 'produce', label: '蔬果' },
]
export const CATEGORY_MORE: readonly { value: FoodCategory; label: string }[] = [
  { value: 'dry_goods', label: '乾貨' },
  { value: 'drink', label: '飲料' },
  { value: 'other', label: '其他' },
]

/** 這個類別是不是收在「其他」裡（選了的話「其他」要保持展開） */
export function isMoreCategory(c: FoodCategory | null): boolean {
  return CATEGORY_MORE.some((x) => x.value === c)
}

/** 從已選的過敏原移除一個（晶片上的 ×） */
export function withoutAllergen(list: readonly Allergen[], a: Allergen): Allergen[] {
  return list.filter((x) => x !== a)
}

/**
 * 我的庫存分成進行中與已結束（設計 v2 03 中，「已結束的食物（N）」收合）：
 * 已結束＝expired、closed，以及全部送完的（已全數派出、沒有派出中＝每一份都送達了）；其他（open、還有派出中的 claimed）是進行中。
 */
export function isFoodEnded(f: Pick<Food, 'status' | 'remaining' | 'dispatched_qty'>): boolean {
  if (f.status === 'expired' || f.status === 'closed') return true
  return f.status === 'claimed' && f.remaining === 0 && f.dispatched_qty === 0
}

/** 依 isFoodEnded 拆開，各自保持原本的順序（先 sortInventory） */
export function splitInventory(foods: readonly Food[]): { active: Food[]; ended: Food[] } {
  const active: Food[] = []
  const ended: Food[] = []
  for (const f of foods) (isFoodEnded(f) ? ended : active).push(f)
  return { active, ended }
}

/** 庫存列的狀態晶片（T-126 三色：primary 進行中、warn 需要處理、grey 結束）；可派送的不放晶片 */
export function inventoryChipOf(
  f: Pick<Food, 'status' | 'remaining' | 'dispatched_qty' | 'unclaimed'>,
): { text: string; tone: 'primary' | 'warn' | 'grey' } | null {
  if (f.status === 'closed') return { text: '已下架', tone: 'grey' }
  if (f.status === 'expired') return { text: '已過期', tone: 'grey' }
  if (f.status === 'claimed') return isFoodEnded(f) ? { text: '全部送達', tone: 'grey' } : { text: '已全數派出', tone: 'grey' }
  if (f.unclaimed) return { text: '還沒被派出', tone: 'warn' }
  return null
}

/** 還有食物等待派送嗎（InfoNote「還有食物等待派送」）：有 open 且剩餘 > 0 的批次 */
export function hasWaitingFood(foods: readonly Pick<Food, 'status' | 'remaining'>[]): boolean {
  return foods.some((f) => f.status === 'open' && f.remaining > 0)
}

/** 「最晚 12:30 食用」：和現在同一天（台北時間）只寫時間，其他天加上月／日 */
export function expiresText(expires_at: string, now: number): string {
  const local = toTaipeiLocal(expires_at)
  if (!local) return ''
  const [date, time] = local.split('T') as [string, string]
  if (date === toTaipeiLocal(now).slice(0, 10)) return `最晚 ${time} 食用`
  const [, mm, dd] = date.split('-')
  return `最晚 ${Number(mm)}/${Number(dd)} ${time} 食用`
}

/** 上架表單預設的食物點：最近一次上架用的食物點（還在清單上的話）；沒有就不選 */
export function defaultPointId(foods: readonly Pick<Food, 'point_id' | 'created_at'>[], points: readonly Pick<Point, 'id'>[]): string | null {
  const latest = [...foods].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  for (const f of latest) if (points.some((p) => p.id === f.point_id)) return f.point_id
  return null
}

/** 食物點地圖的定位針（MR-C07）：有可派送的食物 → open（黃），選取中的點標「已選」 */
export function pointMarkers(points: readonly Point[], selectedId: string | null): Marker[] {
  return points.map((p) => ({
    id: p.id,
    kind: 'point',
    location: p.location,
    status: p.open_food_count > 0 ? 'open' : undefined,
    label: p.id === selectedId ? `${p.name}（已選）` : p.name,
  }))
}

/** T-115 登記的開放資料（index.ts sources），食物點沒有 source 時的預設說明 */
const __POINT_SOURCES_DEFAULT = '臺北市銀髮族服務_社區照顧關懷據點、臺北市各級學校分布圖、臺北市固定里民活動場所資料、臺北市門牌位置數值資料'

/** SourceNote 的文字：畫面上食物點的開放資料來源（去掉自訂點與模擬資料） */
export function pointSourceText(points: readonly Pick<Point, 'source'>[]): string {
  const names = new Set<string>()
  for (const p of points)
    for (const s of p.source.split('、').map((x) => x.trim()))
      if (s && s !== 'custom' && !s.includes('模擬')) names.add(s)
  return `${names.size ? [...names].join('、') : __POINT_SOURCES_DEFAULT}（政府資料開放授權條款 1.0）`
}

/** 食物點清單的副標：種類・可派送 N 批 */
export function pointSubtitle(p: Pick<Point, 'kind' | 'open_food_count'>): string {
  return `${POINT_KIND_LABEL[p.kind]}・可派送 ${p.open_food_count} 批`
}

/* ---------------------------------------------------------------- 頁面狀態 */

export type SupplierView = 'loading' | 'error' | 'gate' | 'other_role'
export type SupplierTab = 'inventory' | 'publish'

/**
 * MR-P06 的狀態與動作。頁面在 onMounted 呼叫 start()、onBeforeUnmount 呼叫 stop()。
 * 寫入動作回傳是否成功；失敗時錯誤訊息放在對應的 ref，並用 toast 顯示（B12）。
 *
 * options.tab：目前的分頁。頁面傳 useSupplierTab()（與網址 ?tab= 同步）；沒傳時用頁面內部的 ref（測試用）。
 */
export function useSupplierPage(options: { tab?: Ref<SupplierTab> } = {}) {
  const me = ref<Me | null>(null)
  const supplier = ref<Supplier | null>(null)
  const points = ref<Point[]>([])
  const foods = ref<Food[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const now = ref(Date.now())
  const saving = ref(false)
  const tab: Ref<SupplierTab> = options.tab ?? ref<SupplierTab>('inventory')
  /** 「查看審核狀態」「重新整理」重新讀取中 */
  const checking = ref(false)
  /** 讀取回應的 stale_at（斷網時用上次的資料，ADR-024） */
  const stale = reactive<Record<string, string | null>>({})

  const applyForm = reactive<ApplyForm>(emptyApplyForm())
  const applyError = ref('')
  const pointForm = reactive<PointForm>(emptyPointForm())
  const pointError = ref('')
  const addingPoint = ref(false)
  const foodForm = reactive<FoodForm>(emptyFoodForm(now.value))
  const foodError = ref('')
  /** 剛上架的食物 id（清單底色提示一次，D5） */
  const freshFoodId = ref<string | null>(null)

  const editingId = ref<string | null>(null)
  const sheetMode = ref<'edit' | 'close'>('edit')
  const editForm = reactive<EditForm>({ qty: null, expires_local: '' })
  const editError = ref<{ field: 'qty' | 'expires_at' | null; message: string } | null>(null)
  /** 下架確認（MR-C67 ConfirmDialog）：要下架的食物 id 與視窗開關分開記，視窗先關、confirm 後才送出 */
  const closingId = ref<string | null>(null)
  const closeDialogOpen = ref(false)

  const staleAt = computed(() => Object.values(stale).find((v) => !!v) ?? null)
  const offline = computed(() => !!staleAt.value)
  const canPublish = computed(() => canPublishWith(me.value, supplier.value))
  const isSupplierRole = computed(() => me.value?.role === 'citizen' || me.value?.role === 'supplier')
  const view = computed<SupplierView>(() => {
    if (loading.value && !me.value) return 'loading'
    if (!me.value) return 'error'
    return isSupplierRole.value ? 'gate' : 'other_role'
  })
  const stage = computed<SupplierStage>(() => supplierStageOf(supplier.value))
  const inventory = computed(() => sortInventory(foods.value))
  const totals = computed(() => inventoryTotals(foods.value))
  /** 進行中與已結束（已結束收進 Accordion「已結束的食物（N）」） */
  const stock = computed(() => splitInventory(inventory.value))
  const hasWaiting = computed(() => hasWaitingFood(foods.value))
  /** 提供者頁頁首的店面照片（個人提供者、沒有照片 → null，ADR-029） */
  const supplierPhoto = computed(() => supplierPhotoOf(supplier.value))
  const selectedPoint = computed(() => points.value.find((p) => p.id === foodForm.point_id) ?? null)
  const markers = computed(() => pointMarkers(points.value, foodForm.point_id))
  const sourceText = computed(() => pointSourceText(points.value))
  const editingFood = computed(() => foods.value.find((f) => f.id === editingId.value) ?? null)
  const closingFood = computed(() => foods.value.find((f) => f.id === closingId.value) ?? null)
  /** 修改面板（MR-C39）的開關；關閉＝不改了 */
  const sheetOpen = computed({
    get: () => editingId.value !== null,
    set: (v: boolean) => {
      if (!v) editingId.value = null
    },
  })

  function __keepStale(key: string, value: { stale_at?: string } | null) {
    stale[key] = value?.stale_at ?? null
  }

  /** 讀取提供者的食物點與庫存（只有 approved 的提供者能呼叫） */
  async function __loadSupplierData() {
    if (!canPublish.value) {
      points.value = []
      foods.value = []
      stale.points = stale.foods = null
      return
    }
    const [p, f] = await Promise.all([listPoints(), listFoods({ mine: true })])
    points.value = [...p]
    foods.value = [...f]
    __keepStale('points', p)
    __keepStale('foods', f)
    // 上架表單還沒選食物點：預設上次上架用的食物點（設計 v2 03 右「食物點＋變更」）
    if (!foodForm.point_id || !points.value.some((x) => x.id === foodForm.point_id))
      foodForm.point_id = defaultPointId(foods.value, points.value)
  }

  /** 取得帳號與申請狀態；通過的提供者再取得食物點與庫存 */
  async function load(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      const m = await getMe()
      me.value = m
      __keepStale('me', m)
      if (m.role === 'citizen' || m.role === 'supplier') {
        const s = await getMySupplier()
        supplier.value = s ? { ...s } : null
        __keepStale('supplier', s)
      } else supplier.value = null
      await __loadSupplierData()
    } catch (e) {
      loadError.value = errorText(e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 輪詢：審核中時看是否已通過（D2）；提供者更新庫存（派出中、已送達會變）。
   * 畫面用的是裝置上的舊資料時整個重讀，連線恢復後帳號與申請狀態也會更新、送出鍵恢復（ADR-024）。
   */
  async function refresh(): Promise<void> {
    if (!me.value || loading.value || saving.value) return
    if (offline.value) return load()
    try {
      if (supplier.value?.status === 'pending') {
        const s = await getMySupplier()
        __keepStale('supplier', s)
        if (s?.status !== 'pending') return load() // 審核結果出來：角色會變，重新讀一次
        return
      }
      if (canPublish.value) await __loadSupplierData()
    } catch {
      /* 輪詢失敗不打擾；下一次再試 */
    }
  }

  /**
   * 「已申請？查看審核狀態」與審核中的「重新整理」：重新讀取帳號與申請狀態（getMe、getMySupplier，不新增 API）。
   * 讀完狀態沒變時用提示告訴使用者；回傳讀完後的畫面。
   */
  async function recheck(): Promise<SupplierStage> {
    const before = stage.value
    checking.value = true
    try {
      await load()
    } finally {
      checking.value = false
    }
    if (loadError.value) toast(loadError.value, 'error')
    else if (stage.value === 'apply') toast('查不到申請紀錄，請先填寫申請表')
    else if (stage.value === before) toast(`目前的狀態：${SUPPLIER_STATUS_LABEL[stage.value]}`)
    return stage.value
  }

  /** 寫入前的共同檢查：斷網時不送（ADR-024） */
  function __guardWrite(setError: (m: string) => void): boolean {
    if (!offline.value) return true
    setError('目前離線，暫時不能送出')
    return false
  }

  async function __write<T>(setError: (m: string) => void, run: () => Promise<T>): Promise<T | null> {
    saving.value = true
    setError('')
    try {
      return await run()
    } catch (e) {
      const message = errorText(e)
      setError(message)
      toast(message, 'error')
      if (e instanceof MealApiError && e.code === 'SUPPLIER_NOT_APPROVED') void load() // V4：狀態可能變了
      return null
    } finally {
      saving.value = false
    }
  }

  /** 送出提供者申請（citizen）。有店面照片（且不是個人）先 uploadImage，再 applySupplier（ADR-029） */
  async function apply(): Promise<boolean> {
    const setError = (m: string) => (applyError.value = m)
    if (!__guardWrite(setError)) return false
    const check = buildSupplierApply(applyForm)
    if (!check.ok) return (setError(Object.values(check.errors)[0]!), false)
    const s = await __write(setError, async () => {
      const photo = applyForm.image && showsStorefrontPhoto(applyForm.org_type) ? applyForm.image : null
      const img = photo ? await uploadImage(`data:${photo.mime};base64,${photo.data}`) : null
      const built = buildSupplierApply(applyForm, img?.id ?? null)
      if (!built.ok) throw new MealApiError('VALIDATION_ERROR', Object.values(built.errors)[0]!, 422)
      return applySupplier(built.body)
    })
    if (!s) return false
    supplier.value = s
    Object.assign(applyForm, emptyApplyForm())
    toast('已送出申請，管理員審核後就能上架食物')
    return true
  }

  /** 選上架用的食物點 */
  function selectPoint(id: string) {
    foodForm.point_id = id
    addingPoint.value = false
  }

  /** 新增食物點（只有 approved 的提供者），成功後直接選它。有入口照片先 uploadImage，再 createPoint（ADR-028） */
  async function addPoint(): Promise<boolean> {
    const setError = (m: string) => (pointError.value = m)
    if (!canPublish.value) return (setError(NOT_APPROVED_TEXT), false)
    if (!__guardWrite(setError)) return false
    const check = buildPointCreate(pointForm)
    if (!check.ok) return (setError(Object.values(check.errors)[0]!), false)
    const p = await __write(setError, async () => {
      const img = pointForm.image ? await uploadImage(`data:${pointForm.image.mime};base64,${pointForm.image.data}`) : null
      const built = buildPointCreate(pointForm, img?.id ?? null)
      if (!built.ok) throw new MealApiError('VALIDATION_ERROR', Object.values(built.errors)[0]!, 422)
      return createPoint(built.body)
    })
    if (!p) return false
    points.value = [...points.value, p]
    Object.assign(pointForm, emptyPointForm())
    selectPoint(p.id)
    toast(`已新增食物點「${p.name}」`)
    return true
  }

  /** 上架的圖片（MR-C06 壓縮後的 base64，不含 data: 前綴） */
  function setImage(payload: { data: string; mime: string } | null) {
    setFormImage(foodForm, payload)
  }

  /** 上架（V4：審核中不送出）：有圖片先 uploadImage，再 createFood */
  async function publish(): Promise<boolean> {
    const setError = (m: string) => (foodError.value = m)
    if (!canPublish.value) return (setError(NOT_APPROVED_TEXT), false)
    if (!__guardWrite(setError)) return false
    now.value = Date.now()
    const check = buildFoodCreate(foodForm, now.value)
    if (!check.ok) return (setError(Object.values(check.errors)[0]!), false)
    const food = await __write(setError, async () => {
      const img = foodForm.image ? await uploadImage(`data:${foodForm.image.mime};base64,${foodForm.image.data}`) : null
      const built = buildFoodCreate(foodForm, now.value, img?.id ?? null)
      if (!built.ok) throw new MealApiError('VALIDATION_ERROR', Object.values(built.errors)[0]!, 422)
      return createFood(built.body)
    })
    if (!food) return false
    foods.value = [food, ...foods.value.filter((f) => f.id !== food.id)]
    __markFresh(food.id)
    points.value = points.value.map((p) => (p.id === food.point_id && food.status === 'open' ? { ...p, open_food_count: p.open_food_count + 1 } : p))
    Object.assign(foodForm, emptyFoodForm(now.value, foodForm.point_id))
    tab.value = 'inventory' // 上架成功 → 回到我的庫存（router push，返回鍵可回上架分頁）
    toast(`已上架「${food.name}」${food.qty} 份`)
    return true
  }

  let __freshTimer: ReturnType<typeof setTimeout> | undefined
  /** 剛上架的那一列高亮幾秒（D5） */
  function __markFresh(id: string) {
    clearTimeout(__freshTimer)
    freshFoodId.value = id
    __freshTimer = setTimeout(() => (freshFoodId.value = null), 6000)
  }

  /** 打開修改面板（mode = edit，MR-C39）或下架確認視窗（mode = close，MR-C67） */
  function openSheet(id: string, mode: 'edit' | 'close') {
    const food = foods.value.find((f) => f.id === id)
    if (!food) return
    sheetMode.value = mode
    editError.value = null
    if (mode === 'close') {
      closingId.value = id
      closeDialogOpen.value = true
      return
    }
    editingId.value = id
    Object.assign(editForm, editFormOf(food))
  }

  /** 下架確認視窗按了取消 */
  function cancelClose() {
    closeDialogOpen.value = false
    closingId.value = null
  }

  /** 送出修改：份數、最晚食用時間（M14）；後端回 QTY_BELOW_USED 時重新讀取庫存並標在份數（V21） */
  async function saveEdit(): Promise<boolean> {
    const food = editingFood.value
    if (!food) return false
    const fail = (field: 'qty' | 'expires_at' | null, message: string) => ((editError.value = { field, message }), false)
    if (offline.value) return fail(null, '目前離線，暫時不能送出')
    now.value = Date.now()
    const built = buildFoodUpdate(food, editForm, now.value)
    if (!built.ok) {
      const [field, message] = Object.entries(built.errors)[0]!
      return fail(field === 'qty' || field === 'expires_at' ? field : null, message)
    }
    saving.value = true
    editError.value = null
    try {
      const updated = await updateFood(food.id, built.body)
      foods.value = foods.value.map((f) => (f.id === updated.id ? updated : f))
      editingId.value = null
      toast(`已修改「${updated.name}」`)
      return true
    } catch (e) {
      const err = editErrorOf(e)
      editError.value = err
      toast(err.message, 'error')
      // V21：已派出＋已送達可能在這段時間變了，重新讀取讓下限跟著更新
      if (e instanceof MealApiError && e.code === 'QTY_BELOW_USED') await __loadSupplierData().catch(() => undefined)
      return false
    } finally {
      saving.value = false
    }
  }

  /** 下架（確認視窗按了「下架」之後）：PATCH closed = true；斷網時不送（ADR-024） */
  async function confirmClose(): Promise<boolean> {
    const food = closingFood.value
    closeDialogOpen.value = false
    if (!food) return false
    if (offline.value) {
      editError.value = { field: null, message: '目前離線，暫時不能送出' }
      toast(editError.value.message, 'error')
      return false
    }
    saving.value = true
    editError.value = null
    try {
      const updated = await updateFood(food.id, { closed: true })
      foods.value = foods.value.map((f) => (f.id === updated.id ? updated : f))
      closingId.value = null
      toast(`已下架「${updated.name}」`)
      return true
    } catch (e) {
      editError.value = { field: null, message: errorText(e) }
      toast(errorText(e), 'error')
      if (e instanceof MealApiError && e.code === 'SUPPLIER_NOT_APPROVED') void load()
      return false
    } finally {
      saving.value = false
    }
  }

  let __tick: ReturnType<typeof setInterval> | undefined
  let __poll: ReturnType<typeof setInterval> | undefined
  /** 開始：讀取、每秒更新 now（倒數）、每 15 秒輪詢 */
  function start() {
    stop()
    void load()
    __tick = setInterval(() => (now.value = Date.now()), 1000)
    __poll = setInterval(() => void refresh(), 15_000)
  }
  function stop() {
    clearInterval(__tick)
    clearInterval(__poll)
    clearTimeout(__freshTimer)
  }

  return {
    me,
    supplier,
    points,
    foods,
    loading,
    loadError,
    now,
    saving,
    tab,
    staleAt,
    offline,
    canPublish,
    supplierPhoto,
    view,
    stage,
    checking,
    inventory,
    stock,
    hasWaiting,
    totals,
    selectedPoint,
    markers,
    sourceText,
    applyForm,
    applyError,
    pointForm,
    pointError,
    addingPoint,
    foodForm,
    foodError,
    freshFoodId,
    editingFood,
    closingFood,
    closeDialogOpen,
    sheetMode,
    sheetOpen,
    editForm,
    editError,
    load,
    refresh,
    recheck,
    apply,
    selectPoint,
    addPoint,
    setImage,
    publish,
    openSheet,
    saveEdit,
    confirmClose,
    cancelClose,
    start,
    stop,
    imageSrc,
  }
}
