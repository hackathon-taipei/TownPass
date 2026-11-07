/**
 * LOGIC LAYER - 管理系統 MR-P08（T-120）。合約 docs/system/11-meal-relay.md v2.2 §2、§3 meal_elder、§6 M10、§8。
 *
 * - 身分：網址 `/#/f/meal-relay/admin?as=<admin id>`（data/client.ts 會把 ?as= 存在裝置上）；`getMe` 不是 admin → 沒有權限
 * - 審核：`listSuppliers('pending')`＋`reviewSupplier()`
 * - 看板：`getBoard()` → 統計與地圖（據點、食物點、長者）
 * - 長者名冊：`listElders()`、`createElder()`、`updateElder()`；只有代號、座標、過敏原，全部是模擬資料（ADR-024、ADR-026）
 * - 重置：`resetDemo()`
 * - 斷網（ADR-024）：讀取用裝置上的資料並顯示 StaleBanner，寫入一律停用
 */
import { computed, reactive, ref } from 'vue'
import {
  MealApiError,
  createElder,
  currentAccountId,
  getBoard,
  getMe,
  listElders,
  listStations,
  listSuppliers,
  resetDemo,
  reviewSupplier,
  updateElder,
} from '../data'
import type {
  Allergen,
  Board,
  BoardStats,
  Cached,
  Elder,
  ElderCreate,
  ElderUpdate,
  Food,
  IsoDateTime,
  Location,
  Me,
  OrgType,
  Point,
  Station,
  Supplier,
} from '../data'
import type { Marker, MarkerStatus } from './mapMarker'
import { ALLERGEN_LABEL } from './mealLabels'
import { MOTION } from './motion'
import { toast } from './toast'

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），本頁用到的型別從這裡轉出去 */
export type { Allergen, Board, BoardStats, Elder, Food, Location, Me, OrgType, Station, Supplier }

/* ---------------------------------------------------------------- 常數與中文 */

export type AdminAccess = 'loading' | 'admin' | 'denied' | 'error'
export type AdminTab = 'review' | 'board' | 'elders'
export type ReviewDecision = 'approved' | 'rejected'

export const ADMIN_TABS: { value: AdminTab; label: string }[] = [
  { value: 'review', label: '審核' },
  { value: 'board', label: '看板' },
  { value: 'elders', label: '長者名冊' },
]

/** 合約 §4 OrgType */
export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  person: '個人',
  school: '學校',
  agency: '機關',
  shop: '店家',
  other: '其他',
}

/** 看板統計卡（MR-C13）的順序與名稱（工單合約） */
export const STAT_FIELDS: { key: keyof BoardStats; label: string; tone?: 'alert' }[] = [
  { key: 'foods_open', label: '可派送食物' },
  { key: 'delivered_today', label: '今天送達' },
  { key: 'seen_today', label: '今天見到' },
  { key: 'alerts', label: '警示長者', tone: 'alert' },
  { key: 'checkins_today', label: '今天報到' },
]

/** ADR-024 隱私提示，放在長者表單旁 */
export const PRIVACY_NOTE = '只填代號（例如「萬華-A01」），不要填真實姓名、電話、地址。Demo 只用模擬資料，位置請選路上或公共空間，不要選住家。'

/** 沒有權限時的說明（§2：admin 只用管理系統網址登入，畫面上沒有選身分的按鈕） */
export const DENIED_TEXT = '管理系統只給管理員使用。請用管理員帳號開啟：/#/f/meal-relay/admin?as=<管理員帳號 id>'

/** 審核後晶片停留＋整列收合（MR-C19 D3）的時間，之後才從清單移除，動畫不會被打斷 */
export const REVIEW_SETTLE_MS = MOTION.emphasis + MOTION.slow

/** 看板多久重新取得一次（志工報到、送達會即時反映到統計與地圖） */
export const BOARD_POLL_MS = 15_000

/** 代號長度上限（後端 ElderCreate.alias max_length） */
export const ALIAS_MAX = 20

/* ---------------------------------------------------------------- 錯誤（§7） */

/** 後端回傳的中文訊息（MealApiError.message）；其他錯誤用 fallback */
export function errorMessage(e: unknown, fallback = '發生錯誤，請再試一次'): string {
  if (e instanceof MealApiError) return e.message || fallback
  return fallback
}

function __isForbidden(e: unknown): boolean {
  return e instanceof MealApiError && e.code === 'FORBIDDEN_ROLE'
}

/* ---------------------------------------------------------------- 身分 */

/** 只有 admin 能用管理系統；其他角色（含沒匯入的一般市民）一律沒有權限 */
export function accessOf(me: Pick<Me, 'role'> | null | undefined): 'admin' | 'denied' {
  return me?.role === 'admin' ? 'admin' : 'denied'
}

/* ---------------------------------------------------------------- 時間（+08:00） */

const __TAIPEI_OFFSET_MS = 8 * 3_600_000
const __LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** ISO → `<input type="datetime-local">` 的值（台北時間）；空值或格式錯誤回 '' */
export function toLocalInput(iso: IsoDateTime | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t + __TAIPEI_OFFSET_MS).toISOString().slice(0, 16)
}

/** `<input type="datetime-local">` 的值（台北時間）→ 含 +08:00 的 ISO；空白回 null */
export function fromLocalInput(value: string): IsoDateTime | null {
  const v = value.trim()
  if (!v || !__LOCAL_INPUT.test(v)) return null
  return `${v}:00+08:00`
}

/** 「11/08 14:30」；空值回「未設定」 */
export function shortTimeText(iso: IsoDateTime | null | undefined): string {
  const v = toLocalInput(iso)
  return v ? `${v.slice(5, 7)}/${v.slice(8, 10)} ${v.slice(11, 16)}` : '未設定'
}

/* ---------------------------------------------------------------- 長者表單 */

/** 表單的值：時間是 datetime-local 字串，送出時才轉成 ISO */
export interface ElderDraft {
  alias: string
  location: Location | null
  allergens: Allergen[]
  station_id: string
  next_care_at: string
  next_meal_at: string
}

export type ElderDraftErrors = Partial<Record<keyof ElderDraft, string>>

export function emptyElderDraft(): ElderDraft {
  return { alias: '', location: null, allergens: [], station_id: '', next_care_at: '', next_meal_at: '' }
}

/** 修改時把長者的資料放進表單 */
export function draftOfElder(e: Elder): ElderDraft {
  return {
    alias: e.alias,
    location: { ...e.location },
    allergens: [...e.allergens],
    station_id: e.station_id,
    next_care_at: toLocalInput(e.next_care_at),
    next_meal_at: toLocalInput(e.next_meal_at),
  }
}

/** 必填：代號、位置、據點（ADR-026：管理員登記，據點必填）。代號看起來像電話就擋下（ADR-024） */
export function validateElderDraft(d: ElderDraft): ElderDraftErrors {
  const errors: ElderDraftErrors = {}
  const alias = d.alias.trim()
  if (!alias) errors.alias = '請填代號'
  else if (alias.length > ALIAS_MAX) errors.alias = `代號最多 ${ALIAS_MAX} 個字`
  else if (/\d{6,}/.test(alias.replace(/[\s-]/g, ''))) errors.alias = '代號看起來像電話號碼，請改用代號，不要填真實資料'
  if (!d.location) errors.location = '請在地圖上選位置'
  if (!d.station_id) errors.station_id = '請選據點'
  for (const key of ['next_care_at', 'next_meal_at'] as const) {
    if (d[key].trim() && !fromLocalInput(d[key])) errors[key] = '時間格式不正確'
  }
  return errors
}

/** POST /elders 的內容（後端 extra="forbid"：只送合約欄位） */
export function toElderCreate(d: ElderDraft): ElderCreate {
  if (!d.location) throw new Error('location is required')
  return {
    alias: d.alias.trim(),
    location: { lat: d.location.lat, lng: d.location.lng },
    allergens: [...d.allergens],
    station_id: d.station_id,
    next_care_at: fromLocalInput(d.next_care_at),
    next_meal_at: fromLocalInput(d.next_meal_at),
  }
}

/** PATCH /elders/{id} 的內容：只送改過的欄位；清空的下次時間送 null（後端清掉） */
export function toElderUpdate(d: ElderDraft, original: Elder): ElderUpdate {
  const body: ElderUpdate = {}
  const alias = d.alias.trim()
  if (alias !== original.alias) body.alias = alias
  if (d.location && (d.location.lat !== original.location.lat || d.location.lng !== original.location.lng)) {
    body.location = { lat: d.location.lat, lng: d.location.lng }
  }
  if ([...d.allergens].sort().join() !== [...original.allergens].sort().join()) body.allergens = [...d.allergens]
  if (d.station_id && d.station_id !== original.station_id) body.station_id = d.station_id
  for (const key of ['next_care_at', 'next_meal_at'] as const) {
    if (d[key].trim() !== toLocalInput(original[key])) body[key] = fromLocalInput(d[key])
  }
  return body
}

/* ---------------------------------------------------------------- 名冊的一列 */

export interface ElderSummary {
  stationName: string
  allergensText: string
  seenText: string
  nextText: string
}

/** 「從未見到」「今天見過」「3 天前見過」 */
export function seenText(days: number | null): string {
  if (days === null) return '從未見到'
  return days <= 0 ? '今天見過' : `${days} 天前見過`
}

export function elderSummary(e: Elder, stations: readonly Station[]): ElderSummary {
  return {
    stationName: stations.find((s) => s.id === e.station_id)?.name ?? e.station_id,
    allergensText: e.allergens.length ? e.allergens.map((a) => ALLERGEN_LABEL[a]).join('、') : '沒有過敏原',
    seenText: seenText(e.days_since_seen),
    nextText: `下次關懷 ${shortTimeText(e.next_care_at)}・下次送餐 ${shortTimeText(e.next_meal_at)}`,
  }
}

/** 名冊排序：警示的在前，再依代號 */
export function sortElders(elders: readonly Elder[]): Elder[] {
  return [...elders].sort((a, b) => Number(b.alert) - Number(a.alert) || a.alias.localeCompare(b.alias, 'zh-Hant'))
}

/* ---------------------------------------------------------------- 看板地圖 */

/** 食物點定位針的狀態（ui-kit.md 地圖顏色）：還沒被派出 > 可派送 > 已全數派出 > 已過期／已下架；沒有食物 → 沒有狀態 */
export function pointStatusOf(point: Pick<Point, 'id'>, foods: readonly Food[]): MarkerStatus | undefined {
  const here = foods.filter((f) => f.point_id === point.id)
  if (!here.length) return undefined
  if (here.some((f) => f.status === 'open' && f.unclaimed)) return 'unclaimed'
  if (here.some((f) => f.status === 'open')) return 'open'
  if (here.some((f) => f.status === 'claimed')) return 'claimed'
  return here.some((f) => f.status === 'expired') ? 'expired' : 'closed'
}

/** 看板地圖：據點、食物點、長者（長者定位針只出現在管理系統，M13） */
export function boardMarkers(board: Pick<Board, 'stations' | 'points' | 'foods' | 'elders'>): Marker[] {
  return [
    ...board.stations.map((s): Marker => ({ id: `station:${s.id}`, kind: 'station', location: s.location, label: s.name })),
    ...board.points.map((p): Marker => ({
      id: `point:${p.id}`,
      kind: 'point',
      location: p.location,
      status: pointStatusOf(p, board.foods),
      label: p.name,
    })),
    ...elderMarkers(board.elders),
  ]
}

export function elderMarkers(elders: readonly Elder[]): Marker[] {
  return elders.map((e) => ({ id: `elder:${e.id}`, kind: 'elder', location: e.location, status: e.alert ? 'alert' : 'ok', label: e.alias }))
}

/** 名冊表單的參考定位針：據點＋其他長者（修改中的那位不放，避免和選點重疊） */
export function rosterMarkers(stations: readonly Station[], elders: readonly Elder[], exceptId?: string): Marker[] {
  return [
    ...stations.map((s): Marker => ({ id: `station:${s.id}`, kind: 'station', location: s.location, label: s.name })),
    ...elderMarkers(elders.filter((e) => e.id !== exceptId)),
  ]
}

/** 看板食物：可派送的在前，再依最晚食用時間 */
export function sortFoods(foods: readonly Food[]): Food[] {
  const rank = { open: 0, claimed: 1, expired: 2, closed: 3 } as const
  return [...foods].sort((a, b) => rank[a.status] - rank[b.status] || a.expires_at.localeCompare(b.expires_at))
}

/** 開放資料來源（SourceNote）：據點、食物點的 source，用「、」分開的拆開後去重 */
export function sourcesOf(items: readonly { source: string }[]): string {
  const names = items.flatMap((i) => i.source.split('、')).map((s) => s.trim()).filter(Boolean)
  return [...new Set(names)].join('、')
}

/* ---------------------------------------------------------------- 頁面狀態 */

/**
 * 管理系統的狀態與動作。頁面在 onMounted 呼叫 start()、onBeforeUnmount 呼叫 stop()。
 * 寫入在 offline（顯示的是裝置上的資料）時一律不送出（ADR-024）。
 */
export function useAdmin() {
  const access = ref<AdminAccess>('loading')
  const accountId = ref('')
  const me = ref<Me | null>(null)
  const accessError = ref('')
  const tab = ref<AdminTab>('review')
  const now = ref(Date.now())
  /** 重置次數：PageTransition（variant="refresh"）的 page-key */
  const version = ref(0)

  const pending = ref<Supplier[]>([])
  const reviewed = ref<Supplier[]>([])
  const board = ref<Board | null>(null)
  const elders = ref<Elder[]>([])
  const stations = ref<Station[]>([])
  const errors = reactive<Record<AdminTab, string>>({ review: '', board: '', elders: '' })
  /** 各讀取的 stale_at（ADR-024）；有任何一個就是離線 */
  const stale = reactive<Record<string, string | undefined>>({})

  const draft = ref<ElderDraft>(emptyElderDraft())
  const editing = ref<Elder | null>(null)
  const formErrors = ref<ElderDraftErrors>({})
  const saving = ref(false)

  const staleAt = computed(() => Object.values(stale).filter(Boolean).sort()[0] ?? null)
  const offline = computed(() => staleAt.value !== null)
  const markers = computed(() => (board.value ? boardMarkers(board.value) : []))
  const formMarkers = computed(() => rosterMarkers(stations.value, elders.value, editing.value?.id))
  const roster = computed(() => sortElders(elders.value))
  const foods = computed(() => sortFoods(board.value?.foods ?? []))
  const sourceText = computed(() => sourcesOf([...stations.value, ...(board.value?.points ?? [])]))

  function __track<T>(key: string, data: Cached<T>): Cached<T> {
    stale[key] = data.stale_at
    return data
  }

  function __fail(section: AdminTab, e: unknown, fallback: string) {
    if (__isForbidden(e)) access.value = 'denied' // 角色在這段期間被換掉
    errors[section] = errorMessage(e, fallback)
  }

  /** 身分檢查；是 admin 才載入資料 */
  async function init(): Promise<void> {
    access.value = 'loading'
    accessError.value = ''
    try {
      accountId.value = await currentAccountId()
      me.value = __track('me', await getMe())
      access.value = accessOf(me.value)
    } catch (e) {
      access.value = 'error'
      accessError.value = errorMessage(e, '無法確認身分，請稍後再試')
      return
    }
    if (access.value === 'admin') await loadAll()
  }

  async function loadAll(): Promise<void> {
    await Promise.all([loadSuppliers(), loadBoard(), loadElders(), loadStations()])
  }

  async function loadSuppliers(): Promise<void> {
    try {
      pending.value = [...__track('suppliers', await listSuppliers('pending'))]
      errors.review = ''
    } catch (e) {
      __fail('review', e, '讀取審核清單失敗')
    }
  }

  async function loadBoard(): Promise<void> {
    try {
      board.value = __track('board', await getBoard())
      errors.board = ''
    } catch (e) {
      __fail('board', e, '讀取看板失敗')
    }
  }

  async function loadElders(): Promise<void> {
    try {
      elders.value = [...__track('elders', await listElders())]
      errors.elders = ''
    } catch (e) {
      __fail('elders', e, '讀取長者名冊失敗')
    }
  }

  async function loadStations(): Promise<void> {
    try {
      stations.value = [...__track('stations', await listStations())]
    } catch (e) {
      __fail('elders', e, '讀取據點失敗')
    }
  }

  /** 給 MR-C19 ReviewList 的 on-decide：失敗時提示並丟出錯誤，讓按鈕恢復 */
  async function review(id: string, result: ReviewDecision): Promise<Supplier> {
    try {
      if (offline.value) throw new MealApiError('OFFLINE', '目前離線，暫時不能審核', 0)
      const updated = await reviewSupplier(id, result === 'approved' ? 'approve' : 'reject')
      reviewed.value = [updated, ...reviewed.value.filter((s) => s.id !== id)]
      toast(result === 'approved' ? `已通過「${updated.name}」` : `「${updated.name}」未通過`)
      setTimeout(() => (pending.value = pending.value.filter((s) => s.id !== id)), REVIEW_SETTLE_MS)
      return updated
    } catch (e) {
      toast(errorMessage(e, '審核失敗，請再試一次'), 'error')
      throw e
    }
  }

  function startEdit(elder: Elder): void {
    editing.value = elder
    draft.value = draftOfElder(elder)
    formErrors.value = {}
  }

  function resetForm(): void {
    editing.value = null
    draft.value = emptyElderDraft()
    formErrors.value = {}
  }

  /** 新增或修改長者；成功回 true */
  async function saveElder(): Promise<boolean> {
    if (offline.value || saving.value) return false
    formErrors.value = validateElderDraft(draft.value)
    if (Object.keys(formErrors.value).length) return false
    const original = editing.value
    const patch = original ? toElderUpdate(draft.value, original) : null
    if (patch && !Object.keys(patch).length) {
      toast('沒有修改任何欄位')
      resetForm()
      return true
    }
    saving.value = true
    try {
      const saved = original && patch ? await updateElder(original.id, patch) : await createElder(toElderCreate(draft.value))
      elders.value = original ? elders.value.map((e) => (e.id === saved.id ? saved : e)) : [...elders.value, saved]
      toast(original ? `已更新「${saved.alias}」` : `已新增「${saved.alias}」`)
      resetForm()
      void loadBoard() // 看板的長者與警示一起更新
      return true
    } catch (e) {
      toast(errorMessage(e, '儲存失敗，請再試一次'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  /** 給 MR-C22 ResetDemoButton 的 on-reset：錯誤由按鈕提示 */
  async function reset(): Promise<void> {
    if (offline.value) throw new MealApiError('OFFLINE', '目前離線，暫時不能重置', 0)
    await resetDemo()
    resetForm()
    reviewed.value = []
    await loadAll()
    version.value++
  }

  let __clock: ReturnType<typeof setInterval> | undefined
  let __poll: ReturnType<typeof setInterval> | undefined

  async function start(): Promise<void> {
    stop()
    __clock = setInterval(() => (now.value = Date.now()), 1000)
    __poll = setInterval(() => {
      if (access.value === 'admin' && tab.value === 'board') void loadBoard()
    }, BOARD_POLL_MS)
    await init()
  }

  function stop(): void {
    clearInterval(__clock)
    clearInterval(__poll)
  }

  return {
    access,
    accountId,
    me,
    accessError,
    tab,
    now,
    version,
    pending,
    reviewed,
    board,
    elders,
    roster,
    stations,
    foods,
    markers,
    formMarkers,
    sourceText,
    errors,
    staleAt,
    offline,
    draft,
    editing,
    formErrors,
    saving,
    init,
    loadAll,
    loadSuppliers,
    loadBoard,
    loadElders,
    review,
    startEdit,
    resetForm,
    saveElder,
    reset,
    start,
    stop,
  }
}
