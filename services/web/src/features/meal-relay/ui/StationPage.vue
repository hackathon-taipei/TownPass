<script setup lang="ts">
/** @component MR-P07 StationPage — 據點頁：定時更新的報到 QR code（顯示倒數）、今天報到 */
/**
 * 合約 docs/system/11-meal-relay.md M15；斷網 ADR-024；版面 docs/meal-relay/design-v2/README.md §3.5（04 左圖）。
 * 邏輯在 logic/station.ts（useStation），QR 更新時序見 docs/meal-relay/T-119.md。
 *
 *   MR-P07 = T01 PageContainer（不顯示 T01 標題列）{
 *     MR-C60 BrandHeader banner「據點報到」
 *     MR-C21 PageTransition {
 *       錯誤：M05 EmptyState { A01 BaseButton 重試 }
 *       MR-C05 StaleBanner,
 *       MR-C49 StationQrCard { MR-C95 StationNamePill, 說明, MR-C45 StationQrCode, MR-C46 QrCountdown },
 *       MR-C47 CheckinList { MR-C48 CheckinRow × n { MR-C23 VolunteerAvatar } },
 *       頁尾小字「每次更新後，請掃描最新 QR code」, A07 SourceNote
 *     }
 *   }
 */
import { onMounted } from 'vue'
import { CircleAlert, Info } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SourceNote } from '@/ui'
import { useStation } from '../logic/station'
import BrandHeader from './BrandHeader.vue'
import CheckinList from './CheckinList.vue'
import PageTransition from './PageTransition.vue'
import StaleBanner from './StaleBanner.vue'
import StationQrCard from './StationQrCard.vue'

const { now, loading, station, qrText, secondsLeft, fraction, checkins, staleAt, errorMessage, start, retry } = useStation()
onMounted(start)
</script>

<template>
  <PageContainer>
    <div class="-mx-4 mb-4">
      <BrandHeader title="據點報到" variant="banner" />
    </div>
    <PageTransition :loading="loading" :page-key="errorMessage ? 'error' : 'station'">
      <EmptyState v-if="errorMessage" title="無法顯示報到 QR code" :description="errorMessage" :icon="CircleAlert">
        <BaseButton @click="retry">重試</BaseButton>
      </EmptyState>
      <div v-else class="space-y-4">
        <StaleBanner :stale-at="staleAt" :now="now" />
        <StationQrCard :station-name="station?.name ?? '據點'" :qr-text="qrText" :seconds="secondsLeft" :fraction="fraction" />
        <hr class="border-grey-100" />
        <CheckinList :checkins="checkins" />
        <p class="flex items-center justify-center gap-1.5 text-sm text-grey-500">
          <Info class="h-4 w-4 shrink-0" aria-hidden="true" />
          每次更新後，請掃描最新 QR code
        </p>
        <SourceNote v-if="station" class="text-center" :source="station.source" />
      </div>
    </PageTransition>
  </PageContainer>
</template>
