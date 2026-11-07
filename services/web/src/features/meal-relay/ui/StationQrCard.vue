<script setup lang="ts">
/** @component MR-C49 StationQrCard — 據點名稱膠囊、掃描說明、報到 QR code 與更新倒數 */
/**
 * MR-P07 的上半部（設計 v2 §3.5 第 2～5 項）：組合 MR-C95 StationNamePill、MR-C45 StationQrCode、MR-C46 QrCountdown。
 * 手機上 QR 寬 240px；平板或電腦寬度（sm 以上）放大並置中，最大 360px。
 * qrText 為 null（斷網、只有舊資料、已過期）時只顯示斷線提示，不顯示倒數。
 *
 *   <StationQrCard :station-name="station.name" :qr-text="qrText" :seconds="secondsLeft" :fraction="fraction" />
 */
import QrCountdown from './QrCountdown.vue'
import StationNamePill from './StationNamePill.vue'
import StationQrCode from './StationQrCode.vue'

defineProps<{ stationName: string; qrText: string | null; seconds: number; fraction: number }>()
</script>

<template>
  <section class="space-y-3">
    <StationNamePill :name="stationName" />
    <p class="text-center text-lg font-medium text-grey-700">請志工掃描下方 QR code 報到</p>
    <div class="mx-auto w-full max-w-60 sm:max-w-90" data-testid="station-qr">
      <StationQrCode :text="qrText" />
    </div>
    <QrCountdown v-if="qrText" class="mx-auto w-full max-w-90" :seconds="seconds" :fraction="fraction" />
  </section>
</template>
