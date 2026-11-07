<script setup lang="ts">
/** @component MR-C02 LocationPicker — 在地圖上選位置：包 MR-C07 MapView，不用 Google Maps */
/**
 * 地圖選點：提供者新增食物點、管理員登記長者時用。
 * 本元件只收 props、發 emit，不呼叫 API。定位針與地圖動畫都在 MapView 裡。
 *
 *   v-model: Location | null      // 選取的位置，沒選是 null
 *   markers?: Marker[]            // 參考用的定位針（例如附近的食物點），預設 []
 *   center?: Location             // 指定時地圖移到這裡
 *   label?: string                // 沒選位置時的灰字提示，預設「在地圖上點一下選位置」
 *   disabled?: boolean            // true 時地圖不接受點選，只顯示（不傳 on-pick，也不顯示清除鈕）
 *
 *   <LocationPicker v-model="location" :markers="nearby" />
 */
import { computed } from 'vue'
import MapView from './MapView.vue'
import type { Location, Marker } from '../logic/mapMarker'
import './motion.css'

const model = defineModel<Location | null>({ default: null })

const props = withDefaults(
  defineProps<{
    markers?: Marker[]
    center?: Location
    label?: string
    disabled?: boolean
  }>(),
  {
    markers: () => [],
    center: undefined,
    label: '在地圖上點一下選位置',
    disabled: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: Location | null] }>()

/** 點地圖時寫回 v-model；disabled 時不傳 on-pick，地圖不會回應點擊 */
function onPick(location: Location) {
  emit('update:modelValue', location)
}

const coordText = computed(() => {
  const loc = model.value
  return loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : ''
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <MapView
      :markers="props.markers"
      :center="props.center"
      :on-pick="props.disabled ? undefined : onPick"
      :picked="model"
    />

    <div class="min-h-11 flex items-center justify-between gap-2 px-1">
      <p v-if="model" class="text-sm text-grey-900">
        已選位置：<span class="tabular-nums">{{ coordText }}</span>
      </p>
      <p v-else class="text-sm text-grey-500">{{ props.label }}</p>

      <button
        v-if="model && !props.disabled"
        type="button"
        class="press h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-primary-700 ring-1 ring-grey-200 hover:bg-primary-50"
        @click="model = null"
      >
        清除
      </button>
    </div>
  </div>
</template>
