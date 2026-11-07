/**
 * 列舉值的中文（照合約 docs/system/11-meal-relay.md §4），給 MR-C14～C22 用。
 * T-114 的 logic/shared.ts 合併後，改從 shared.ts 匯入並刪掉這個檔案，避免兩份。
 */
import type {
  Allergen,
  ClaimMethod,
  ClaimStatus,
  FoodCategory,
  FoodStatus,
  SupplierStatus,
  VisitResult,
} from '../data/types'

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  crustacean: '甲殼類',
  mango: '芒果',
  peanut: '花生',
  milk: '牛奶羊奶',
  egg: '蛋',
  nut: '堅果類',
  sesame: '芝麻',
  gluten: '含麩質穀物',
  soy: '大豆',
  fish: '魚類',
  sulfite: '亞硫酸鹽',
}
/** 合約 §4 的順序 */
export const ALLERGENS = Object.keys(ALLERGEN_LABEL) as Allergen[]

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  meal_box: '熟食便當',
  bakery: '麵包點心',
  produce: '生鮮蔬果',
  dry_goods: '乾貨罐頭',
  drink: '飲品',
  other: '其他',
}

export const FOOD_STATUS_LABEL: Record<FoodStatus, string> = {
  open: '可申請',
  claimed: '已全數申請',
  expired: '已過期',
  closed: '已下架',
}

/** ADR-025：只剩送餐 */
export const CLAIM_METHOD_LABEL: Record<ClaimMethod, string> = { delivery: '送餐' }

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  claimed: '已派送',
  delivering: '配送中',
  done: '完成',
  cancelled: '取消',
}

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  pending: '審核中',
  approved: '已通過',
  rejected: '未通過',
}

export const VISIT_RESULT_LABEL: Record<VisitResult, string> = {
  seen: '見到本人',
  left_at_door: '放門口（附照片）',
  returned: '未見到，帶回',
}

/** 兩組過敏原的交集（M4：有交集的食物不能派給這位長者） */
export function allergenConflicts(a: readonly Allergen[], b: readonly Allergen[]): Allergen[] {
  return a.filter((x) => b.includes(x))
}

/** 申請的進度（M8）：已派送 claimed → 配送中 delivering → 完成 done；取消 cancelled 沒有進度 */
const STEPS: ClaimStatus[] = ['claimed', 'delivering', 'done']
export function claimProgress(status: ClaimStatus): { step: number; total: number } | null {
  const i = STEPS.indexOf(status)
  return i < 0 ? null : { step: i + 1, total: STEPS.length }
}

/** 剩下的時間，給長輩看得懂的寫法：「還有 2 小時 5 分」「還有 40 秒」 */
export function timeLeftText(ms: number): string {
  if (ms <= 0) return '已到期'
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `還有 ${s} 秒`
  const m = Math.ceil(s / 60)
  if (m < 60) return `還有 ${m} 分`
  const h = Math.floor(m / 60)
  return m % 60 ? `還有 ${h} 小時 ${m % 60} 分` : `還有 ${h} 小時`
}

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），型別從這裡轉出去 */
export type {
  Allergen,
  Claim,
  ClaimMethod,
  ClaimStatus,
  Food,
  FoodCategory,
  FoodStatus,
  Supplier,
  SupplierStatus,
  VisitKind,
  VisitResult,
} from '../data/types'
