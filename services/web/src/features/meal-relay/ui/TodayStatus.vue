<script setup lang="ts">
/** @component MR-C44 TodayStatus — 志工首頁的報到卡：據點名稱、「今天 HH:MM 報到」、「N 件待完成」、查看我的任務 */
/**
 * 設計 v2 01 中（design-v2/README.md §3.2）：房子圖示、據點名稱、報到時間、分隔線、大數字「N 件待完成」、主按鈕「查看我的任務 →」。
 * 只顯示據點與任務「數量」，不列出長者、不畫長者地圖（M13）。任務數改變時數字放大一次（ui-kit D6 .bump）。
 *
 *   <TodayStatus :station-name="station?.name" :checked-in-at="clockText(checkedInAt)" :task-count="taskCount" :tasks-to="tasksRoute" />
 */
import './motion.css'
import type { RouteLocationRaw } from 'vue-router'
import { ArrowRight, House } from 'lucide-vue-next'
import { BaseButton } from '@/ui'

defineProps<{
  stationName?: string | null
  /** 「時:分」；沒有時不顯示這一行 */
  checkedInAt?: string | null
  taskCount: number
  tasksTo: RouteLocationRaw
}>()
</script>

<template>
  <section class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-grey-100" aria-label="今天的報到">
    <div class="flex items-center gap-3">
      <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600" aria-hidden="true">
        <House class="h-7 w-7" :stroke-width="2.25" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-lg font-extrabold break-words text-grey-900">{{ stationName || '報到的據點' }}</p>
        <p v-if="checkedInAt" class="text-base text-grey-600">今天 {{ checkedInAt }} 報到</p>
      </div>
    </div>
    <hr class="my-4 border-grey-100" />
    <p class="text-center text-2xl font-extrabold text-grey-900" aria-live="polite">
      <span :key="taskCount" class="bump mr-1 inline-block text-5xl text-secondary-500 tabular-nums">{{ taskCount }}</span>
      件待完成
    </p>
    <BaseButton class="mt-4 rounded-xl" block size="lg" :to="tasksTo">
      查看我的任務
      <ArrowRight class="h-6 w-6" aria-hidden="true" />
    </BaseButton>
  </section>
</template>
