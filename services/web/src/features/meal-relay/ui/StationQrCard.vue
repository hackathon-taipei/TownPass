<script setup lang="ts">
/** @component MR-C49 StationQrCard — 據點名稱、報到 QR code 與更新倒數 */
/**
 * MR-P07 的主卡片：組合 M01 BaseCard、MR-C45 StationQrCode、MR-C46 QrCountdown。
 * qrText 為 null（斷網、只有舊資料、已過期）時只顯示斷線提示，不顯示倒數。
 *
 *   <StationQrCard :station-name="station.name" :qr-text="qrText" :seconds="secondsLeft" :fraction="fraction" />
 */
import { BaseCard } from '@/ui'
import QrCountdown from './QrCountdown.vue'
import StationQrCode from './StationQrCode.vue'

defineProps<{ stationName: string; qrText: string | null; seconds: number; fraction: number }>()
</script>

<template>
  <BaseCard class="space-y-4">
    <div class="text-center">
      <h2 class="text-h1 font-bold text-grey-900">{{ stationName }}</h2>
      <p class="mt-1 text-base text-grey-600">志工請打開台北通「鄰食轉運站」，按「掃描報到」掃這個 QR code</p>
    </div>
    <StationQrCode :text="qrText" />
    <QrCountdown v-if="qrText" :seconds="seconds" :fraction="fraction" />
  </BaseCard>
</template>
