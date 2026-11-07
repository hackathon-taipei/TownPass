<script setup lang="ts">
/** @component MR-C70 HomeStationSheet — 首頁據點面板：底部面板顯示據點地址，以及只有這個據點的地圖 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §2「附近關懷據點的一列 → 底部面板：地址＋地圖（只有這個據點）」）。
 * MR-C09 BottomSheet ＋ MR-C07 MapView；不呼叫 API，資料用首頁已經讀到的 Station。
 * v-model 綁開關；點遮罩、Esc 或「關閉」都會把它設成 false，捲動位置由 logic/home.ts 的 useStationSheet 還原。
 */
import { computed } from 'vue'
import { BaseButton } from '@/ui'
import { stationAddressText, stationMarkersOf, type Station } from '../logic/home'
import BottomSheet from './BottomSheet.vue'
import MapView from './MapView.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ station: Station | null }>()

const markers = computed(() => (props.station ? stationMarkersOf(props.station) : []))
</script>

<template>
  <BottomSheet v-model="open" :title="station?.name ?? '據點位置'">
    <template v-if="station">
      <p class="text-sm font-semibold text-grey-600">地址</p>
      <p class="mt-0.5 text-base text-grey-900" data-testid="station-address">{{ stationAddressText(station) }}</p>
      <MapView class="mt-3" :markers="markers" :center="station.location" />
      <BaseButton class="mt-4" variant="outline" size="lg" block @click="open = false">關閉</BaseButton>
    </template>
  </BottomSheet>
</template>
