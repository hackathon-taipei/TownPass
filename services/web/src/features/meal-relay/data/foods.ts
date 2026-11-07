/** DATA LAYER - 食物點、食物、圖片（後端 meal_food，T-109）。 */
import { imageSrc, mealGet, mealSend } from './client'
import type { Cached, Food, FoodCategory, FoodCreate, FoodUpdate, ImageUploaded, Point, PointCreate } from './types'

/** GET /points?category=&for_elder=（supplier、admin） */
export function listPoints(query: { category?: FoodCategory; for_elder?: string } = {}): Promise<Cached<Point[]>> {
  return mealGet<Point[]>('/points', query)
}

/** POST /points（supplier） */
export function createPoint(body: PointCreate): Promise<Point> {
  return mealSend<Point>('POST', '/points', body)
}

/** GET /foods?point_id=&category=&for_elder=&mine=1（supplier：mine 只看自己的；admin）。含剩餘、派出中、已送達（M1） */
export function listFoods(
  query: { point_id?: string; category?: FoodCategory; for_elder?: string; mine?: boolean } = {},
): Promise<Cached<Food[]>> {
  return mealGet<Food[]>('/foods', { ...query, mine: query.mine ? 1 : undefined })
}

/** GET /foods/{id}（supplier、volunteer、admin） */
export function getFood(id: string): Promise<Cached<Food>> {
  return mealGet<Food>(`/foods/${encodeURIComponent(id)}`)
}

/** POST /foods（supplier） */
export function createFood(body: FoodCreate): Promise<Food> {
  return mealSend<Food>('POST', '/foods', body)
}

/** PATCH /foods/{id}（supplier，自己的；可改 qty、expires_at、closed，M14） */
export function updateFood(id: string, body: FoodUpdate): Promise<Food> {
  return mealSend<Food>('PATCH', `/foods/${encodeURIComponent(id)}`, body)
}

/** POST /images（citizen：申請提供者的店面照片、supplier、volunteer）。dataUrl = 壓縮後的 base64 data URL（M19） */
export function uploadImage(dataUrl: string): Promise<ImageUploaded> {
  return mealSend<ImageUploaded>('POST', '/images', { data_url: dataUrl })
}

/**
 * GET /images/{id}：回傳圖片本身、不需 header，所以這裡不發請求，
 * 直接給可放進 <img src> 的完整網址（離線時由瀏覽器／Service Worker 處理）。
 */
export async function getImage(id: string): Promise<string> {
  return imageSrc(`/meal-relay/images/${encodeURIComponent(id)}`) ?? ''
}

export { imageSrc }
