/** DATA LAYER - 看板（後端 meal_board，T-113）。 */
import { mealGet } from './client'
import type { Board, Cached } from './types'

/** GET /board（admin） */
export function getBoard(): Promise<Cached<Board>> {
  return mealGet<Board>('/board')
}
