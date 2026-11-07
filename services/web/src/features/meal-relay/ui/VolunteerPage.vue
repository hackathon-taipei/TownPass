<script setup lang="ts">
/** @component MR-P04 VolunteerPage — 志工頁：掃描據點 QR 報到、今天的狀態、前往我的任務（沒有長者清單或地圖） */
/**
 * 合約 v2.2 §9：MR-P04 = T01 PageContainer {
 *   MR-C05 StaleBanner、MR-C23 VolunteerAvatar＋名字、
 *   MR-C43 CheckinPanel（qr_code_scan 或貼上 QR 文字 → checkIn）、
 *   MR-C44 TodayStatus（報到據點、任務數 → volunteer/tasks）、A07 SourceNote（據點來源）、MR-C12 ToastHost }
 * M13：這一頁不顯示任何長者，只有任務數。
 */
import { CircleAlert, UserRound } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SkeletonBlock, SourceNote } from '@/ui'
import { clockText, tasksRoute, useVolunteerPage } from '../logic/volunteer'
import CheckinPanel from './CheckinPanel.vue'
import StaleBanner from './StaleBanner.vue'
import TodayStatus from './TodayStatus.vue'
import ToastHost from './ToastHost.vue'
import VolunteerAvatar from './VolunteerAvatar.vue'

const {
  now,
  me,
  loading,
  loadError,
  staleAt,
  offline,
  isVolunteer,
  scannable,
  pasted,
  submitting,
  checkinError,
  notice,
  station,
  checkedIn,
  checkedInAt,
  taskCount,
  scan,
  submitPasted,
  reload,
} = useVolunteerPage()
</script>

<template>
  <PageContainer title="志工" back>
    <div class="space-y-4 pt-2">
      <StaleBanner :stale-at="staleAt" :now="now" />

      <SkeletonBlock v-if="loading" :lines="5" />

      <EmptyState v-else-if="loadError" title="讀取失敗" :description="loadError" :icon="CircleAlert">
        <BaseButton variant="outline" @click="reload">再試一次</BaseButton>
      </EmptyState>

      <EmptyState
        v-else-if="!isVolunteer"
        title="這一頁給志工使用"
        description="志工帳號由據點匯入；需要送餐的長者請洽里長或最近的社區關懷據點"
        :icon="UserRound"
      />

      <template v-else>
        <div v-if="me" class="flex items-center gap-3">
          <VolunteerAvatar :id="me.id" :size="56" />
          <div class="min-w-0">
            <p class="truncate text-lg font-semibold text-grey-900">{{ me.name || '志工' }}</p>
            <p class="text-sm text-grey-500">{{ checkedIn ? '已報到' : '目前沒有進行中的任務' }}</p>
          </div>
        </div>

        <CheckinPanel
          v-model:pasted="pasted"
          :scannable="scannable"
          :submitting="submitting"
          :disabled="offline"
          :error="checkinError"
          @scan="scan"
          @submit-pasted="submitPasted"
        />

        <Transition name="fade-up">
          <p v-if="notice" class="text-base text-grey-800" role="status">{{ notice }}</p>
        </Transition>

        <TodayStatus
          v-if="checkedIn"
          :station-name="station?.name"
          :checked-in-at="clockText(checkedInAt)"
          :task-count="taskCount"
          :tasks-to="tasksRoute"
        />

        <SourceNote v-if="station" :source="station.source" />
      </template>
    </div>
    <ToastHost />
  </PageContainer>
</template>
