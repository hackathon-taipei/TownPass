<script setup lang="ts">
/** @component MR-C77 TaskChips — 任務卡標題列的晶片：「送餐+關懷」＋狀態「待取餐」／「配送中」，沒有申請只有「純關懷」 */
/**
 * 設計 v2 01 右（design-v2/README.md §3.3）。晶片內容由 logic 的 taskChipsOf() 決定。
 * 任務內容用淺青底，待取餐／配送中的餐點用蜂蜜黃標出。
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
      class="inline-flex h-7 items-center rounded-full px-2 text-[clamp(0.75rem,3.7vw,0.875rem)] font-bold whitespace-nowrap transition-colors"
      :class="chip.kind === 'todo' ? 'bg-primary-100 text-primary-800' : 'bg-secondary-200 text-secondary-900'"
      :data-chip="chip.kind"
    >
      {{ chip.label }}
    </span>
  </span>
</template>
