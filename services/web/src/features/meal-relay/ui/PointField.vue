<script setup lang="ts">
/** @component MR-C91 PointField — 上架的食物點欄位：目前選的食物點＋「變更」，開底部面板（MR-C09）裡的 MR-C36 PointPicker（可新增食物點） */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 右「食物點＋變更」）。
 * 面板裡選了一個點，或新增食物點成功（logic 的 addPoint 會自動選它），面板就關起來。
 * 只轉發 PointPicker 的 emit，API 由頁面的 useSupplierPage() 呼叫。
 */
import { ref, watch } from 'vue'
import { MapPin } from 'lucide-vue-next'
import type { Marker } from '../logic/mapMarker'
import type { Point, PointForm } from '../logic/supplier'
import BottomSheet from './BottomSheet.vue'
import PointPicker from './PointPicker.vue'

const props = defineProps<{
  point: Point | null
  points: Point[]
  markers: Marker[]
  sourceText: string
  pointForm: PointForm
  adding: boolean
  saving?: boolean
  offline?: boolean
  error?: string
}>()
const emit = defineEmits<{ select: [id: string]; create: []; 'update:adding': [v: boolean] }>()

const open = ref(false)
// 選好（或新增成功後自動選好）就關閉面板
watch(
  () => props.point?.id,
  (id, before) => {
    if (id && id !== before) open.value = false
  },
)
</script>

<template>
  <div>
    <p class="mb-2 text-sm font-medium text-grey-700">食物點</p>
    <div class="flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-grey-200">
      <MapPin class="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="text-base break-words" :class="point ? 'font-semibold text-grey-900' : 'text-grey-500'">{{ point?.name ?? '還沒選食物點' }}</p>
        <p v-if="point?.address" class="text-xs text-grey-500">{{ point.address }}</p>
      </div>
      <button type="button" class="press min-h-11 shrink-0 rounded-lg px-2 text-base font-semibold text-primary-700" @click="open = true">
        {{ point ? '變更' : '選擇' }}
      </button>
    </div>

    <BottomSheet v-model="open" title="選擇食物點">
      <PointPicker
        :adding="adding"
        :points="points"
        :markers="markers"
        :selected-id="point?.id ?? null"
        :source-text="sourceText"
        :point-form="pointForm"
        :saving="saving"
        :offline="offline"
        :error="error"
        @update:adding="emit('update:adding', $event)"
        @select="emit('select', $event)"
        @create="emit('create')"
      />
    </BottomSheet>
  </div>
</template>
