/**
 * LOGIC LAYER - 鄰食轉運站首頁 MR-P01（T-116，設計 v2 由 T-134 重構）。
 * 合約 docs/system/11-meal-relay.md v2.5 §1、§2、§8、§9；畫面規格 docs/meal-relay/design-v2/README.md §2、§3.1。
 *   讀身分（getMe）與據點清單（listStations），決定首頁主按鈕的文字與去向；不呼叫其他 API。
 *   - citizen「我要提供食物」→ supplier、supplier「管理我的食物」→ supplier
 *   - volunteer「進入志工頁」→ volunteer、station「打開報到 QR」→ station
 *   - admin 沒有按鈕，只用管理系統網址，首頁不放連結；首頁沒有選角色的按鈕（§2）
 *   - 點附近關懷據點的一列 → 底部面板：地址＋只有這個據點的地圖（useStationSheet）
 */
import { computed, nextTick, onScopeDispose, ref, shallowRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { featureRoute } from '@/framework'
// 平台能力：modules/env 目前沒有 openLink()，先在這裡包成 openLink（docs/meal-relay/T-116.md 決策 3）
import { isInApp, send } from '@/platform/bridge'
import { getMe, listStations, MealApiError } from '../data'
import type { Cached, Me, Role, Station } from '../data'
import type { Marker } from './mapMarker'
import { homeRouteOf, type HomeRoute } from './shared'

export type { Me, Role, Station }

/* ---------------------------------------------------------------- 依角色進入（§9、設計 v2 §2） */

/** 有主按鈕的角色（admin 沒有按鈕） */
export type EntryRole = Exclude<Role, 'admin'>

export interface HomeEntry {
  /** 依角色選圖示用 */
  role: EntryRole
  route: HomeRoute
  label: string
  to: RouteLocationRaw
}

/** 設計 v2 README §2 的按鈕文字 */
const __ENTRY_LABEL: Record<EntryRole, string> = {
  citizen: '我要提供食物',
  supplier: '管理我的食物',
  volunteer: '進入志工頁',
  station: '打開報到 QR',
}

/**
 * 首頁的主按鈕：citizen「我要提供食物」→ supplier（申請表在提供者頁）、supplier「管理我的食物」→ supplier、
 * volunteer「進入志工頁」→ volunteer、station「打開報到 QR」→ station；admin 沒有按鈕（null）
 */
export function homeEntryOf(role: Role): HomeEntry | null {
  if (role === 'admin' || !(role in __ENTRY_LABEL)) return null // admin：只用管理系統網址（§9），首頁不放連結
  const route = homeRouteOf(role) ?? 'supplier'
  return { role, route, label: __ENTRY_LABEL[role], to: featureRoute('meal-relay', route) }
}

/* ---------------------------------------------------------------- 附近關懷據點（設計 v2 §3.1） */

/** 據點列與面板上的地址；沒填（空字串，ADR-030）時顯示「地址未提供」 */
export function stationAddressText(station: Pick<Station, 'address'>): string {
  return station.address?.trim() || '地址未提供'
}

/** 據點面板的地圖：只有這個據點一根定位針 */
export function stationMarkersOf(station: Pick<Station, 'id' | 'name' | 'location'>): Marker[] {
  return [{ id: station.id, kind: 'station', location: station.location, label: station.name }]
}

/**
 * 據點底部面板（MR-C70）的開關。打開時記下捲動位置與目前的焦點，關閉後捲回原位、焦點回到點的那一列。
 *   station：最後點的據點（關閉動畫期間仍保留，面板內容不會消失）
 *   open：v-model 給 BottomSheet；設成 false（點遮罩、Esc、關閉鍵）就關閉並回到原位
 */
export function useStationSheet() {
  const station = shallowRef<Station | null>(null)
  const shown = ref(false)
  let scrollY = 0
  let focused: HTMLElement | null = null

  function openStation(s: Station): void {
    scrollY = typeof window === 'undefined' ? 0 : window.scrollY
    focused = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
    station.value = s
    shown.value = true
  }

  function closeStation(): void {
    if (!shown.value) return
    shown.value = false
    const y = scrollY
    const el = focused
    focused = null
    void nextTick(() => {
      el?.focus?.({ preventScroll: true })
      if (typeof window !== 'undefined') window.scrollTo({ top: y })
    })
  }

  const open = computed({
    get: () => shown.value,
    set: (v: boolean) => (v ? (shown.value = true) : closeStation()),
  })

  return { station, open, openStation, closeStation }
}

/* ---------------------------------------------------------------- 志工從哪裡來（§1） */

export interface VolunteerLink {
  label: string
  url: string
}

/** §1：正式版志工由據點透過臺北市志工管理整合平臺招募、在臺北 E 大受訓；本作品不做志工申請 */
export const VOLUNTEER_LINKS: readonly VolunteerLink[] = [
  { label: '臺北市志工管理整合平臺', url: 'https://newcv101.gov.taipei/' },
  { label: '臺北 E 大', url: 'https://elearning.taipei/mpage/' },
  // 全名「臺北市政府所屬各機關志願服務管理及運用原則」放在 MR-C32 的說明文字；按鈕 375px 寬只放得下約 15 字
  { label: '志願服務管理及運用原則', url: 'https://laws.gov.taipei/law/LawSearch/LawExport/FL101070?type=0' },
]

/** 在 App 裡用 bridge open_link 交給外部瀏覽器；一般瀏覽器開新分頁 */
export function openLink(url: string): void {
  if (isInApp()) send('open_link', url)
  else if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
}

/* ---------------------------------------------------------------- 資料來源（T-115） */

/** 據點清單用的開放資料（沒有據點時的預設，與 index.ts 的 sources 一致） */
export const STATION_SOURCE_DEFAULT = '臺北市銀髮族服務_社區照顧關懷據點（臺北市政府社會局）'

/** SourceNote 的文字：據點 `source` 欄位去重後串起來；沒有據點時用預設 */
export function stationSourceText(stations: readonly Pick<Station, 'source'>[]): string {
  const names = [...new Set(stations.flatMap((s) => s.source.split('、')).map((s) => s.trim()).filter(Boolean))]
  return names.length ? names.join('、') : STATION_SOURCE_DEFAULT
}

/* ---------------------------------------------------------------- 首頁狀態 */

/** 讀取失敗時給使用者看的中文（§7：後端回傳的 message；OFFLINE 是資料層的中文） */
export function homeErrorText(e: unknown, fallback: string): string {
  return e instanceof MealApiError && e.message ? e.message : fallback
}

/**
 * 首頁用的狀態與動作。建立時就開始讀取（getMe、listStations 同時送出），
 * now 每 15 秒更新一次給 StaleBanner（離線提示到分鐘即可）。
 *   me：undefined = 讀取中，null = 讀不到身分
 */
export function useHome() {
  const sheet = useStationSheet()
  const me = shallowRef<Cached<Me> | null>()
  const meError = ref('')
  const stations = shallowRef<Cached<Station[]> | null>()
  const stationsError = ref('')
  const now = ref(Date.now())

  const entry = computed(() => (me.value ? homeEntryOf(me.value.role) : null))
  const staleAt = computed(() => me.value?.stale_at ?? stations.value?.stale_at ?? null)
  const stationSource = computed(() => stationSourceText(stations.value ?? []))

  async function load(): Promise<void> {
    me.value = undefined
    stations.value = undefined
    meError.value = ''
    stationsError.value = ''
    await Promise.all([
      getMe().then(
        (r) => (me.value = r),
        (e) => {
          me.value = null
          meError.value = homeErrorText(e, '讀不到你的身分，請稍後再試')
        },
      ),
      listStations().then(
        (r) => (stations.value = r),
        (e) => {
          stations.value = null
          stationsError.value = homeErrorText(e, '讀不到據點清單，請稍後再試')
        },
      ),
    ])
  }

  const timer = setInterval(() => (now.value = Date.now()), 15_000)
  onScopeDispose(() => clearInterval(timer))
  const ready = load()

  return {
    me,
    meError,
    stations,
    stationsError,
    now,
    entry,
    staleAt,
    stationSource,
    load,
    ready,
    openLink,
    volunteerLinks: VOLUNTEER_LINKS,
    sheetStation: sheet.station,
    sheetOpen: sheet.open,
    openStation: sheet.openStation,
    closeStation: sheet.closeStation,
  }
}
