/**
 * LOGIC LAYER - 管理系統 MR-P08（T-120）。合約 docs/system/11-meal-relay.md v2.2 §2、§3 meal_elder、§6 M10、§8。
 *
 * - 身分：網址 `/#/f/meal-relay/admin?as=<admin id>`（data/client.ts 會把 ?as= 存在裝置上）；`getMe` 不是 admin → 沒有權限
 * - 審核：`listSuppliers('pending')`＋`reviewSupplier()`
 * - 看板：`getBoard()` → 統計與地圖（據點、食物點、長者）
 * - 長者名冊：`listElders()`、`createElder()`、`updateElder()`；只有代號、座標、地址、過敏原，全部是模擬資料（ADR-024、ADR-026、ADR-027）
 * - 重置：`resetDemo()`
 * - 指定志工（v2.7，ADR-032）：`listVolunteers()`；表單只列所選據點的志工，改據點時清掉別據點的志工；預設不指定（派送依最常照顧的志工，M16）
 * - 斷網（ADR-024）：讀取用裝置上的資料並顯示 StaleBanner，寫入一律停用
 *
 * 設計 v2（T-138，docs/meal-relay/design-v2/README.md §3.6）：分頁「待審核｜服務看板｜長者名冊」與網址 `?tab=` 同步（預設看板）、
 * 重置前先確認（askReset → confirmReset）、看板統計卡圖示與地圖圖例、名冊狀態、手機上表單用底部面板（useWideLayout）。
 */
import { computed, onBeforeUnmount, reactive, ref, watch, type Component, type Ref } from 'vue'
import { CalendarCheck, CircleCheck, ConciergeBell, Heart, Users } from 'lucide-vue-next'
import {
  MealApiError,
  createElder,
  currentAccountId,
  getBoard,
  getMe,
  listElders,
  listStations,
  listSuppliers,
  listVolunteers,
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
  Volunteer,
} from '../data'
import { useTabQuery } from './brand'
import type { LegendItem, Marker, MarkerKind, MarkerStatus } from './mapMarker'
import { MARKER_KIND_LABEL, legendOf } from './mapMarker'
import { ALLERGEN_LABEL } from './mealLabels'
import { MOTION } from './motion'
import { toast } from './toast'

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），本頁用到的型別從這裡轉出去 */
export type { Allergen, Board, BoardStats, Elder, Food, Location, Me, OrgType, Station, Supplier, Volunteer }

/* ---------------------------------------------------------------- 常數與中文 */

export type AdminAccess = 'loading' | 'admin' | 'denied' | 'error'
export type AdminTab = 'review' | 'board' | 'elders' | 'stations'
export type ReviewDecision = 'approved' | 'rejected'

/** 分頁的顯示順序（設計 v2 02：待審核｜服務看板｜長者名冊） */
export const ADMIN_TABS: { value: AdminTab; label: string }[] = [
  { value: 'review', label: '待審核' },
  { value: 'board', label: '服務看板' },
  { value: 'elders', label: '長者名冊' },
  { value: 'stations', label: '據點管理' },
]

/** `?tab=` 可用的值；第一個是預設（網址沒有或不認得 → 服務看板） */
export const ADMIN_TAB_VALUES = ['board', 'review', 'elders', 'stations'] as const satisfies readonly AdminTab[]

/** 給 MR-C66 SegmentedTabs：「待審核」帶 pending 申請數的徽章（0 不顯示） */
export function adminTabs(pendingCount: number): { value: AdminTab; label: string; badge?: number }[] {
  return ADMIN_TABS.map((t) => (t.value === 'review' ? { ...t, badge: pendingCount } : { ...t }))
}

/** 分頁與網址 `?tab=review|board|elders` 同步（保留 `?as=` 等其他參數），App 返回鍵能退回上一個分頁。只能在元件 setup 裡呼叫 */
export function useAdminTab(): Ref<AdminTab> {
  return useTabQuery<AdminTab>('tab', ADMIN_TAB_VALUES)
}

/** 合約 §4 OrgType */
export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  person: '個人',
  school: '學校',
  agency: '機關',
  shop: '店家',
  other: '其他',
}

/** 看板統計卡（MR-C13）的順序、名稱與圖示（設計 v2 §3.6；數字來自 Board.stats，算法見 T-113） */
export const STAT_FIELDS: { key: keyof BoardStats; label: string; icon: Component; tone?: 'alert' }[] = [
  { key: 'foods_open', label: '可派送食物', icon: ConciergeBell },
  { key: 'delivered_today', label: '今日送達', icon: CircleCheck },
  { key: 'seen_today', label: '今日見到', icon: Users },
  { key: 'alerts', label: '需關懷長者', icon: Heart, tone: 'alert' },
  { key: 'checkins_today', label: '今日報到', icon: CalendarCheck },
]

/** ADR-024 隱私提示，放在長者表單旁 */
export const PRIVACY_NOTE = '稱呼只用代稱（例如「陳阿公」「萬華-A01」），不要填真實姓名、電話。地址只能填模擬地址，位置請選路上或公共空間，不要選住家。'

/** 長者名冊右上的晶片（ADR-024：長者資料只能是模擬資料） */
export const SIMULATED_ONLY_TEXT = '僅使用模擬資料'

/** 看板地圖左上的標籤 */
export const MAP_NOTE_TEXT = '位置示意・模擬資料'

/** 新增長者時「代號」欄的文字：長者 id 由後端產生 */
export const NEW_ELDER_ID_TEXT = '儲存後自動產生'

/** 沒有權限時的說明（§2：admin 只用管理系統網址登入，畫面上沒有選身分的按鈕） */
export const DENIED_TEXT = '管理系統只給管理員使用。請用管理員帳號開啟：/#/f/meal-relay/admin?as=<管理員帳號 id>'

/** 審核後晶片停留＋整列收合（MR-C19 D3）的時間，之後才從清單移除，動畫不會被打斷 */
export const REVIEW_SETTLE_MS = MOTION.emphasis + MOTION.slow

/** 看板多久重新取得一次（志工報到、送達會即時反映到統計與地圖） */
export const BOARD_POLL_MS = 15_000

/** 稱呼（alias）長度上限（後端 ElderCreate.alias max_length） */
export const ALIAS_MAX = 20

/** 地址長度上限（後端 ElderCreate.address max_length）；只能填模擬地址（ADR-027） */
export const ADDRESS_MAX = 120

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
  /** 選填，只能是模擬地址（ADR-027） */
  address: string
  location: Location | null
  allergens: Allergen[]
  station_id: string
  next_care_at: string
  next_meal_at: string
  /** v2.7（ADR-032）：指定志工的帳號 id；'' = 不指定（派送依最常照顧的志工，M16） */
  preferred_volunteer_id: string
}

export type ElderDraftErrors = Partial<Record<keyof ElderDraft, string>>

/** 指定志工下拉選單的預設選項（ADR-032） */
export const PREFERRED_NONE_TEXT = '不指定（由系統依最常照顧的志工派送）'

export function emptyElderDraft(): ElderDraft {
  return { alias: '', address: '', location: null, allergens: [], station_id: '', next_care_at: '', next_meal_at: '', preferred_volunteer_id: '' }
}

/** 指定志工的選項：只列這個據點的志工（ADR-032：必須是同據點的志工）；沒選據點 → 空清單 */
export function volunteersOfStation(volunteers: readonly Volunteer[], stationId: string): Volunteer[] {
  if (!stationId) return []
  return volunteers.filter((v) => v.station_id === stationId)
}

/** 志工名稱；清單裡沒有（例如讀取失敗）就顯示帳號 id */
export function volunteerName(volunteers: readonly Volunteer[], id: string | null | undefined): string {
  if (!id) return ''
  return volunteers.find((v) => v.id === id)?.name || id
}

/**
 * 名冊與表單顯示的負責志工（M16 v2.7）：有指定志工 →「指定志工：X」；沒有但有最常照顧的志工 →「最常照顧：X」；都沒有 → ''。
 */
export function caretakerText(e: Pick<Elder, 'preferred_volunteer_id' | 'primary_volunteer_id'>, volunteers: readonly Volunteer[]): string {
  if (e.preferred_volunteer_id) return `指定志工：${volunteerName(volunteers, e.preferred_volunteer_id)}`
  if (e.primary_volunteer_id) return `最常照顧：${volunteerName(volunteers, e.primary_volunteer_id)}`
  return ''
}

/** 修改時把長者的資料放進表單 */
export function draftOfElder(e: Elder): ElderDraft {
  return {
    alias: e.alias,
    address: e.address ?? '',
    location: { ...e.location },
    allergens: [...e.allergens],
    station_id: e.station_id,
    next_care_at: toLocalInput(e.next_care_at),
    next_meal_at: toLocalInput(e.next_meal_at),
    preferred_volunteer_id: e.preferred_volunteer_id ?? '',
  }
}

/**
 * 必填：稱呼（alias）、位置、據點（ADR-026：管理員登記，據點必填）。稱呼看起來像電話就擋下（ADR-024）。
 * 有給 volunteers（志工清單讀取成功）時，指定志工必須是所選據點的志工（ADR-032）。
 */
export function validateElderDraft(d: ElderDraft, volunteers?: readonly Volunteer[]): ElderDraftErrors {
  const errors: ElderDraftErrors = {}
  const alias = d.alias.trim()
  if (!alias) errors.alias = '請填稱呼'
  else if (alias.length > ALIAS_MAX) errors.alias = `稱呼最多 ${ALIAS_MAX} 個字`
  else if (/\d{6,}/.test(alias.replace(/[\s-]/g, ''))) errors.alias = '稱呼看起來像電話號碼，請改用代稱，不要填真實資料'
  if (d.address.trim().length > ADDRESS_MAX) errors.address = `地址最多 ${ADDRESS_MAX} 個字`
  if (!d.location) errors.location = '請在地圖上選位置'
  if (!d.station_id) errors.station_id = '請選據點'
  for (const key of ['next_care_at', 'next_meal_at'] as const) {
    if (d[key].trim() && !fromLocalInput(d[key])) errors[key] = '時間格式不正確'
  }
  const preferred = d.preferred_volunteer_id ?? ''
  if (preferred && volunteers && !volunteersOfStation(volunteers, d.station_id).some((v) => v.id === preferred)) {
    errors.preferred_volunteer_id = '指定志工必須是所屬據點的志工'
  }
  return errors
}

/** POST /elders 的內容（後端 extra="forbid"：只送合約欄位） */
export function toElderCreate(d: ElderDraft): ElderCreate {
  if (!d.location) throw new Error('location is required')
  return {
    alias: d.alias.trim(),
    address: d.address.trim(),
    location: { lat: d.location.lat, lng: d.location.lng },
    allergens: [...d.allergens],
    station_id: d.station_id,
    next_care_at: fromLocalInput(d.next_care_at),
    next_meal_at: fromLocalInput(d.next_meal_at),
    preferred_volunteer_id: d.preferred_volunteer_id || null,
  }
}

/** PATCH /elders/{id} 的內容：只送改過的欄位；清空的下次時間送 null（後端清掉） */
export function toElderUpdate(d: ElderDraft, original: Elder): ElderUpdate {
  const body: ElderUpdate = {}
  const alias = d.alias.trim()
  if (alias !== original.alias) body.alias = alias
  const address = d.address.trim()
  if (address !== (original.address ?? '')) body.address = address
  if (d.location && (d.location.lat !== original.location.lat || d.location.lng !== original.location.lng)) {
    body.location = { lat: d.location.lat, lng: d.location.lng }
  }
  if ([...d.allergens].sort().join() !== [...original.allergens].sort().join()) body.allergens = [...d.allergens]
  if (d.station_id && d.station_id !== original.station_id) body.station_id = d.station_id
  for (const key of ['next_care_at', 'next_meal_at'] as const) {
    if (d[key].trim() !== toLocalInput(original[key])) body[key] = fromLocalInput(d[key])
  }
  // ADR-032：改了指定志工才送；'' → null（取消指定）。改據點時表單已清掉別據點的志工，這裡就會送 null
  const preferred = d.preferred_volunteer_id || null
  if (preferred !== (original.preferred_volunteer_id ?? null)) body.preferred_volunteer_id = preferred
  return body
}

/* ---------------------------------------------------------------- 名冊的一列 */

export interface ElderSummary {
  stationName: string
  /** 沒填地址 → 「未填地址」 */
  addressText: string
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
    addressText: e.address?.trim() || '未填地址',
    allergensText: e.allergens.length ? e.allergens.map((a) => ALLERGEN_LABEL[a]).join('、') : '沒有過敏原',
    seenText: seenText(e.days_since_seen),
    nextText: `下次關懷 ${shortTimeText(e.next_care_at)}・下次送餐 ${shortTimeText(e.next_meal_at)}`,
  }
}

/** 名冊的狀態（設計 v2 §3.6）：需要送餐 > 需要關懷 > 近期已見到（M10 的 meal_due、care_due） */
export type ElderStatusKey = 'meal_due' | 'care_due' | 'seen'

export const ELDER_STATUS_LABEL: Record<ElderStatusKey, string> = {
  meal_due: '需要送餐',
  care_due: '需要關懷',
  seen: '近期已見到',
}

export function elderStatusOf(e: Pick<Elder, 'meal_due' | 'care_due'>): ElderStatusKey {
  if (e.meal_due) return 'meal_due'
  if (e.care_due) return 'care_due'
  return 'seen'
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

/**
 * 看板地圖的圖例（設計 v2：據點、食物點、長者）：依地圖上真的有的定位針（MR-C58 legendOf，保留 T-126 三色），
 * 順序改成據點、食物點、長者；地圖上沒有的種類也補一項，讓三種都看得到。
 * 同一種有兩個顏色時加上狀態，例如「食物點（還沒被派出）」。
 */
export function boardLegend(markers: readonly Marker[]): LegendItem[] {
  const order: MarkerKind[] = ['station', 'point', 'elder']
  const items = legendOf(markers).filter((i) => order.includes(i.kind))
  for (const kind of order) {
    if (!items.some((i) => i.kind === kind)) {
      items.push({ key: `${kind}:default`, kind, color: kind === 'station' ? 'station' : 'primary', label: MARKER_KIND_LABEL[kind] })
    }
  }
  return items
    .map((i) => (i.kind === 'point' && i.color === 'warn' ? { ...i, label: `${MARKER_KIND_LABEL.point}（還沒被派出）` } : i))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

/** 「今天的服務概況｜2026 / 11 / 08」的日期（台北時間） */
export function boardDateText(now: number): string {
  const d = new Date(now + __TAIPEI_OFFSET_MS).toISOString()
  return `${d.slice(0, 4)} / ${d.slice(5, 7)} / ${d.slice(8, 10)}`
}

/** 食物去向一列：「剩餘 n｜已派送 n｜已送達 n」（M1：remaining、dispatched_qty 派出中、delivered_qty） */
export function foodFlowText(f: Pick<Food, 'remaining' | 'dispatched_qty' | 'delivered_qty'>): string {
  return `剩餘 ${f.remaining}｜已派送 ${f.dispatched_qty}｜已送達 ${f.delivered_qty}`
}

/** 審核表的「位置」：有地址（v2.5，ADR-030）用地址，沒有就顯示座標 */
export function supplierPlaceText(s: Pick<Supplier, 'address' | 'location'>): string {
  const address = s.address?.trim()
  if (address) return address
  return `${s.location.lat.toFixed(4)}, ${s.location.lng.toFixed(4)}`
}

/* ---------------------------------------------------------------- 版面 */

/** 桌面版面的寬度（設計 v2 §3.6：≥ 1024px 多欄，以下一欄） */
export const WIDE_QUERY = '(min-width: 1024px)'

/** 寬度 ≥ 1024px → true（名冊表單放右欄）；否則 false（表單改用底部面板）。沒有 matchMedia 時當成桌面。只能在元件 setup 裡呼叫 */
export function useWideLayout(): Readonly<Ref<boolean>> {
  const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY) : null
  const wide = ref(mq ? mq.matches : true)
  const onChange = (e: { matches: boolean }) => (wide.value = e.matches)
  mq?.addEventListener?.('change', onChange)
  onBeforeUnmount(() => mq?.removeEventListener?.('change', onChange))
  return wide
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
export function useAdmin(options: { tab?: Ref<AdminTab> } = {}) {
  const access = ref<AdminAccess>('loading')
  const accountId = ref('')
  const me = ref<Me | null>(null)
  const accessError = ref('')
  /** 頁面傳 useAdminTab()（與網址同步）；沒傳時預設服務看板 */
  const tab = options.tab ?? ref<AdminTab>('board')
  const now = ref(Date.now())
  /** 重置次數：PageTransition（variant="refresh"）的 page-key */
  const version = ref(0)

  const pending = ref<Supplier[]>([])
  const reviewed = ref<Supplier[]>([])
  const board = ref<Board | null>(null)
  const elders = ref<Elder[]>([])
  const stations = ref<Station[]>([])
  /** v2.7（ADR-032）：全部志工（GET /volunteers），表單只列所選據點的 */
  const volunteers = ref<Volunteer[]>([])
  /** 志工清單讀取失敗的訊息；有值時指定志工選單停用（其他欄位照常可存） */
  const volunteersError = ref('')
  const errors = reactive<Record<AdminTab, string>>({ review: '', board: '', elders: '', stations: '' })
  /** 各讀取的 stale_at（ADR-024）；有任何一個就是離線 */
  const stale = reactive<Record<string, string | undefined>>({})

  const draft = ref<ElderDraft>(emptyElderDraft())
  const editing = ref<Elder | null>(null)
  const formErrors = ref<ElderDraftErrors>({})
  const saving = ref(false)
  /** 手機版的表單底部面板是否打開（桌面版表單一直在右欄） */
  const formOpen = ref(false)

  /** 重置示範資料的確認視窗（MR-C67）與重置中 */
  const confirmingReset = ref(false)
  const resetting = ref(false)

  const staleAt = computed(() => Object.values(stale).filter(Boolean).sort()[0] ?? null)
  const offline = computed(() => staleAt.value !== null)
  const markers = computed(() => (board.value ? boardMarkers(board.value) : []))
  const formMarkers = computed(() => rosterMarkers(stations.value, elders.value, editing.value?.id))
  const roster = computed(() => sortElders(elders.value))
  const foods = computed(() => sortFoods(board.value?.foods ?? []))
  const sourceText = computed(() => sourcesOf([...stations.value, ...(board.value?.points ?? [])]))
  /** 表單的指定志工選項：所選據點的志工 */
  const formVolunteers = computed(() => volunteersOfStation(volunteers.value, draft.value.station_id))
  /** 修改中的長者目前最常照顧的志工（M9），顯示在指定志工選單下方；新增時 '' */
  const formCaretaker = computed(() =>
    editing.value?.primary_volunteer_id ? volunteerName(volunteers.value, editing.value.primary_volunteer_id) : '',
  )

  // ADR-032：同一張表單改了據點 → 指定志工不是新據點的志工就清掉（換長者、開新表單不算）
  watch(
    () => [draft.value, draft.value.station_id] as const,
    ([d, station], [prev, prevStation]) => {
      if (d !== prev || station === prevStation || !d.preferred_volunteer_id) return
      if (!volunteersOfStation(volunteers.value, station).some((v) => v.id === d.preferred_volunteer_id)) d.preferred_volunteer_id = ''
    },
    { flush: 'sync' },
  )

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
    await Promise.all([loadSuppliers(), loadBoard(), loadElders(), loadStations(), loadVolunteers()])
  }

  /** v2.7（ADR-032）：志工清單（admin）；失敗時只停用指定志工選單 */
  async function loadVolunteers(): Promise<void> {
    try {
      volunteers.value = [...__track('volunteers', await listVolunteers())]
      volunteersError.value = ''
    } catch (e) {
      if (__isForbidden(e)) access.value = 'denied'
      volunteersError.value = errorMessage(e, '讀取志工清單失敗，暫時不能指定志工')
    }
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
      errors.stations = ''
    } catch (e) {
      __fail('stations', e, '讀取據點失敗')
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

  /** 名冊點一位：表單切成修改模式（手機上打開底部面板） */
  function startEdit(elder: Elder): void {
    editing.value = elder
    draft.value = draftOfElder(elder)
    formErrors.value = {}
    formOpen.value = true
  }

  /** 「新增長者」：空白表單（手機上打開底部面板） */
  function startNew(): void {
    resetForm()
    formOpen.value = true
  }

  function resetForm(): void {
    editing.value = null
    draft.value = emptyElderDraft()
    formErrors.value = {}
  }

  /** 新增或修改長者；成功回 true */
  async function saveElder(): Promise<boolean> {
    if (offline.value || saving.value) return false
    formErrors.value = validateElderDraft(draft.value, volunteersError.value ? undefined : volunteers.value)
    if (Object.keys(formErrors.value).length) return false
    const original = editing.value
    const patch = original ? toElderUpdate(draft.value, original) : null
    if (patch && !Object.keys(patch).length) {
      toast('沒有修改任何欄位')
      resetForm()
      formOpen.value = false
      return true
    }
    saving.value = true
    try {
      const saved = original && patch ? await updateElder(original.id, patch) : await createElder(toElderCreate(draft.value))
      elders.value = original ? elders.value.map((e) => (e.id === saved.id ? saved : e)) : [...elders.value, saved]
      toast(original ? `已更新「${saved.alias}」` : `已新增「${saved.alias}」`)
      resetForm()
      formOpen.value = false
      void loadBoard() // 看板的長者與警示一起更新
      return true
    } catch (e) {
      toast(errorMessage(e, '儲存失敗，請再試一次'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  /** 重置：resetDemo 後重新載入，version + 1 讓內容淡出淡入（E3）。畫面上一律先經過 askReset → confirmReset */
  async function reset(): Promise<void> {
    if (offline.value) throw new MealApiError('OFFLINE', '目前離線，暫時不能重置', 0)
    await resetDemo()
    resetForm()
    formOpen.value = false
    reviewed.value = []
    await loadAll()
    version.value++
  }

  /** 按「重置示範資料」：只打開確認視窗，不呼叫 API（離線或重置中不打開） */
  function askReset(): void {
    if (offline.value || resetting.value) return
    confirmingReset.value = true
  }

  function cancelReset(): void {
    confirmingReset.value = false
  }

  /** 確認視窗按「重置」：才真的 resetDemo；成功提示「已重置為示範資料」，失敗顯示後端的中文訊息。成功回 true */
  async function confirmReset(): Promise<boolean> {
    confirmingReset.value = false
    if (resetting.value) return false
    resetting.value = true
    try {
      await reset()
      toast('已重置為示範資料')
      return true
    } catch (e) {
      toast(errorMessage(e, '重置失敗，請再試一次'), 'error')
      return false
    } finally {
      resetting.value = false
    }
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
    volunteers,
    volunteersError,
    formVolunteers,
    formCaretaker,
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
    formOpen,
    confirmingReset,
    resetting,
    init,
    loadAll,
    loadSuppliers,
    loadBoard,
    loadElders,
    loadVolunteers,
    review,
    startEdit,
    startNew,
    resetForm,
    saveElder,
    reset,
    askReset,
    cancelReset,
    confirmReset,
    start,
    stop,
  }
}
