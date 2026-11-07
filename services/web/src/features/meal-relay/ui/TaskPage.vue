<script setup lang="ts">
/** @component MR-P05 TaskPage — 我的任務：只有進行中的任務，取餐、取消、拜訪回報，回報後任務消失 */
/**
 * 合約 v2.2 §9：MR-P05 = T01 PageContainer {
 *   MR-C05 StaleBanner、MR-C40 TaskCard × 任務（MR-C04、MR-C07、MR-C41 { MR-C15、MR-C16 }）、
 *   MR-C42 VisitReportSheet（MR-C09 BottomSheet、MR-C17 VisitResultPicker、MR-C10 SubmitButton）、
 *   A07 SourceNote、MR-C12 ToastHost }
 * M13：只有 listMyAssignments（assigned）與 listMyClaims（claimed、delivering）；回報後任務淡出移除（B5 list）。
 */
import { CircleAlert, ClipboardCheck } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SkeletonBlock, SourceNote } from '@/ui'
import { TASK_SOURCE_TEXT, useMyTasks, volunteerRoute } from '../logic/volunteer'
import './motion.css'
import StaleBanner from './StaleBanner.vue'
import TaskCard from './TaskCard.vue'
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
  cancel,
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
  <PageContainer title="我的任務" back>
    <div class="space-y-4 pt-2">
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

      <TransitionGroup v-else name="list" tag="div" class="space-y-4">
        <TaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :now="now"
          :busy="busyId === task.id"
          :offline="offline"
          @pickup="pickup(task)"
          @cancel="cancel(task)"
          @report="openReport(task)"
        />
      </TransitionGroup>

      <SourceNote v-if="!loading && tasks.length" :source="TASK_SOURCE_TEXT" />
    </div>

    <VisitReportSheet
      v-model:open="reportOpen"
      v-model:result="form.result"
      :task="reportTask"
      :photo-url="form.photoUrl"
      :block-reason="blockReason"
      :error="reportError"
      :submitting="reporting || form.uploading"
      @photo="attachPhoto"
      @submit="submitReport"
    />
    <ToastHost />
  </PageContainer>
</template>
