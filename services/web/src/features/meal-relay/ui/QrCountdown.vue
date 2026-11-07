<script setup lang="ts">
/** @component MR-C46 QrCountdown — QR 更新倒數：大字秒數與倒數條 */
/**
 * 據點常用平板直放，倒數字要大（MR-P07）。seconds 與 fraction 由 logic/station.ts 的 useStation 算好傳進來。
 *
 *   <QrCountdown :seconds="secondsLeft" :fraction="fraction" />
 */
import { computed } from 'vue'
import { qrCountdownParts } from '../logic/station'

const props = defineProps<{ seconds: number; fraction: number }>()
const parts = computed(() => qrCountdownParts(props.seconds))
const scale = computed(() => Math.min(1, Math.max(0, props.fraction)))
</script>

<template>
  <div class="flex flex-col items-center gap-2" role="timer" :aria-label="`QR code ${parts.value} ${parts.unit}`">
    <p class="flex items-baseline gap-2">
      <span class="text-6xl font-bold tabular-nums text-primary-600">{{ parts.value }}</span>
      <span class="text-xl font-medium text-grey-700">{{ parts.unit }}</span>
    </p>
    <div class="h-2 w-full overflow-hidden rounded-full bg-grey-100" aria-hidden="true">
      <div
        class="h-full origin-left rounded-full bg-primary-500 transition-transform duration-200 ease-linear"
        :style="{ transform: `scaleX(${scale})` }"
      />
    </div>
  </div>
</template>
