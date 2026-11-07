<script setup lang="ts">
/** @component MR-P07 StationPage — 據點頁：定時更新的報到 QR code（顯示倒數）、今天報到 */
/**
 * 合約 docs/system/11-meal-relay.md v2.2 §9、M15；斷網 ADR-024。邏輯在 logic/station.ts（useStation）。
 *
 *   MR-P07 = T01 PageContainer {
 *     MR-C21 PageTransition {
 *       錯誤：M05 EmptyState { A01 BaseButton 重試 }
 *       MR-C05 StaleBanner, MR-C49 StationQrCard { M01, MR-C45 StationQrCode, MR-C46 QrCountdown },
 *       MR-C47 CheckinList { M03, MR-C48 CheckinRow × n { MR-C23 VolunteerAvatar } }, A07 SourceNote
 *     }
 *   }
 */
import { onMounted } from 'vue'
import { CircleAlert } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SourceNote } from '@/ui'
import { useStation } from '../logic/station'
import CheckinList from './CheckinList.vue'
import PageTransition from './PageTransition.vue'
import StaleBanner from './StaleBanner.vue'
import StationQrCard from './StationQrCard.vue'

const { now, loading, station, qrText, secondsLeft, fraction, checkins, staleAt, errorMessage, start, retry } = useStation()
onMounted(start)
</script>

<template>
  <PageContainer title="據點報到" back>
    <PageTransition :loading="loading" :page-key="errorMessage ? 'error' : 'station'">
      <EmptyState v-if="errorMessage" title="無法顯示報到 QR code" :description="errorMessage" :icon="CircleAlert">
        <BaseButton @click="retry">重試</BaseButton>
      </EmptyState>
      <div v-else class="space-y-4 pt-2">
        <StaleBanner :stale-at="staleAt" :now="now" />
        <StationQrCard :station-name="station?.name ?? '據點'" :qr-text="qrText" :seconds="secondsLeft" :fraction="fraction" />
        <CheckinList :checkins="checkins" />
        <SourceNote v-if="station" :source="station.source" />
      </div>
    </PageTransition>
  </PageContainer>
</template>
