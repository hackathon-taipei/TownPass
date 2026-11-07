<script setup lang="ts">
/** @component MR-C36 PointPicker — 食物點地圖（MR-C07）與清單：選一個食物點上架，或新增食物點（MR-C37） */
/**
 * 地圖只顯示食物點（listPoints），黃色＝有可派送的食物；MapView 不能點定位針，所以用下方清單選點。
 * 食物點的名稱與位置來自開放資料（T-115），下方放 SourceNote。
 */
import { computed } from 'vue'
import { BaseButton, BaseChip, ListItem, SourceNote } from '@/ui'
import type { Marker } from '../logic/mapMarker'
import { pointSubtitle, type Point, type PointForm } from '../logic/supplier'
import MapView from './MapView.vue'
import PointCreateForm from './PointCreateForm.vue'

const props = defineProps<{
  points: Point[]
  markers: Marker[]
  selectedId: string | null
  sourceText: string
  pointForm: PointForm
  adding: boolean
  saving?: boolean
  offline?: boolean
  error?: string
}>()
const emit = defineEmits<{ select: [id: string]; 'update:adding': [v: boolean]; create: [] }>()

const center = computed(() => props.points.find((p) => p.id === props.selectedId)?.location)
</script>

<template>
  <div class="flex flex-col gap-3">
    <MapView :markers="markers" :center="center" />
    <ul class="divide-y divide-grey-100" aria-label="食物點">
      <li v-for="p in points" :key="p.id">
        <ListItem :title="p.name" :subtitle="pointSubtitle(p)">
          <template #trailing>
            <BaseChip :active="p.id === selectedId" @click="emit('select', p.id)">
              {{ p.id === selectedId ? '已選' : '選這裡' }}
            </BaseChip>
          </template>
        </ListItem>
      </li>
    </ul>
    <SourceNote :source="sourceText" />

    <PointCreateForm
      v-if="adding"
      :form="pointForm"
      :points="markers"
      :saving="saving"
      :offline="offline"
      :error="error"
      @submit="emit('create')"
      @cancel="emit('update:adding', false)"
    />
    <BaseButton v-else variant="outline" block @click="emit('update:adding', true)">新增食物點</BaseButton>
  </div>
</template>
