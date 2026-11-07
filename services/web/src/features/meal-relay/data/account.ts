/** DATA LAYER - 帳號、提供者申請與審核、重置（後端 meal_account，T-108）。 */
import { mealGet, mealSend } from './client'
import type { Cached, DemoResetResult, Me, Supplier, SupplierApply, SupplierStatus } from './types'

/** GET /me */
export function getMe(): Promise<Cached<Me>> {
  return mealGet<Me>('/me')
}

/** POST /demo/reset（admin） */
export function resetDemo(): Promise<DemoResetResult> {
  return mealSend<DemoResetResult>('POST', '/demo/reset')
}

/** POST /suppliers（elder） */
export function applySupplier(body: SupplierApply): Promise<Supplier> {
  return mealSend<Supplier>('POST', '/suppliers', body)
}

/** GET /suppliers/mine（elder、supplier）；還沒申請 → null */
export function getMySupplier(): Promise<Cached<Supplier | null>> {
  return mealGet<Supplier | null>('/suppliers/mine')
}

/** GET /suppliers?status=（admin） */
export function listSuppliers(status?: SupplierStatus): Promise<Cached<Supplier[]>> {
  return mealGet<Supplier[]>('/suppliers', { status })
}

/** POST /suppliers/{id}/approve 或 /reject（admin） */
export function reviewSupplier(id: string, decision: 'approve' | 'reject'): Promise<Supplier> {
  return mealSend<Supplier>('POST', `/suppliers/${encodeURIComponent(id)}/${decision}`)
}
