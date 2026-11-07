<script setup lang="ts">
/** @component MR-C10 SubmitButton — 送出按鈕：送出中停用，超過 300ms 才轉圈 */
/**
 * 送出按鈕（ANIMATION §4「按鈕送出中」）：loading 時停用、文字不變；超過 300ms 才顯示行內轉圈，避免一閃而過。
 */
import './motion.css'
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ loading?: boolean; disabled?: boolean }>()
const showSpinner = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.loading,
  (v) => {
    clearTimeout(timer)
    if (v) timer = setTimeout(() => (showSpinner.value = true), 300)
    else showSpinner.value = false
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button
    type="submit"
    class="press flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-200"
    :class="disabled || loading ? 'bg-grey-200 text-grey-500' : 'bg-primary-500 text-white hover:bg-primary-600'"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <svg v-if="showSpinner" class="spinner size-4" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round" />
    </svg>
    <slot />
  </button>
</template>
