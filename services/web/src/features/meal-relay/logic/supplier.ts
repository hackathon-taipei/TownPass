/**
 * 提供者頁 MR-P06 的邏輯（T-117）。合約 docs/system/11-meal-relay.md v2.2：
 * §2 提供者、§3 meal_food、M1、M5、M14、M19、§7 錯誤、§8 帳號與食物端點、V4、V21。
 *
 * 一般市民：申請（applySupplier）→ 審核中／未通過（getMySupplier）。審核中不能上架（V4）。
 * 提供者：食物點地圖（listPoints）、選點或新增食物點（createPoint）、上架（uploadImage → createFood）、
 *         我的庫存（listFoods mine）、改份數與最晚食用時間（updateFood，V21）、下架（updateFood closed）。
 * 讀取失敗用裝置上的資料（stale_at）、寫入停用（ADR-024）。錯誤顯示後端回傳的中文訊息（§7）。
 */
import { computed, reactive, ref } from 'vue'
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
import { qtyHint, QTY_MAX_DEFAULT } from './foodQty'
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

export const POINT_KIND_LABEL: Record<PointKind, string> = {
  station: '關懷據點',
  village_office: '里辦公處',
  school: '學校',
  custom: '自訂',
}

/** 名稱欄位的長度上限（後端 schemas：max_length=60） */
export const NAME_MAX = 60

/** 審核中（或未通過）的提供者不能上架（V4）；畫面與送出前的檢查都用這句 */
export const NOT_APPROVED_TEXT = '提供者審核中，管理員通過後才能上架食物'

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

export type ApplyForm = { name: string; org_type: OrgType | null; location: Location | null }
export type PointForm = { name: string; location: Location | null }
export type FoodImage = { data: string; mime: string }
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
  return { name: '', org_type: null, location: null }
}
export function emptyPointForm(): PointForm {
  return { name: '', location: null }
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

function __built<T>(errors: Record<string, string>, body: () => T): Built<T> {
  const bad = Object.fromEntries(Object.entries(errors).filter(([, v]) => v))
  return Object.keys(bad).length ? { ok: false, errors: bad } : { ok: true, body: body() }
}

/** 申請表 → POST /suppliers 的內容（後端不收多的欄位） */
export function buildSupplierApply(form: ApplyForm): Built<SupplierApply> {
  return __built(
    {
      name: __nameError(form.name, '請輸入單位名稱'),
      org_type: form.org_type ? '' : '請選擇類型',
      location: form.location ? '' : '請在地圖上選位置',
    },
    () => ({ name: form.name.trim(), org_type: form.org_type!, location: { ...form.location! } }),
  )
}

/** 新增食物點 → POST /points（kind 一律 custom） */
export function buildPointCreate(form: PointForm): Built<PointCreate> {
  return __built(
    { name: __nameError(form.name, '請輸入食物點名稱'), location: form.location ? '' : '請在地圖上選位置' },
    () => ({ name: form.name.trim(), kind: 'custom', location: { ...form.location! } }),
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
 */
export function useSupplierPage() {
  const me = ref<Me | null>(null)
  const supplier = ref<Supplier | null>(null)
  const points = ref<Point[]>([])
  const foods = ref<Food[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const now = ref(Date.now())
  const saving = ref(false)
  const tab = ref<SupplierTab>('inventory')
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

  const staleAt = computed(() => Object.values(stale).find((v) => !!v) ?? null)
  const offline = computed(() => !!staleAt.value)
  const canPublish = computed(() => canPublishWith(me.value, supplier.value))
  const isSupplierRole = computed(() => me.value?.role === 'citizen' || me.value?.role === 'supplier')
  const view = computed<SupplierView>(() => {
    if (loading.value && !me.value) return 'loading'
    if (!me.value) return 'error'
    return isSupplierRole.value ? 'gate' : 'other_role'
  })
  const inventory = computed(() => sortInventory(foods.value))
  const totals = computed(() => inventoryTotals(foods.value))
  const selectedPoint = computed(() => points.value.find((p) => p.id === foodForm.point_id) ?? null)
  const markers = computed(() => pointMarkers(points.value, foodForm.point_id))
  const sourceText = computed(() => pointSourceText(points.value))
  const editingFood = computed(() => foods.value.find((f) => f.id === editingId.value) ?? null)
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

  /** 輪詢：審核中時看是否已通過（D2）；提供者更新庫存（派出中、已送達會變） */
  async function refresh(): Promise<void> {
    if (!me.value || loading.value || saving.value) return
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

  /** 送出提供者申請（citizen） */
  async function apply(): Promise<boolean> {
    const setError = (m: string) => (applyError.value = m)
    if (!__guardWrite(setError)) return false
    const built = buildSupplierApply(applyForm)
    if (!built.ok) return (setError(Object.values(built.errors)[0]!), false)
    const s = await __write(setError, () => applySupplier(built.body))
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

  /** 新增食物點（只有 approved 的提供者），成功後直接選它 */
  async function addPoint(): Promise<boolean> {
    const setError = (m: string) => (pointError.value = m)
    if (!canPublish.value) return (setError(NOT_APPROVED_TEXT), false)
    if (!__guardWrite(setError)) return false
    const built = buildPointCreate(pointForm)
    if (!built.ok) return (setError(Object.values(built.errors)[0]!), false)
    const p = await __write(setError, () => createPoint(built.body))
    if (!p) return false
    points.value = [...points.value, p]
    Object.assign(pointForm, emptyPointForm())
    selectPoint(p.id)
    toast(`已新增食物點「${p.name}」`)
    return true
  }

  /** 上架的圖片（MR-C06 壓縮後的 base64，不含 data: 前綴） */
  function setImage(payload: { data: string; mime: string } | null) {
    foodForm.image = payload ? { data: payload.data, mime: payload.mime } : null
    foodForm.image_preview = payload ? `data:${payload.mime};base64,${payload.data}` : null
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
    freshFoodId.value = food.id
    points.value = points.value.map((p) => (p.id === food.point_id && food.status === 'open' ? { ...p, open_food_count: p.open_food_count + 1 } : p))
    Object.assign(foodForm, emptyFoodForm(now.value, foodForm.point_id))
    tab.value = 'inventory'
    toast(`已上架「${food.name}」${food.qty} 份`)
    return true
  }

  /** 打開修改（mode = edit）或下架確認（mode = close） */
  function openSheet(id: string, mode: 'edit' | 'close') {
    const food = foods.value.find((f) => f.id === id)
    if (!food) return
    editingId.value = id
    sheetMode.value = mode
    editError.value = null
    Object.assign(editForm, editFormOf(food))
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

  /** 下架（確認後）：PATCH closed = true */
  async function confirmClose(): Promise<boolean> {
    const food = editingFood.value
    if (!food) return false
    if (offline.value) return ((editError.value = { field: null, message: '目前離線，暫時不能送出' }), false)
    saving.value = true
    editError.value = null
    try {
      const updated = await updateFood(food.id, { closed: true })
      foods.value = foods.value.map((f) => (f.id === updated.id ? updated : f))
      editingId.value = null
      toast(`已下架「${updated.name}」`)
      return true
    } catch (e) {
      editError.value = { field: null, message: errorText(e) }
      toast(errorText(e), 'error')
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
    view,
    inventory,
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
    sheetMode,
    sheetOpen,
    editForm,
    editError,
    load,
    refresh,
    apply,
    selectPoint,
    addPoint,
    setImage,
    publish,
    openSheet,
    saveEdit,
    confirmClose,
    start,
    stop,
    imageSrc,
  }
}
