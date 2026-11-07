<script setup lang="ts">
/** @component MR-C82 TasksDone — 任務全部完成：大企鵝打勾、「今天的任務都完成了」、「已完成 N 件任務」、長者資料已移除、回到志工首頁 */
/**
 * 設計 v2 04 右（design-v2/README.md §3.3 完成畫面）。頁首 MR-C60 BrandHeader banner「我的任務」由頁面放。
 * N 是這次開啟任務頁後回報成功的件數（useMyTasks 的 reportedCount，T-118「設計 v2」）。
 * 「回到志工首頁」→ volunteer（index.ts）。M13：回報後裝置上的任務與申請已清掉，這裡不顯示任何長者。
 *
 *   <TasksDone :count="reportedCount" :home-to="volunteerRoute" />
 */
import './motion.css'
import type { RouteLocationRaw } from 'vue-router'
import { CircleCheck, Lock } from 'lucide-vue-next'
import { BaseButton } from '@/ui'
import MascotBadge from './MascotBadge.vue'

defineProps<{ count: number; homeTo: RouteLocationRaw }>()
</script>

<template>
  <section class="flex flex-col items-center gap-4 pt-6 text-center" aria-labelledby="mr-tasks-done-title">
    <MascotBadge :size="160" glow done />
    <div>
      <h2 id="mr-tasks-done-title" class="text-2xl font-extrabold text-grey-900">今天的任務都完成了</h2>
      <p class="mt-2 text-base text-grey-700">謝謝你，把餐點與關懷送到。</p>
    </div>
    <p class="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary-50 px-4 py-4 text-xl font-extrabold text-grey-900 ring-1 ring-primary-100">
      <CircleCheck class="h-8 w-8 shrink-0 text-primary-600" aria-hidden="true" />
      <span>已完成 <span class="text-4xl text-secondary-500 tabular-nums" data-done-count>{{ count }}</span> 件任務</span>
    </p>
    <p class="flex items-center gap-2 text-base text-grey-600">
      <Lock class="h-5 w-5 shrink-0" aria-hidden="true" />
      長者資料已從此頁移除
    </p>
    <BaseButton class="w-full rounded-xl" block size="lg" :to="homeTo">回到志工首頁</BaseButton>
  </section>
</template>
