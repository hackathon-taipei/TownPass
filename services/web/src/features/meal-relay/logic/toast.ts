/** 提示訊息狀態（ARCHITECTURE §11.6）。畫面在 components/ToastHost.vue。 */
import { ref } from 'vue'

export type Toast = { id: number; message: string; tone: 'info' | 'error' }

export const toasts = ref<Toast[]>([])
let nextId = 1

/** 顯示一則提示，4 秒後消失；最多同時 2 則 */
export function toast(message: string, tone: Toast['tone'] = 'info') {
  const t = { id: nextId++, message, tone }
  toasts.value = [...toasts.value, t].slice(-2)
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), 4000)
}
