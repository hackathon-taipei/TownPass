/**
 * meal-relay 動態（ANIMATION.md §2、§4、§6）的 JS 部分：
 * - MOTION：與 motion.css 相同的 token（毫秒、曲線）
 * - useMotionNumber：數字平滑變化（減少動態時直接跳到新值）
 * - diffById：輪詢資料比對，找出新增、改變、移除
 */
import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/** 驗收頁用：true 時忽略系統「減少動態」（與 CSS 的 .tp-motion-preview 一致）。正式畫面保持 false。 */
export const motionPreview = ref(false)

export const MOTION = {
  fast: 120,
  base: 200,
  slow: 320,
  emphasis: 600,
  number: 400,
  easeOut: [0, 0, 0.2, 1] as [number, number, number, number],
} as const

/** 數字由舊值平滑變到新值（ANIMATION §4 useMotionNumber） */
export function useMotionNumber(source: MaybeRefOrGetter<number>): Ref<number> {
  // 不依賴 @vueuse/core（repo 沒有這個套件）：用 requestAnimationFrame 做同樣的補間
  const value = ref(toValue(source))
  const ease = cubicBezier(...MOTION.easeOut)
  let frame = 0
  watch(
    () => toValue(source),
    (to) => {
      cancelAnimationFrame(frame)
      const from = value.value
      if (from === to || (reducedMotion.value && !motionPreview.value)) {
        value.value = to
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / MOTION.number)
        value.value = from + (to - from) * ease(t)
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    },
  )
  if (getCurrentScope()) onScopeDispose(() => cancelAnimationFrame(frame))
  return computed(() => Math.round(value.value))
}

/** CSS cubic-bezier(x1, y1, x2, y2) 的 JS 版：給 t（時間 0–1）回傳進度（0–1） */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3
  const slope = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2
  return (t) => {
    if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1
    let s = t
    for (let i = 0; i < 8; i++) {
      const d = slope(x1, x2, s)
      if (Math.abs(d) < 1e-6) break
      s -= (at(x1, x2, s) - t) / d
    }
    return at(y1, y2, Math.min(1, Math.max(0, s)))
  }
}

/** 系統「減少動態」設定（全 App 共用一份，設定改變時自動更新） */
const __mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
export const reducedMotion = ref(__mq?.matches ?? false)
__mq?.addEventListener('change', (e) => (reducedMotion.value = e.matches))

export type Diff<T> = { added: T[]; changed: T[]; removed: T[] }

/**
 * 輪詢差異判斷（ANIMATION §6）。signature 回傳「這筆資料要不要算改變」的字串，
 * 例如 (o) => `${o.status}|${o.remaining}`。沒有變化的項目不出現在結果裡，畫面就不做動畫。
 */
export function diffById<T extends { id: string }>(prev: readonly T[], next: readonly T[], signature: (item: T) => string): Diff<T> {
  const before = new Map(prev.map((x) => [x.id, signature(x)]))
  const after = new Set(next.map((x) => x.id))
  return {
    added: next.filter((x) => !before.has(x.id)),
    changed: next.filter((x) => before.has(x.id) && before.get(x.id) !== signature(x)),
    removed: prev.filter((x) => !after.has(x.id)),
  }
}

/** 讓元素重新播放一次 CSS 動畫 class（例如脈衝環、flash） */
export function replayClass(el: Element | null | undefined, cls: string): void {
  if (!el) return
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth // 強制重排，下一次加 class 才會重新播放
  el.classList.add(cls)
}
