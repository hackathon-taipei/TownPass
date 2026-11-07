<script setup lang="ts">
/** @component MR-C78 TaskAddress — 任務卡的送達地點：定位圖示、「送達地點」、長者地址、「複製地址」 */
/**
 * 設計 v2 01 右（design-v2/README.md §3.3）；地址與複製沿用 T-125：地址只能是模擬資料（ADR-027），
 * 只有被派到的志工在自己的任務上看得到（M13）。剪貼簿不能用時改成選取地址文字，讓志工長按複製。
 *
 *   <TaskAddress :address="addressLine(elder)" />
 */
import './motion.css'
import { ref } from 'vue'
import { Copy, MapPin } from 'lucide-vue-next'
import { copyAddress } from '../logic/volunteer'

const props = defineProps<{ address: string }>()
const addressEl = ref<HTMLElement | null>(null)

async function onCopy() {
  if (await copyAddress(props.address)) return
  const el = addressEl.value
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  if (!el || !selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <MapPin class="h-6 w-6 shrink-0 text-primary-700" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-base font-bold text-grey-900">送達地點</p>
      <p ref="addressEl" class="text-sm break-words text-grey-700 select-text">{{ address }}</p>
    </div>
    <button
      type="button"
      class="press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-primary-700 ring-1 ring-primary-500"
      :aria-label="`複製地址：${address}`"
      @click="onCopy"
    >
      <Copy class="h-4 w-4" aria-hidden="true" />
      複製地址
    </button>
  </div>
</template>
