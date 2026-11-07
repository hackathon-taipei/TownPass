/** DATA LAYER - 申請（後端 meal_claim，T-110）。 */
import { mealGet, mealSend } from './client'
import type { Cached, Claim, ClaimCreate, ClaimStatus } from './types'

const __path = (id: string, action: string) => `/claims/${encodeURIComponent(id)}/${action}`

/** POST /claims（elder 自己、volunteer 自己據點的長者） */
export function createClaim(body: ClaimCreate): Promise<Claim> {
  return mealSend<Claim>('POST', '/claims', body)
}

/** GET /claims/mine（elder、volunteer） */
export function listMyClaims(): Promise<Cached<Claim[]>> {
  return mealGet<Claim[]>('/claims/mine')
}

/** GET /claims?status=requested（volunteer，自己據點） */
export function listStationClaims(status: ClaimStatus = 'requested'): Promise<Cached<Claim[]>> {
  return mealGet<Claim[]>('/claims', { status })
}

/** GET /claims/pickup（supplier，自己的食物、ready_for_pickup） */
export function listPickupClaims(): Promise<Cached<Claim[]>> {
  return mealGet<Claim[]>('/claims/pickup')
}

/** POST /claims/{id}/accept（volunteer） */
export function acceptClaim(id: string): Promise<Claim> {
  return mealSend<Claim>('POST', __path(id, 'accept'))
}

/** POST /claims/{id}/pickup（volunteer，自己的） */
export function pickupClaim(id: string): Promise<Claim> {
  return mealSend<Claim>('POST', __path(id, 'pickup'))
}

/** POST /claims/{id}/confirm-pickup（supplier，自己的食物） */
export function confirmPickup(id: string): Promise<Claim> {
  return mealSend<Claim>('POST', __path(id, 'confirm-pickup'))
}

/** POST /claims/{id}/cancel（申請人、該志工、該提供者） */
export function cancelClaim(id: string, reason?: string): Promise<Claim> {
  return mealSend<Claim>('POST', __path(id, 'cancel'), reason ? { reason } : {})
}
