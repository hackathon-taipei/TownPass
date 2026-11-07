<script setup lang="ts">
/** @component MR-C44 TodayStatus — 志工今天的狀態：報到的據點、報到時間、進行中的任務數、前往我的任務 */
/**
 * 合約 §9 MR-P04：只顯示據點與任務「數量」，不列出長者、不畫長者地圖（M13）。
 * 任務數改變時數字徽章放大一次（ui-kit D6 .bump）。
 *
 *   <TodayStatus :station-name="station?.name" :checked-in-at="checkedInAt" :task-count="taskCount" :tasks-to="tasksRoute" />
 */
import './motion.css'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { ClipboardList } from 'lucide-vue-next'
import { BaseButton, BaseCard, InfoTable, type InfoRow } from '@/ui'

const props = defineProps<{
  stationName?: string | null
  /** 「時:分」；沒有（例如重新開啟頁面）時不顯示這一列 */
  checkedInAt?: string | null
  taskCount: number
  tasksTo: RouteLocationRaw
}>()

const rows = computed<InfoRow[]>(() => [
  { label: '報到據點', value: props.stationName || '—' },
  ...(props.checkedInAt ? [{ label: '報到時間', value: props.checkedInAt }] : []),
])
</script>

<template>
  <BaseCard>
    <div class="mb-3 flex items-center gap-2">
      <h2 class="text-lg font-semibold text-grey-900">今天的狀態</h2>
      <span
        :key="taskCount"
        class="bump ml-auto rounded-full bg-primary-500 px-3 py-0.5 text-sm font-semibold tabular-nums text-white"
        aria-live="polite"
      >
        {{ taskCount }} 件任務
      </span>
    </div>
    <InfoTable :rows="rows" />
    <BaseButton class="mt-3" block :icon="ClipboardList" :to="tasksTo" :variant="taskCount ? 'primary' : 'outline'">
      前往我的任務
    </BaseButton>
  </BaseCard>
</template>
