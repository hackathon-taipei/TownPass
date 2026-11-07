<script setup lang="ts">
/** @component MR-C46 QrCountdown — QR 更新倒數：「N 秒後更新」與倒數條排成一列 */
/**
 * 設計 v2 §3.5 第 5 項（04 左）：左邊「28 秒後更新」（正式版 30 分鐘時「29:59 後更新」），右邊倒數條。
 * seconds 與 fraction 由 logic/station.ts 的 useStation 算好傳進來。
 *
 *   <QrCountdown :seconds="secondsLeft" :fraction="fraction" />
 */
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { qrCountdownParts } from '../logic/station'

const props = defineProps<{ seconds: number; fraction: number }>()
const parts = computed(() => qrCountdownParts(props.seconds))
const scale = computed(() => Math.min(1, Math.max(0, props.fraction)))
</script>

<template>
  <div class="flex items-center gap-2.5 px-1" role="timer" :aria-label="`QR code ${parts.value} ${parts.unit}`">
    <RefreshCw class="size-5 shrink-0 text-primary-700" aria-hidden="true" />
    <p class="shrink-0 text-base font-medium text-grey-700 md:text-xl">
      <span class="font-bold tabular-nums text-primary-700">{{ parts.value }}</span> {{ parts.unit }}
    </p>
    <div class="ml-2 h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-grey-100" aria-hidden="true">
      <div
        class="h-full origin-left rounded-full bg-primary-500 transition-transform duration-200 ease-linear"
        :style="{ transform: `scaleX(${scale})` }"
      />
    </div>
  </div>
</template>
