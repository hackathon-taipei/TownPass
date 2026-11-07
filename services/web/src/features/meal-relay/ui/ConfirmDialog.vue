<script setup lang="ts">
/** @component MR-C67 ConfirmDialog — 確認視窗：標題、說明、確認／取消；危險動作的確認鍵是紅色，開啟時焦點在「取消」，Esc 等於取消 */
/**
 * 用在「下架」「取消這份餐」「重置示範資料」「不通過」（docs/meal-relay/design-v2/README.md §1、§2）。
 * `v-model` 是開關；按確認發 `confirm`、按取消、點遮罩或按 Esc 發 `cancel`，兩種都會把 `v-model` 設回 false。
 * 開啟時焦點先到「取消」（不小心按 Enter 不會執行危險動作）；Tab 只在兩顆按鈕間循環；關閉後焦點回到開啟前的元素。
 * 兩顆按鈕高 48px 以上。`danger` 時確認鍵是紅色（warn token）。
 *
 *   <ConfirmDialog v-model="askRemove" title="下架這份食物？" message="下架後志工就看不到了。" confirm-text="下架" danger @confirm="remove" />
 */
import './motion.css'
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const open = defineModel<boolean>({ required: true })
const props = withDefaults(
  defineProps<{ title: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean }>(),
  { message: undefined, confirmText: '確認', cancelText: '取消', danger: false },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const uid = useId()
const cancelBtn = ref<HTMLButtonElement>()
const confirmBtn = ref<HTMLButtonElement>()
let opener: HTMLElement | null = null

function cancel() {
  open.value = false
  emit('cancel')
}
function confirm() {
  open.value = false
  emit('confirm')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
    return
  }
  if (e.key !== 'Tab') return
  // 焦點只在兩顆按鈕之間循環
  const first = cancelBtn.value
  const last = confirmBtn.value
  if (!first || !last) return
  const active = document.activeElement
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  } else if (active !== first && active !== last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  open,
  async (v) => {
    if (v) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      window.addEventListener('keydown', onKey)
      await nextTick()
      cancelBtn.value?.focus()
    } else {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
      opener = null
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="tp-dialog">
      <div v-if="open" class="fixed inset-0 z-[950] flex items-center justify-center bg-grey-900/40 p-4" @click.self="cancel">
        <section
          class="tp-dialog__panel w-full max-w-sm rounded-2xl bg-white p-5 shadow-card"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`${uid}-title`"
          :aria-describedby="props.message ? `${uid}-desc` : undefined"
        >
          <h2 :id="`${uid}-title`" class="text-lg font-bold text-grey-900">{{ title }}</h2>
          <p v-if="message" :id="`${uid}-desc`" class="mt-2 text-sm leading-relaxed text-grey-600">{{ message }}</p>
          <div class="mt-5 flex gap-3">
            <button
              ref="cancelBtn"
              type="button"
              class="press min-h-12 flex-1 rounded-xl bg-white px-3 text-base font-bold text-primary-700 ring-1 ring-primary-600"
              @click="cancel"
            >
              {{ cancelText }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="press min-h-12 flex-1 rounded-xl px-3 text-base font-bold text-white"
              :class="danger ? 'bg-warn-200' : 'bg-primary-600'"
              :data-danger="danger"
              @click="confirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tp-dialog-enter-active,
.tp-dialog-leave-active {
  transition: opacity var(--motion-base, 200ms) var(--ease-out, ease-out);
}
.tp-dialog-enter-active .tp-dialog__panel,
.tp-dialog-leave-active .tp-dialog__panel {
  transition: transform var(--motion-base, 200ms) var(--ease-out, ease-out);
}
.tp-dialog-enter-from,
.tp-dialog-leave-to {
  opacity: 0;
}
.tp-dialog-enter-from .tp-dialog__panel,
.tp-dialog-leave-to .tp-dialog__panel {
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .tp-dialog-enter-active,
  .tp-dialog-leave-active,
  .tp-dialog-enter-active .tp-dialog__panel,
  .tp-dialog-leave-active .tp-dialog__panel {
    transition: none;
  }
}
</style>
