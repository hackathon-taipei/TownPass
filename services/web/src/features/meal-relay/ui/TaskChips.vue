<script setup lang="ts">
/** @component MR-C77 TaskChips — 任務卡標題列的晶片：「送餐+關懷」＋狀態「待取餐」／「配送中」，沒有申請只有「純關懷」 */
/**
 * 設計 v2 01 右（design-v2/README.md §3.3）。晶片內容由 logic 的 taskChipsOf() 決定。
 * 顏色照 T-126 三色原則（ui-kit.md「狀態顏色」）：任務都是「進行中」→ primary；
 * 要做的事是淺底，狀態是白底主色框，不用黃色表示狀態。
 *
 *   <TaskChips :chips="taskChipsOf(task)" />
 */
import './motion.css'
import type { TaskChip } from '../logic/volunteer'

defineProps<{ chips: TaskChip[] }>()
</script>

<template>
  <span class="flex shrink-0 items-center gap-1.5">
    <span
      v-for="chip in chips"
      :key="chip.kind"
      class="inline-flex h-7 items-center rounded-full px-2.5 text-sm font-bold whitespace-nowrap transition-colors"
      :class="chip.kind === 'todo' ? 'bg-primary-50 text-primary-700' : 'bg-white text-primary-700 ring-1 ring-primary-300'"
      :data-chip="chip.kind"
    >
      {{ chip.label }}
    </span>
  </span>
</template>
