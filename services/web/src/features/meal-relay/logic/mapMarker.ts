/**
 * MapView 的定位針型別與顏色，對齊合約 docs/system/11-meal-relay.md v2.2（食物點、食物、申請、長者）。
 * 型別直接取自 ../data/types，不自己定義同義詞。
 *
 * 顏色（合約沒寫地圖顏色，暫定，見 docs/meal-relay/ui-kit.md 決策紀錄）：
 * | 狀態                                   | 顏色 |
 * | open（食物點上有可派送的食物）          | 黃 |
 * | claimed、delivering（已派送、配送中）    | 藍 |
 * | done、ok（完成、近期已見到本人）         | 綠 |
 * | unclaimed、alert（還沒被派出、警示）     | 紅 |
 * | expired、closed（已過期、已下架）        | 灰 |
 * | cancelled、沒有 status（據點、提供者）   | 預設深灰 |
 */
import type { ClaimStatus, FoodStatus, Location } from '../data/types'

export type { Location }

/**
 * point＝食物點（meal_point）。
 * elder＝長者：只用在管理系統看板（getBoard）與志工自己的任務（listMyAssignments 回傳的長者，M13）；
 * 志工畫面不能出現長者清單或據點的所有長者（ADR-026）。
 * 合約 v2.2 沒有志工位置的 API，所以地圖上沒有志工；志工的企鵝頭像見 logic/volunteerAvatar.ts。
 */
export type MarkerKind = 'supplier' | 'station' | 'elder' | 'point'

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
  alert: '警示',
  ok: '近期已見到本人',
}

export const MARKER_KIND_LABEL: Record<MarkerKind, string> = {
  supplier: '提供者',
  station: '據點',
  elder: '長者',
  point: '食物點',
}
