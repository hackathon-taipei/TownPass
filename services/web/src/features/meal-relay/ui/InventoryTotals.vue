<script setup lang="ts">
/** @component MR-C88 InventoryTotals — 我的庫存的三欄總計：剩餘、派出中、已送達（M1），數字平滑變化 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 中）。數字由 logic/supplier.ts 的 inventoryTotals 算好傳進來：
 * 剩餘只算可派送（open）的批次；派出中、已送達算所有批次（含已結束，已派出的照常送達）。
 */
import './motion.css'
import { useMotionNumber } from '../logic/motion'

const props = defineProps<{ totals: { remaining: number; dispatched: number; delivered: number } }>()

const cols = [
  { label: '剩餘', value: useMotionNumber(() => props.totals.remaining) },
  { label: '派出中', value: useMotionNumber(() => props.totals.dispatched) },
  { label: '已送達', value: useMotionNumber(() => props.totals.delivered) },
]
</script>

<template>
  <dl class="grid grid-cols-3 divide-x divide-grey-300 py-1" aria-label="庫存總計">
    <div v-for="c in cols" :key="c.label" class="flex flex-col items-center gap-1">
      <dt class="text-sm font-semibold text-grey-800">{{ c.label }}</dt>
      <dd class="mr-display text-4xl leading-none font-extrabold text-primary-800 tabular-nums">{{ c.value.value }}</dd>
    </div>
  </dl>
</template>
