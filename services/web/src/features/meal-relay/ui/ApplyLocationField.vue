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
const coordText = computed(() => (location.value ? `${location.value.lat.toFixed(5)}, ${location.value.lng.toFixed(5)}` : ''))
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-medium text-grey-700">單位位置</p>
    <div v-if="location" class="relative">
      <MapView :markers="[]" :center="location" :picked="location" />
      <span class="pointer-events-none absolute top-2 left-2 z-[500] rounded-md bg-white px-2 py-0.5 text-xs text-grey-600 shadow-card">位置示意</span>
    </div>
    <button
      v-else
      type="button"
      class="press flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl bg-grey-50 text-sm text-grey-500 ring-1 ring-grey-200"
      @click="open = true"
    >
      <MapPin class="h-6 w-6" aria-hidden="true" />還沒選位置
    </button>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="min-w-0 text-sm text-grey-700">
        <template v-if="location">已選位置：<span class="tabular-nums">{{ coordText }}</span></template>
        <template v-else>請在地圖上點一下單位的位置</template>
      </p>
      <BaseButton variant="outline" :icon="MapPin" @click="open = true">在地圖上選位置</BaseButton>
    </div>
    <BaseInput v-if="showAddress" v-model="address" label="地址（選填）" placeholder="例：臺北市萬華區西園路一段 999 號" :error="addressError" />
    <p v-else class="text-sm text-grey-500">個人提供者不用填地址，位置只用在地圖上。</p>

    <BottomSheet v-model="open" title="在地圖上選位置">
      <div class="flex flex-col gap-3">
        <LocationPicker v-model="location" label="在地圖上點一下單位的位置" />
        <BaseButton block size="lg" :disabled="!location" @click="open = false">完成</BaseButton>
      </div>
    </BottomSheet>
  </div>
</template>
