<script setup lang="ts">
/** @component MR-C45 StationQrCode — 據點的報到 QR code：斷網時改顯示「連線中斷，QR 無法更新」 */
/**
 * 用已安裝的 qrcode（MIT，logic/station.ts 的 qrSvg）把 qr_text 畫成 SVG。
 * 換新的 QR 時只換 path，同一個 <svg> 直接重畫，不會閃白（M15）。
 * text 為 null（斷網、只有舊資料、已過期）時不畫 QR，改顯示提示（ADR-024）。
 *
 *   <StationQrCode :text="qrText" />
 */
import './motion.css'
import { computed } from 'vue'
import { QR_OFFLINE_TEXT, QR_RETRYING_TEXT, qrSvg } from '../logic/station'

const props = defineProps<{ text: string | null }>()
const svg = computed(() => (props.text ? qrSvg(props.text) : null))
</script>

<template>
  <div class="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
    <svg
      v-if="svg"
      class="size-full text-grey-950"
      :viewBox="svg.viewBox"
      shape-rendering="crispEdges"
      role="img"
      aria-label="報到 QR code，請志工用台北通掃描"
    >
      <path :d="svg.path" fill="currentColor" />
    </svg>
    <Transition name="fade-up">
      <div v-if="!svg" role="status" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-grey-50 px-6 text-center">
        <p class="text-xl font-semibold text-grey-800">{{ QR_OFFLINE_TEXT }}</p>
        <p class="text-base text-grey-500">{{ QR_RETRYING_TEXT }}</p>
      </div>
    </Transition>
  </div>
</template>
