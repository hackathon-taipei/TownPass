<script setup lang="ts">
/** @component MR-P07 StationPage — 據點頁：鄰食蜂頁首、據點名稱、定時更新的報到 QR code 與倒數、今天報到 */
/**
 * 版面依設計 v2 §3.5（docs/meal-relay/design-v2/README.md、04 左）；QR 更新與斷網行為沿用 T-119：
 * 合約 docs/system/11-meal-relay.md §9、M15；斷網 ADR-024。邏輯在 logic/station.ts（useStation）。
 *
 *   MR-P07 = T01 PageContainer（不給 title／back：App 自己有標題列與返回鍵；md 以上放寬到 max-w-xl）{
 *     MR-C60 BrandHeader banner「據點報到」（滿版）
 *     白色圓角內容區 { MR-C21 PageTransition {
 *       錯誤：M05 EmptyState { 後端訊息, A01 BaseButton 重試 }
 *       MR-C05 StaleBanner,
 *       MR-C49 StationQrCard { MR-C95 StationNamePill, 說明, MR-C45 StationQrCode, MR-C46 QrCountdown },
 *       MR-C47 CheckinList { 「今天報到・N 位」, MR-C48 CheckinRow × n { MR-C23 VolunteerAvatar } },
 *       頁尾「每次更新後，請掃描最新 QR code」, A07 SourceNote
 *     } }
 *   }
 */
import { onMounted } from 'vue'
import { CircleAlert, Info } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SourceNote } from '@/ui'
import { useStation } from '../logic/station'
import { mealHomeRoute } from '../logic/shared'
import BrandHeader from './BrandHeader.vue'
import CheckinList from './CheckinList.vue'
import PageTransition from './PageTransition.vue'
import StaleBanner from './StaleBanner.vue'
import StationQrCard from './StationQrCard.vue'

const { now, loading, isStation, station, qrText, secondsLeft, fraction, checkins, staleAt, errorMessage, start, retry } = useStation()
onMounted(start)
</script>

<template>
  <PageContainer class="md:max-w-xl">
    <div class="-mx-4">
      <BrandHeader title="據點報到" variant="banner" />
    </div>
    <div class="relative -mx-4 -mt-2 rounded-t-3xl bg-white px-5 pt-4">
      <PageTransition :loading="loading" :page-key="errorMessage ? 'error' : 'station'">
        <EmptyState v-if="errorMessage" title="無法顯示報到 QR code" :description="errorMessage" :icon="CircleAlert">
          <BaseButton @click="retry">重試</BaseButton>
        </EmptyState>
        <EmptyState v-else-if="isStation === false" title="這一頁給據點使用" description="請從首頁進入適合你身分的服務。" :icon="CircleAlert">
          <BaseButton variant="outline" :to="mealHomeRoute">回首頁</BaseButton>
        </EmptyState>
        <div v-else class="space-y-3.5">
          <StaleBanner :stale-at="staleAt" :now="now" />
          <StationQrCard :station-name="station?.name ?? '據點'" :qr-text="qrText" :seconds="secondsLeft" :fraction="fraction" />
          <CheckinList :checkins="checkins" />
          <footer class="space-y-1 text-center">
            <p class="flex items-center justify-center gap-2 text-sm text-grey-700">
              <Info class="size-4 shrink-0" aria-hidden="true" />每次更新後，請掃描最新 QR code
            </p>
            <SourceNote v-if="station" :source="station.source" />
          </footer>
        </div>
      </PageTransition>
    </div>
  </PageContainer>
</template>
