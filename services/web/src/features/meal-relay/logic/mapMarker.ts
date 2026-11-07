/**
 * MapView 的定位針型別與顏色，對齊合約 docs/system/11-meal-relay.md v2.2（食物點、食物、申請、長者）。
 * 型別直接取自 ../data/types，不自己定義同義詞。
 *
 * 顏色只剩三種狀態色＋據點深灰（T-126，見 docs/meal-relay/ui-kit.md 決策紀錄）：
 * | 狀態                                              | 顏色 |
 * | open、delivering、ok（可派送、配送中、長者正常）    | primary（主色） |
 * | unclaimed、alert（還沒被派出、長者需要處理）        | warn（警示） |
 * | claimed、done、expired、closed、cancelled（結束）   | grey（灰） |
 * | 沒有 status（據點、提供者、沒有食物的點）           | station（深灰 grey-700，是「地點」不是狀態） |
 * 已結束的食物點（claimed、expired、closed）與 done、cancelled 不畫在地圖上（isEndedMarker）。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { ClaimStatus, Elder, FoodStatus, Location, Station } from '../data/types'
import { elderTagsOf } from './shared'
import { penguinSrc } from './volunteerAvatar'

export type { Location }

/**
 * point＝食物點（meal_point）。
 * elder＝長者：只用在管理員登記長者的參考定位針與志工自己的任務（listMyAssignments 回傳的長者，M13）；
 * 志工畫面不能出現長者清單或據點的所有長者（ADR-026）。
 * me＝「我的位置」：只在志工任務卡，位置來自裝置的 navigator.geolocation，不送後端、不存（useMyLocation）。
 */
export type MarkerKind = 'supplier' | 'station' | 'elder' | 'point' | 'me'

/** unclaimed：Food.unclaimed = true；alert／ok：長者需要處理／正常（M10） */
export type MarkerStatus = FoodStatus | ClaimStatus | 'unclaimed' | 'alert' | 'ok'

export type Marker = {
  id: string
  kind: MarkerKind
  location: Location
  status?: MarkerStatus
  label?: string
  /** kind: 'me' 的頭像圖片網址（MR-C23 企鵝） */
  avatar?: string
}

export type MapViewProps = {
  markers: Marker[]
  center?: Location
  onPick?: (location: Location) => void
  picked?: Location | null
}

export type PinColor = 'primary' | 'warn' | 'grey' | 'station'

const STATUS_COLOR: Record<MarkerStatus, PinColor> = {
  open: 'primary',
  delivering: 'primary',
  ok: 'primary',
  unclaimed: 'warn',
  alert: 'warn',
  claimed: 'grey',
  done: 'grey',
  expired: 'grey',
  closed: 'grey',
  cancelled: 'grey',
}

export function pinColorOf(status?: MarkerStatus): PinColor {
  return status ? STATUS_COLOR[status] : 'station'
}

/** 已結束、不畫在地圖上的定位針：食物點已全數派出、已過期、已下架；完成、取消 */
export function isEndedMarker(m: Pick<Marker, 'kind' | 'status'>): boolean {
  if (!m.status) return false
  if (m.status === 'done' || m.status === 'cancelled') return true
  return m.kind === 'point' && (m.status === 'claimed' || m.status === 'expired' || m.status === 'closed')
}

/** 地圖真正要畫的定位針（濾掉已結束的） */
export function visibleMarkers<T extends Pick<Marker, 'kind' | 'status'>>(markers: readonly T[]): T[] {
  return markers.filter((m) => !isEndedMarker(m))
}

/** 中文照合約 §4；claimed 在食物是「已全數派出」、在申請是「已派送」，地圖標的是食物點，用「已全數派出」 */
export const MAP_STATUS_LABEL: Record<MarkerStatus, string> = {
  open: '可派送',
  claimed: '已全數派出',
  expired: '已過期',
  closed: '已下架',
  delivering: '配送中',
  done: '完成',
  cancelled: '取消',
  unclaimed: '還沒被派出',
  alert: '需要處理',
  ok: '正常',
}

export const MARKER_KIND_LABEL: Record<MarkerKind, string> = {
  supplier: '提供者',
  station: '據點',
  elder: '長者',
  point: '食物點',
  me: '我的位置',
}

/* ---------------------------------------------------------------- 志工任務卡的地圖（MR-C40） */

export type TaskMapInput = {
  /** 任務的據點（assignment.station_id 對到的據點）；找不到就不畫 */
  station?: Pick<Station, 'id' | 'name' | 'location'> | null
  /** 這張任務的長者（M13：只有這一位） */
  elder: Pick<Elder, 'id' | 'alias' | 'location' | 'meal_due' | 'care_due' | 'last_seen_at'>
  /** 我的位置：志工 id（決定企鵝）＋裝置定位；拒絕定位或取不到時為 null，就不畫 */
  me?: { id: string; location: Location } | null
  /** 企鵝圖的 base（import.meta.env.BASE_URL） */
  base?: string
}

/**
 * 志工任務卡的定位針：只有據點、這張任務的長者、我（T-126）。
 * 長者有任何警示標籤（需要送餐、需要關懷、從未見到）→ alert（warn），否則 ok（primary）。
 */
export function taskMarkers({ station, elder, me, base = '/' }: TaskMapInput): Marker[] {
  const out: Marker[] = []
  if (station) out.push({ id: `station:${station.id}`, kind: 'station', location: station.location, label: station.name })
  out.push({
    id: `elder:${elder.id}`,
    kind: 'elder',
    location: elder.location,
    status: elderTagsOf(elder).length ? 'alert' : 'ok',
    label: elder.alias,
  })
  if (me) out.push({ id: 'me', kind: 'me', location: me.location, label: '我', avatar: penguinSrc(me.id, base) })
  return out
}

/* ---------------------------------------------------------------- 圖例（icon＋文字） */

export type LegendItem = { key: string; kind: MarkerKind; color: PinColor; label: string; avatar?: string }

/** 圖例：依地圖上真的有的定位針，每種「種類＋顏色」一項，順序：據點、長者、食物點、提供者、我 */
export function legendOf(markers: readonly Marker[]): LegendItem[] {
  const order: MarkerKind[] = ['station', 'elder', 'point', 'supplier', 'me']
  const seen = new Map<string, LegendItem>()
  for (const m of visibleMarkers(markers)) {
    const color = pinColorOf(m.status)
    const key = `${m.kind}:${m.kind === 'me' ? '' : color}`
    if (seen.has(key)) continue
    const status = m.kind === 'elder' && m.status === 'alert' ? '（需要處理）' : ''
    seen.set(key, { key, kind: m.kind, color, label: m.kind === 'me' ? '我' : `${MARKER_KIND_LABEL[m.kind]}${status}`, avatar: m.avatar })
  }
  return [...seen.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

/* ---------------------------------------------------------------- 我的位置（只在裝置上） */

const __myLocation = ref<Location | null>(null)
let __users = 0
let __watchId: number | undefined

function __geo(): Geolocation | undefined {
  return typeof navigator !== 'undefined' ? navigator.geolocation : undefined
}

/**
 * 裝置目前的位置（navigator.geolocation）。**只在畫面上用，不送後端、不存起來**（隱私：位置不離開裝置）。
 * 使用者拒絕定位、裝置不支援或取不到時是 null，不跳錯誤。多張任務卡共用同一個 watch。
 */
export function useMyLocation(): Readonly<Ref<Location | null>> {
  onMounted(() => {
    __users += 1
    const geo = __geo()
    if (__users > 1 || !geo) return
    try {
      __watchId = geo.watchPosition(
        (p) => (__myLocation.value = { lat: p.coords.latitude, lng: p.coords.longitude }),
        () => (__myLocation.value = null),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
      )
    } catch {
      __myLocation.value = null
    }
  })
  onBeforeUnmount(() => {
    __users = Math.max(0, __users - 1)
    if (__users === 0 && __watchId !== undefined) {
      __geo()?.clearWatch(__watchId)
      __watchId = undefined
      __myLocation.value = null
    }
  })
  return __myLocation
}
