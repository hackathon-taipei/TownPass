<script setup lang="ts">
/** @component MR-C49 StationQrCard — 據點名稱膠囊、掃描說明、報到 QR code 與更新倒數 */
/**
 * 設計 v2 §3.5 第 2～5 項（04 左）：MR-C95 StationNamePill、說明、MR-C45 StationQrCode、MR-C46 QrCountdown。
 * QR 在手機寬最大 256px、平板或電腦寬（md 以上）最大 360px，置中。
 * qrText 為 null（斷網、只有舊資料、已過期）時只顯示斷線提示，不顯示倒數（T-119）。
 * 設計圖 QR 下方的「示意 QR・不可掃描」只是設計稿的標籤，正式畫面不顯示。
 *
 *   <StationQrCard :station-name="station.name" :qr-text="qrText" :seconds="secondsLeft" :fraction="fraction" />
 */
import QrCountdown from './QrCountdown.vue'
import StationNamePill from './StationNamePill.vue'
import StationQrCode from './StationQrCode.vue'

defineProps<{ stationName: string; qrText: string | null; seconds: number; fraction: number }>()
</script>

<template>
  <section class="space-y-4">
    <StationNamePill :name="stationName" />
    <p class="text-center text-lg font-medium text-grey-700">請志工掃描下方 QR code 報到</p>
    <div class="mx-auto w-full max-w-64 md:max-w-90">
      <StationQrCode :text="qrText" />
    </div>
    <QrCountdown v-if="qrText" :seconds="seconds" :fraction="fraction" />
  </section>
</template>
