/**
 * 志工的企鵝頭像（MR-C23 VolunteerAvatar 用）。
 * 圖在 public/meal-relay/penguins/penguin-1～6.png（來源與授權見 docs/meal-relay/ui-kit.md §5）。
 * 合約 v2.2 沒有志工位置的 API，所以企鵝只當頭像（據點頁今天報到、志工頁），不畫在地圖上。
 */

/** 企鵝圖的張數 */
export const PENGUIN_COUNT = 6

/**
 * 每位志工「隨機」分到一隻企鵝，但同一個 id 永遠是同一隻（輪詢更新、重新整理都不會換）。
 * 用 id 的字串雜湊取餘數，不用 Math.random。回傳 1～PENGUIN_COUNT。
 */
export function penguinOf(id: string): number {
  return (__hash(id) % PENGUIN_COUNT) + 1
}

/** 同一個 id 的待機動作起始時間（0～1，乘上動畫長度當負的 delay），讓一排頭像不會整齊同步搖擺 */
export function idlePhaseOf(id: string): number {
  return (Math.floor(__hash(id) / PENGUIN_COUNT) % 1000) / 1000
}

/** 頭像圖片網址；base 傳 import.meta.env.BASE_URL */
export function penguinSrc(id: string, base = '/'): string {
  return `${base}meal-relay/penguins/penguin-${penguinOf(id)}.png`
}

/** FNV-1a 字串雜湊（32 位元，非負整數） */
function __hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
