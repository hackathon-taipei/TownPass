<script setup lang="ts">
/** @component MR-C12 ToastHost — 提示訊息：底部上移淡入、4 秒後淡出 */
/** 提示訊息（ARCHITECTURE §11.6、ANIMATION §4）：底部上移淡入，4 秒後淡出，最多同時 2 則。呼叫 toast() 顯示。 */
import './motion.css'
import { toasts } from '../logic/toast'
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4" aria-live="polite">
    <TransitionGroup name="fade-up">
      <p
        v-for="t in toasts"
        :key="t.id"
        class="max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-card"
        :class="t.tone === 'error' ? 'bg-warn-200 text-white' : 'bg-grey-900 text-white'"
      >
        {{ t.message }}
      </p>
    </TransitionGroup>
  </div>
</template>
