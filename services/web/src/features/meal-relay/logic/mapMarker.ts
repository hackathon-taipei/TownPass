/**
 * MapView 的定位針型別與顏色，對齊合約 docs/system/11-meal-relay.md v2.1（食物點、食物、申請、長者）。
 * 型別直接取自 ../data/types，不自己定義同義詞。
 *
 * 顏色（合約沒寫地圖顏色，暫定，見 docs/meal-relay/ui-kit.md 決策紀錄）：
 * | 狀態                                   | 顏色 |
 * | open（食物點上有可申請的食物）          | 黃 |
 * | claimed、delivering（已派送、配送中）    | 藍 |
 * | done、ok（完成、近期已見到本人）         | 綠 |
 * | unclaimed、alert（還沒被派出、警示）     | 紅 |
 * | expired、closed（已過期、已下架）        | 灰 |
 * | cancelled、沒有 status（據點、提供者）   | 預設深灰 |
 */
import type { ClaimStatus, FoodStatus, Location } from '../data/types'

export type { Location }

/** point＝食物點（meal_point）；volunteer＝志工目前位置（企鵝圖示） */
export type MarkerKind = 'supplier' | 'station' | 'elder' | 'point' | 'volunteer'

/** 志工企鵝圖示的張數（public/meal-relay/penguins/penguin-1～6.png） */
export const PENGUIN_COUNT = 6

/**
 * 每位志工「隨機」分到一隻企鵝，但同一個 id 永遠是同一隻（輪詢更新、重新整理都不會換）。
 * 用 id 的字串雜湊取餘數，不用 Math.random。回傳 1～PENGUIN_COUNT。
 */
export function penguinOf(id: string): number {
  return (__hash(id) % PENGUIN_COUNT) + 1
}

/** 同一個 id 的待機動作起始時間（0～1，乘上動畫長度當負的 delay），讓企鵝不會整齊同步搖擺 */
export function idlePhaseOf(id: string): number {
  return (Math.floor(__hash(id) / PENGUIN_COUNT) % 1000) / 1000
}

/** FNV-1a 字串雜湊（32 位元，非負整數） */
function __hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** unclaimed：Food.unclaimed = true；alert／ok：Elder.alert（M10） */
export type MarkerStatus = FoodStatus | ClaimStatus | 'unclaimed' | 'alert' | 'ok'

export type Marker = {
  id: string
  kind: MarkerKind
  location: Location
  status?: MarkerStatus
  label?: string
}

export type MapViewProps = {
  markers: Marker[]
  center?: Location
  onPick?: (location: Location) => void
  picked?: Location | null
}

export type PinColor = 'yellow' | 'blue' | 'green' | 'red' | 'grey' | 'default'

const STATUS_COLOR: Record<MarkerStatus, PinColor> = {
  open: 'yellow',
  claimed: 'blue',
  delivering: 'blue',
  done: 'green',
  ok: 'green',
  unclaimed: 'red',
  alert: 'red',
  expired: 'grey',
  closed: 'grey',
  cancelled: 'default',
}

export function pinColorOf(status?: MarkerStatus): PinColor {
  return status ? STATUS_COLOR[status] : 'default'
}

/** 中文照合約 §4；claimed 在食物是「已全數申請」、在申請是「已派送」，地圖標的是食物點，用「已全數申請」 */
export const MAP_STATUS_LABEL: Record<MarkerStatus, string> = {
  open: '可申請',
  claimed: '已全數申請',
  expired: '已過期',
  closed: '已下架',
  delivering: '配送中',
  done: '完成',
  cancelled: '取消',
  unclaimed: '還沒被派出',
  alert: '警示',
  ok: '近期已見到本人',
}

export const MARKER_KIND_LABEL: Record<MarkerKind, string> = {
  supplier: '提供者',
  station: '據點',
  elder: '長者',
  point: '食物點',
  volunteer: '志工',
}
