<script setup lang="ts">
/** @component MR-C93 ApplyLocationField — 申請表的單位位置：小地圖預覽（MR-C07）、地址文字（選填）、「在地圖上選位置」開底部面板（MR-C09）裡的 MR-C02 LocationPicker */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 左「單位位置」）。地址送 SupplierApply.address（合約 v2.5、ADR-030）。
 * 個人提供者（showAddress = false）不顯示地址欄，也不送（避免填自家住址）。
 * 預覽地圖不能點選；選位置一律在面板裡。沒有反查地址（不呼叫外部服務），地址由使用者自己填。
 *
 *   <ApplyLocationField v-model="form.location" v-model:address="form.address" :show-address="form.org_type !== 'person'" />
 */
import { computed, ref } from 'vue'
import { MapPin } from 'lucide-vue-next'
import { BaseButton, BaseInput } from '@/ui'
import type { Location } from '../logic/supplier'
import BottomSheet from './BottomSheet.vue'
import LocationPicker from './LocationPicker.vue'
import MapView from './MapView.vue'

const location = defineModel<Location | null>({ required: true })
const address = defineModel<string>('address', { required: true })
defineProps<{ showAddress: boolean; addressError?: string }>()

const open = ref(false)
const locationText = computed(() => {
  if (!location.value) return '還沒選位置'
  return `${location.value.lat.toFixed(5)}, ${location.value.lng.toFixed(5)}`
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-bold text-grey-900">單位位置</p>
    <div class="relative isolate">
      <MapView class="[&_.tp-map]:h-28" :markers="[]" :center="location ?? undefined" :picked="location" />
      <span class="pointer-events-none absolute top-2 left-2 z-[500] rounded-md bg-white px-2 py-0.5 text-xs text-grey-800 shadow-card">位置示意</span>
    </div>
    <div class="flex items-start justify-between gap-2">
      <BaseInput
        v-if="showAddress"
        v-model="address"
        class="min-w-0 flex-1 [&_label]:sr-only [&_input]:text-sm"
        label="地址（選填）"
        :icon="MapPin"
        :placeholder="location ? locationText : '地址（選填）'"
        :error="addressError"
      />
      <div v-else class="flex min-w-0 items-center gap-1.5 pt-3 text-sm text-grey-700">
        <MapPin class="size-4 shrink-0" aria-hidden="true" />
        <p class="break-words tabular-nums">{{ locationText }}</p>
      </div>
      <BaseButton class="min-h-11 shrink-0" variant="outline" size="sm" :icon="MapPin" @click="open = true">在地圖上選位置</BaseButton>
    </div>
    <p v-if="!showAddress" class="text-sm text-grey-500">個人提供者不用填地址，位置只用在地圖上。</p>

    <BottomSheet v-model="open" title="在地圖上選位置">
      <div class="flex flex-col gap-3">
        <LocationPicker v-model="location" label="在地圖上點一下單位的位置" />
        <BaseButton block size="lg" :disabled="!location" @click="open = false">完成</BaseButton>
      </div>
    </BottomSheet>
  </div>
</template>
