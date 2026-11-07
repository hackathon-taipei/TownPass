/**
 * DATA LAYER - 申請（後端 meal_claim，T-110）。
 * ADR-025：申請只由志工報到時的自動派送建立（M7、M17），這裡沒有建立申請的函數。
 */
import { mealGet, mealSend } from './client'
import type { Cached, Claim } from './types'

const __path = (id: string, action: string) => `/claims/${encodeURIComponent(id)}/${action}`

/** GET /claims/mine（volunteer：派給自己的申請，只回傳 claimed、delivering，M13） */
export function listMyClaims(): Promise<Cached<Claim[]>> {
  return mealGet<Claim[]>('/claims/mine')
}

/** POST /claims/{id}/pickup（volunteer，自己的）：claimed → delivering（M8） */
export function pickupClaim(id: string): Promise<Claim> {
  return mealSend<Claim>('POST', __path(id, 'pickup'))
}

/** POST /claims/{id}/cancel（volunteer，自己的）：claimed、delivering → cancelled，份數退回（M8） */
export function cancelClaim(id: string, reason?: string): Promise<Claim> {
  return mealSend<Claim>('POST', __path(id, 'cancel'), reason ? { reason } : {})
}
