/**
 * LOGIC LAYER - 地點照片（入口照片，T-128，ADR-028）的顯示判斷。
 * 合約 docs/system/11-meal-relay.md v2.3：`Station.image_url`、`Point.image_url`、`Food.point_image_url`、`PointCreate.image_id`。
 *
 * 有照片才顯示（回傳 null ＝ 不放縮圖，也不留空框）；網址一律用 data 層的 imageSrc() 接上後端位址。
 * 畫面用 MR-C57 PlacePhoto 顯示縮圖，點一下放大。
 */
import { imageSrc } from '../data'
import type { Food, Point, Station } from '../data'

/** MR-C57 PlacePhoto 要的資料：圖片完整網址、替代文字、放大時的標題 */
export interface PlacePhoto {
  src: string
  alt: string
  title: string
}

/** 入口照片的拍攝規定（ADR-028），放在上傳欄位下方 */
export const ENTRANCE_PHOTO_RULE = '只拍入口或建築外觀，不要拍到人臉、車牌、門牌號碼'

/** 照片網址 → 縮圖資料；沒有網址（null、空字串）回傳 null，畫面就不顯示 */
export function placePhotoOf(url: string | null | undefined, name: string, what = '入口照片'): PlacePhoto | null {
  const src = imageSrc(url)
  if (!src) return null
  const place = name.trim() || '這個地點'
  return { src, alt: `${place}的${what}`, title: `${place}・${what}` }
}

/** 志工任務卡：取餐地點（食物點）的入口照片 */
export function pickupPhotoOf(food: Pick<Food, 'point_image_url' | 'point_name'>): PlacePhoto | null {
  return placePhotoOf(food.point_image_url, food.point_name)
}

/** 首頁據點清單：據點的入口照片 */
export function stationPhotoOf(station: Pick<Station, 'image_url' | 'name'>): PlacePhoto | null {
  return placePhotoOf(station.image_url, station.name)
}

/** 食物點的入口照片 */
export function pointPhotoOf(point: Pick<Point, 'image_url' | 'name'>): PlacePhoto | null {
  return placePhotoOf(point.image_url, point.name)
}
