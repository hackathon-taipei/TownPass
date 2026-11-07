<script setup lang="ts">
/** @component MR-C46 QrCountdown — QR 更新倒數：更新圖示、「N 秒後更新」與進度條 */
/**
 * 設計 v2 §3.5 第 5 項：左邊更新圖示＋「28 秒後更新」，右邊進度條（剩下的比例）。
 * seconds 與 fraction 由 logic/station.ts 的 useStation 算好傳進來；文字由 qrCountdownParts 組出
 * （60 秒內「28 秒後更新」，正式版 30 分鐘「29:59 後更新」）。
 *
 *   <QrCountdown :seconds="secondsLeft" :fraction="fraction" />
 */
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { qrCountdownParts } from '../logic/station'

const props = defineProps<{ seconds: number; fraction: number }>()
const parts = computed(() => qrCountdownParts(props.seconds))
const scale = computed(() => Math.min(1, Math.max(0, props.fraction)))
const text = computed(() => `${parts.value.value} ${parts.value.unit}`)
</script>

<template>
  <div class="flex items-center gap-3" role="timer" :aria-label="`QR code ${text}`">
    <RefreshCw class="h-5 w-5 shrink-0 text-primary-600" :stroke-width="2.25" aria-hidden="true" />
    <p class="shrink-0 text-lg text-grey-700">
      <span class="font-bold tabular-nums text-primary-700">{{ parts.value }}</span> {{ parts.unit }}
    </p>
    <div
      class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-grey-100"
      role="progressbar"
      aria-label="距離下次更新"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(scale * 100)"
    >
      <div
        class="h-full origin-left rounded-full bg-primary-600 transition-transform duration-200 ease-linear"
        :style="{ transform: `scaleX(${scale})` }"
      />
    </div>
  </div>
</template>
