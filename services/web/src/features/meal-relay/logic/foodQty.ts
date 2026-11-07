/**
 * 食物份數的檢查與顯示（MR-C11 QtyInput、MR-C14 FoodRow 用），對齊合約 v2.2 的 M1、M14。
 * v2.2 沒有手動申請（ADR-026），份數輸入只給提供者上架（createFood）與改份數（updateFood）。
 */
import type { Food } from '../data/types'

/** 份數上限的預設值（輸入框最多 3 位數） */
export const QTY_MAX_DEFAULT = 999

/**
 * 份數輸入框的提示文字；空字串＝合法。
 * text 是輸入框裡的字（只會有數字）；min 改份數時傳 dispatched_qty + delivered_qty（M14），上架時是 1。
 */
export function qtyHint(text: string, min = 1, max = QTY_MAX_DEFAULT): string {
  if (text === '') return '請輸入份數'
  const n = Number(text)
  if (n < min) return min > 1 ? `不能少於已派出＋已送達的 ${min} 份` : `至少 ${min} 份`
  if (n > max) return `最多 ${max} 份`
  return ''
}

/** 份數輸入框沒有錯誤時的說明 */
export function qtyRangeText(min = 1, max = QTY_MAX_DEFAULT): string {
  return min > 1 ? `已派出＋已送達 ${min} 份，最少 ${min} 份、最多 ${max} 份` : `請輸入 ${min} 到 ${max} 份`
}

export type FoodQtyKey = 'remaining' | 'dispatched_qty' | 'delivered_qty'

/** 食物列的三個數字（M1）：剩餘、派出中、已送達，固定這個順序 */
export const FOOD_QTY_FIELDS: { key: FoodQtyKey; label: string }[] = [
  { key: 'remaining', label: '剩餘' },
  { key: 'dispatched_qty', label: '派出中' },
  { key: 'delivered_qty', label: '已送達' },
]

/** 取出食物列要顯示的三個數字 */
export function foodQtyCounts(food: Pick<Food, FoodQtyKey>): Record<FoodQtyKey, number> {
  return { remaining: food.remaining, dispatched_qty: food.dispatched_qty, delivered_qty: food.delivered_qty }
}
