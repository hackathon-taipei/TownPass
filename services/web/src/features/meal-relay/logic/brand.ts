/**
 * 鄰食蜂 設計 v2 的品牌素材路徑與共用外觀元件（MR-C60～C68）用的小函數。
 * 規格：docs/meal-relay/design-v2/README.md §1；元件說明：docs/meal-relay/ui-kit.md「設計 v2 共用元件」。
 * 素材放在 public/meal-relay/brand/，由 05-logo.webp（白底原圖）去背而來。
 * 這裡不匯入 ui/、不呼叫 API；`useTabQuery` 只用 vue-router。
 */
import { computed, reactive, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export const BRAND_NAME = '鄰食蜂'
export const BRAND_SUBTITLE = '鄰食轉運站'

/** 品牌素材（相對於網站根目錄，檔案在 public/meal-relay/brand/） */
export const BRAND_FILES = {
  /** 完整標誌：企鵝＋蜂蜜罐＋字標＋蜜蜂＋房子（去背） */
  logo: 'meal-relay/brand/logo.webp',
  /** 企鵝頭像：只有企鵝＋蜂蜜罐（去背，方形，給圓形頭像裁切用） */
  mascot: 'meal-relay/brand/mascot.webp',
  /** 字標「鄰食蜂」＋光芒（去背） */
  wordmark: 'meal-relay/brand/wordmark.webp',
} as const

export type BrandAsset = keyof typeof BRAND_FILES

/** 素材網址；base 傳 import.meta.env.BASE_URL（GitHub Pages 在子路徑下） */
export function brandSrc(name: BrandAsset, base = '/'): string {
  return `${base}${BRAND_FILES[name]}`
}

/** 步驟列的狀態：已完成、目前、還沒到 */
export type StepState = 'done' | 'current' | 'todo'

/** 第 index 步（從 0 起算）相對於目前步驟 current 的狀態；current 超出範圍時全部視為已完成或還沒到 */
export function stepStateOf(index: number, current: number): StepState {
  if (index < current) return 'done'
  if (index === current) return 'current'
  return 'todo'
}

/** 把數字限制在 min～max（含）；min 大於 max 時以 min 為準 */
export function clampInt(n: number, min: number, max: number): number {
  const v = Math.trunc(n)
  return Math.max(min, Math.min(Math.max(min, max), v))
}

/**
 * NumberStepper 直接輸入的文字轉整數：只收數字，空字串或沒有數字回 null。
 * 全形數字（１２）也接受，方便注音輸入法。
 */
export function parseIntInput(text: string): number | null {
  const half = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const digits = half.replace(/\D/g, '')
  if (!digits) return null
  return Number(digits)
}

/**
 * 一次只展開一個的收合列群組（Accordion `group`）。
 * 同一個群組名稱裡，記住目前展開的是哪一個 key；null 表示全部收合。
 */
const __openInGroup = reactive<Record<string, string | null>>({})

export function openedInGroup(group: string): string | null {
  return __openInGroup[group] ?? null
}

/** 展開 key；傳 null 全部收合。群組內原本展開的那一個會自動收起 */
export function setOpenInGroup(group: string, key: string | null): void {
  __openInGroup[group] = key
}

/** 只有 key 還是展開的那一個時才收合（元件卸載時用，避免蓋掉別人） */
export function closeInGroupIf(group: string, key: string): void {
  if (__openInGroup[group] === key) __openInGroup[group] = null
}

/**
 * 分段切換與網址 `?tab=` 同步：回傳可寫的 computed，給 `<SegmentedTabs v-model>` 用。
 * 網址沒有或不在 values 裡就用第一個；寫入時用 push，App 的返回鍵（瀏覽器歷史）能退回上一個分頁。
 *
 *   const tab = useTabQuery('tab', ['inventory', 'publish'] as const)
 */
export function useTabQuery<T extends string>(name: string, values: readonly T[]): WritableComputedRef<T> {
  const route = useRoute()
  const router = useRouter()
  const current = (): T => {
    const q = route.query[name]
    const v = Array.isArray(q) ? q[0] : q
    return (values as readonly (string | null | undefined)[]).includes(v) ? (v as T) : values[0]!
  }
  return computed<T>({
    get: current,
    set: (v) => {
      if (v === current() && route.query[name] === v) return
      void router.push({ query: { ...route.query, [name]: v } })
    },
  })
}
