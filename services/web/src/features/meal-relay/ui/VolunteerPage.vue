<script setup lang="ts">
/** @component MR-P04 VolunteerPage — 志工首頁「今天的服務」：問候、報到卡（據點、報到時間、N 件待完成）、掃碼報到、步驟列（沒有長者清單或地圖） */
/**
 * 設計 v2 01 中（docs/meal-relay/design-v2/README.md §3.2，T-135）：
 * MR-P04 = T01 PageContainer {
 *   h1「今天的服務」、MR-C05 StaleBanner、MR-C75 VolunteerGreeting（MR-C62 MascotBadge＋Me.name＋已報到／還沒報到）、
 *   已報到：MR-C44 TodayStatus（據點、今天 HH:MM 報到、N 件待完成、查看我的任務 → volunteer/tasks）、
 *   MR-C43 CheckinPanel（已報到：「重新掃碼報到」＋「重複報到不會重複派送」；還沒報到：「掃描據點 QR 報到」）、
 *   MR-C76 VolunteerSteps（MR-C63 報到 → 取餐 → 回報）、A07 SourceNote（據點來源）、MR-C12 ToastHost }
 * 台北通的標題列與返回鍵是 App 自己的，網頁不畫（README §0）。
 * M13：這一頁不顯示任何長者，只有任務數。
 */
import { CircleAlert, UserRound } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SkeletonBlock, SourceNote } from '@/ui'
import { clockText, tasksRoute, useVolunteerPage } from '../logic/volunteer'
import { mealHomeRoute } from '../logic/shared'
import CheckinPanel from './CheckinPanel.vue'
import StaleBanner from './StaleBanner.vue'
import TodayStatus from './TodayStatus.vue'
import ToastHost from './ToastHost.vue'
import VolunteerGreeting from './VolunteerGreeting.vue'
import VolunteerSteps from './VolunteerSteps.vue'

const {
  now,
  loading,
  loadError,
  staleAt,
  offline,
  isVolunteer,
  name,
  scannable,
  pasted,
  submitting,
  checkinError,
  notice,
  station,
  checkedIn,
  checkedInAt,
  taskCount,
  step,
  scan,
  submitPasted,
  reload,
} = useVolunteerPage()
</script>

<template>
  <PageContainer>
    <div class="space-y-4 pt-4">
      <h1 class="mr-display px-1 text-4xl leading-tight font-black text-primary-800">今天的服務</h1>
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
      >
        <BaseButton variant="outline" :to="mealHomeRoute">回首頁</BaseButton>
      </EmptyState>

      <template v-else>
        <VolunteerGreeting :name="name" :checked-in="checkedIn" />

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

        <CheckinPanel
          v-model:pasted="pasted"
          :checked-in="checkedIn"
          :scannable="scannable"
          :submitting="submitting"
          :disabled="offline"
          :error="checkinError"
          @scan="scan"
          @submit-pasted="submitPasted"
        />

        <VolunteerSteps :current="step" />

        <SourceNote v-if="station" :source="station.source" />
      </template>
    </div>
    <ToastHost />
  </PageContainer>
</template>
