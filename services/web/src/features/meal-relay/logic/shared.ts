/**
 * 鄰食轉運站第 2 波頁面共用的邏輯（T-114），給 MR-C01～C06 與 MR-P01～P08 用。合約 docs/system/11-meal-relay.md v2.2。
 * 中文名稱沿用 kit 的 ./mealLabels.ts 與 ./foodQty.ts，不重寫；之後整理時 mealLabels.ts 的內容可搬進這裡。
 */
import type { Elder, Food, Role } from '../data/types'
import { FOOD_QTY_FIELDS, foodQtyCounts } from './foodQty'
import { timeLeftText } from './mealLabels'

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），T-114 元件用到的型別從這裡轉出去 */
export type { Allergen, Cached, Elder, Food, IsoDateTime, Location, Role } from '../data/types'
export * from './mealLabels'
export { FOOD_QTY_FIELDS, foodQtyCounts } from './foodQty'

/* ---------------------------------------------------------------- 份數（M1） */

/** 「剩 2／派出中 2／已送達 1」 */
export function foodQtyText(food: Pick<Food, 'remaining' | 'dispatched_qty' | 'delivered_qty'>): string {
  const counts = foodQtyCounts(food)
  return FOOD_QTY_FIELDS.map((f) => `${f.key === 'remaining' ? '剩' : f.label} ${counts[f.key]}`).join('／')
}

/* ---------------------------------------------------------------- 倒數 */

/** 到 iso 這個時間還剩多久：「還有 1 小時 5 分」；已過或時間格式錯誤都回「已到期」 */
export function countdownText(iso: string, now: number): string {
  const end = Date.parse(iso)
  return Number.isNaN(end) ? '已到期' : timeLeftText(end - now)
}

/* ---------------------------------------------------------------- 首頁依角色進入（§9） */

export type HomeRoute = 'volunteer' | 'supplier' | 'station'

/** 首頁「進入」按鈕要去的路由名稱（index.ts）；citizen 與 admin 留在首頁，回傳 null */
export function homeRouteOf(role: Role): HomeRoute | null {
  if (role === 'volunteer' || role === 'supplier' || role === 'station') return role
  return null
}

/* ---------------------------------------------------------------- 長者警示標籤（M10） */

export type ElderTag = 'meal_due' | 'care_due' | 'never_seen'

export const ELDER_TAG_LABEL: Record<ElderTag, string> = {
  meal_due: '需要送餐',
  care_due: '需要關懷',
  never_seen: '從未見到',
}

/** 長者身上要顯示的標籤，固定順序：需要送餐、需要關懷、從未見到 */
export function elderTagsOf(elder: Pick<Elder, 'meal_due' | 'care_due' | 'last_seen_at'>): ElderTag[] {
  const tags: ElderTag[] = []
  if (elder.meal_due) tags.push('meal_due')
  if (elder.care_due) tags.push('care_due')
  if (!elder.last_seen_at) tags.push('never_seen')
  return tags
}

/* ---------------------------------------------------------------- 斷網（ADR-024） */

/** 斷網提示文字；staleAt 為空（線上資料）回空字串 */
export function staleText(staleAt: string | null | undefined, now: number): string {
  if (!staleAt) return ''
  const t = Date.parse(staleAt)
  if (Number.isNaN(t)) return '目前離線，顯示的是先前存下的資料，暫時不能送出'
  const min = Math.max(0, Math.floor((now - t) / 60_000))
  const ago = min < 1 ? '剛剛' : min < 60 ? `${min} 分鐘前` : `${Math.floor(min / 60)} 小時前`
  return `目前離線，顯示的是${ago}的資料，暫時不能送出`
}

/* ---------------------------------------------------------------- 圖片（M19） */

/** 合約 §5：圖片上限 */
export const IMAGE_MAX_BYTES = 200_000
/** 前端壓縮時的長邊上限（px） */
export const IMAGE_MAX_EDGE = 800
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageMime = (typeof IMAGE_MIMES)[number]

export function isImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIMES as readonly string[]).includes(mime)
}

/** 等比例縮到長邊 ≤ maxEdge（不放大），回傳整數尺寸 */
export function fitSize(width: number, height: number, maxEdge = IMAGE_MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const k = maxEdge / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** base64 字串（可含 data: 前綴）解碼後的位元組數 */
export function base64Bytes(b64: string): number {
  const body = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - pad
}

/** 依序嘗試的 JPEG 品質；壓到 ≤ IMAGE_MAX_BYTES 為止，最後一個還太大就回報 IMAGE_TOO_LARGE */
export const IMAGE_QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4] as const
