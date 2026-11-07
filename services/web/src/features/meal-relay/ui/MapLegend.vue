<script setup lang="ts">
/** @component MR-C58 MapLegend — 地圖圖例：定位針的 icon 或頭像＋文字（據點、長者、我），跟著地圖上真的有的定位針 */
/**
 * 圖例項目由 logic/mapMarker.ts 的 legendOf(markers) 組出（T-126：不再列六種顏色的說明）。
 * 小圓點的顏色與定位針相同（primary／warn／grey／據點 grey-700），裡面放同一個白色 icon。
 * 項目有 avatar 就改放小圓形頭像（和地圖上的頭像一樣）：「我」主色細邊、任務卡的據點（品牌企鵝）grey-700 細邊。
 *
 *   <MapLegend :items="legendOf(markers)" />
 */
import type { Component } from 'vue'
import { HeartHandshake, MapPin, User } from 'lucide-vue-next'
import type { LegendItem, MarkerKind, PinColor } from '../logic/mapMarker'

defineProps<{ items: LegendItem[] }>()

const ICON: Partial<Record<MarkerKind, Component>> = { station: HeartHandshake, elder: User }
const RING: Partial<Record<MarkerKind, string>> = { me: 'ring-primary-500', station: 'ring-grey-700' }
const DOT: Record<PinColor, string> = {
  primary: 'bg-primary-500',
  warn: 'bg-warn-200',
  grey: 'bg-grey-400',
  station: 'bg-grey-700',
}
</script>

<template>
  <ul v-if="items.length" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grey-600" aria-label="地圖圖例">
    <li v-for="it in items" :key="it.key" class="flex items-center gap-1.5">
      <img
        v-if="it.avatar"
        :src="it.avatar"
        alt=""
        class="size-5 rounded-full bg-white object-cover ring-2"
        :class="RING[it.kind] ?? 'ring-primary-500'"
      />
      <span v-else class="grid size-5 place-items-center rounded-full text-white" :class="DOT[it.color]">
        <component :is="ICON[it.kind] ?? MapPin" :size="12" :stroke-width="2.25" aria-hidden="true" />
      </span>
      {{ it.label }}
    </li>
  </ul>
</template>
