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
  <section class="rounded-2xl bg-linear-to-br from-grey-50/50 to-primary-50 p-4 ring-1 ring-primary-200" aria-label="今天的報到">
    <div class="flex items-center gap-3">
      <span class="flex size-12 shrink-0 items-center justify-center text-primary-700" aria-hidden="true">
        <House class="size-10" :stroke-width="2.5" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-2xl leading-tight font-black break-words text-primary-800">{{ stationName || '報到的據點' }}</p>
        <p v-if="checkedInAt" class="text-lg text-grey-600">今天 {{ checkedInAt }} 報到</p>
      </div>
    </div>
    <hr class="my-3 border-grey-200" />
    <p class="flex items-baseline justify-center gap-3 py-1 text-[clamp(1.625rem,7.5vw,2.25rem)] leading-tight font-black text-primary-800" aria-live="polite">
      <span :key="taskCount" class="bump relative inline-block text-7xl leading-none text-secondary-600 tabular-nums">
        {{ taskCount }}
        <svg class="pointer-events-none absolute -top-1 -right-4 size-6 text-secondary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" aria-hidden="true">
          <path d="m6 10 2-6m3 9 5-5m-2 9 6-2" />
        </svg>
      </span>
      件待完成
    </p>
    <BaseButton class="mt-3 h-14! rounded-xl! bg-linear-to-br from-primary-600 to-primary-700 text-2xl! font-extrabold!" block size="lg" :to="tasksTo">
      查看我的任務
      <ArrowRight class="h-6 w-6" aria-hidden="true" />
    </BaseButton>
  </section>
</template>
