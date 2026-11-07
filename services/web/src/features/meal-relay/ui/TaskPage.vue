<script setup lang="ts">
/** @component MR-P05 TaskPage — 我的任務：收合式任務卡（一次展開一張）、確認已取餐、取消這份餐（先確認）、回報拜訪；最後一張回報完顯示完成畫面 */
/**
 * 設計 v2 01 右、04 中右（docs/meal-relay/design-v2/README.md §2、§3.3，T-135）：
 * MR-P05 = T01 PageContainer {
 *   清單：h1「我的任務」＋「還有 N 件需要你」、MR-C05 StaleBanner、
 *         MR-C40 TaskCard × 任務（MR-C65 Accordion 群組，第一張展開；TransitionGroup list 離場動畫）、
 *         M05 EmptyState（沒有任務 → 回志工頁報到）、「只顯示派給你的進行中任務」、A07 SourceNote
 *   完成：MR-C60 BrandHeader banner「我的任務」＋MR-C82 TasksDone（回到志工首頁 → volunteer）
 *   MR-C42 VisitReportSheet（回報面板）、MR-C67 ConfirmDialog（取消這份餐，danger）、MR-C12 ToastHost }
 * M13：只有 listMyAssignments（assigned）與 listMyClaims（claimed、delivering）；回報後任務離場、裝置快取清掉（§9）。
 */
import { CircleAlert, ClipboardCheck } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SkeletonBlock, SourceNote } from '@/ui'
import { TASK_SOURCE_TEXT, useMyTasks, volunteerRoute } from '../logic/volunteer'
import './motion.css'
import BrandHeader from './BrandHeader.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import StaleBanner from './StaleBanner.vue'
import TaskCard from './TaskCard.vue'
import TasksDone from './TasksDone.vue'
import ToastHost from './ToastHost.vue'
import VisitReportSheet from './VisitReportSheet.vue'

const {
  now,
  loading,
  loadError,
  staleAt,
  offline,
  tasks,
  busyId,
  pickup,
  cancelOpen,
  askCancel,
  confirmCancel,
  reportedCount,
  allDone,
  reportTask,
  reportOpen,
  form,
  reporting,
  reportError,
  blockReason,
  openReport,
  attachPhoto,
  submitReport,
  reload,
} = useMyTasks()
</script>

<template>
  <PageContainer>
    <Transition name="fade-up" mode="out-in">
      <div v-if="allDone" key="done">
        <div class="-mx-4">
          <BrandHeader title="我的任務" variant="banner" />
        </div>
        <TasksDone :count="reportedCount" :home-to="volunteerRoute" />
      </div>

      <div v-else key="list" class="space-y-4 pt-4">
        <header>
          <h1 class="text-3xl font-extrabold text-grey-900">我的任務</h1>
          <p v-if="tasks.length" class="mt-1 text-lg font-semibold text-grey-700" aria-live="polite">
            還有 <span class="text-3xl font-extrabold text-secondary-500 tabular-nums">{{ tasks.length }}</span> 件需要你
          </p>
        </header>
        <StaleBanner :stale-at="staleAt" :now="now" />

        <SkeletonBlock v-if="loading" :lines="6" />

        <EmptyState v-else-if="loadError" title="讀取失敗" :description="loadError" :icon="CircleAlert">
          <BaseButton variant="outline" @click="reload">再試一次</BaseButton>
        </EmptyState>

        <EmptyState
          v-else-if="!tasks.length"
          title="目前沒有進行中的任務"
          description="到據點掃 QR code 報到後，系統會把要送餐或關懷的長者派給你"
          :icon="ClipboardCheck"
        >
          <BaseButton variant="outline" :to="volunteerRoute">回志工頁報到</BaseButton>
        </EmptyState>

        <TransitionGroup v-else name="list" tag="div" class="space-y-3">
          <TaskCard
            v-for="task in tasks"
            :key="task.id"
            :task="task"
            :now="now"
            :busy="busyId === task.id"
            :offline="offline"
            @pickup="pickup(task)"
            @cancel="askCancel(task)"
            @report="openReport(task)"
          />
        </TransitionGroup>

        <template v-if="!loading && tasks.length">
          <p class="text-center text-sm text-grey-500">只顯示派給你的進行中任務</p>
          <SourceNote :source="TASK_SOURCE_TEXT" />
        </template>
      </div>
    </Transition>

    <VisitReportSheet
      v-model:open="reportOpen"
      v-model:result="form.result"
      :task="reportTask"
      :photo-url="form.photoUrl"
      :uploading="form.uploading"
      :offline="offline"
      :block-reason="blockReason"
      :error="reportError"
      :submitting="reporting || form.uploading"
      @photo="attachPhoto"
      @submit="submitReport"
    />
    <ConfirmDialog
      v-model="cancelOpen"
      title="取消這份餐？"
      message="份數會退回給提供者；任務還在，這次改成只做關懷。"
      confirm-text="取消這份餐"
      cancel-text="先不要"
      danger
      @confirm="confirmCancel"
    />
    <ToastHost />
  </PageContainer>
</template>
