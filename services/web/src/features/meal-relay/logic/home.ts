/**
 * LOGIC LAYER - 鄰食轉運站首頁 MR-P01（T-116）。合約 docs/system/11-meal-relay.md v2.2 §1、§2、§8、§9。
 *   讀身分（getMe）與據點清單（listStations），決定首頁「進入」按鈕要去哪裡。
 *   - volunteer → volunteer、supplier → supplier、station → station（shared.ts 的 homeRouteOf）
 *   - citizen 留在首頁，顯示「我要提供食物」→ supplier（申請表在提供者頁）
 *   - admin 只用管理系統網址，首頁不放連結；首頁沒有選角色的按鈕（§2）
 */
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { featureRoute } from '@/framework'
// 平台能力：modules/env 目前沒有 openLink()，先在這裡包成 openLink（docs/meal-relay/T-116.md 決策 3）
import { isInApp, send } from '@/platform/bridge'
import { getMe, listStations, MealApiError } from '../data'
import type { Cached, Me, Role, Station } from '../data'
import { homeRouteOf, type HomeRoute } from './shared'

export type { Me, Role, Station }

/* ---------------------------------------------------------------- 依角色進入（§9） */

export interface HomeEntry {
  /** enter：進到自己的頁面；offer_food：一般市民申請成為提供者 */
  kind: 'enter' | 'offer_food'
  route: HomeRoute
  label: string
  description: string
  to: RouteLocationRaw
}

const __ENTRY_TEXT: Record<HomeRoute, { label: string; description: string }> = {
  volunteer: { label: '進入志工頁', description: '到據點掃 QR code 報到，系統會把今天要送餐、關懷的長者派給你' },
  supplier: { label: '進入提供者頁', description: '上架多出來的食物，看每批的剩餘、派出中與已送達份數' },
  station: { label: '進入據點頁', description: '顯示會定時更新的報到 QR code，看今天報到的志工' },
}

/** 首頁的主要按鈕：志工、提供者、據點進到自己的頁面；一般市民是「我要提供食物」；管理員沒有按鈕（null） */
export function homeEntryOf(role: Role): HomeEntry | null {
  const route = homeRouteOf(role)
  if (route) return { kind: 'enter', route, ...__ENTRY_TEXT[route], to: featureRoute('meal-relay', route) }
  if (role === 'citizen')
    return {
      kind: 'offer_food',
      route: 'supplier',
      label: '我要提供食物',
      description: '店家、學校、機關或個人都可以申請成為提供者，管理員審核通過後就能上架多出來的食物',
      to: featureRoute('meal-relay', 'supplier'),
    }
  return null // admin：只用管理系統網址 /#/f/meal-relay/admin（§9）
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

  return { me, meError, stations, stationsError, now, entry, staleAt, stationSource, load, ready, openLink, volunteerLinks: VOLUNTEER_LINKS }
}
