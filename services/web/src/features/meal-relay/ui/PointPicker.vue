<script setup lang="ts">
/** @component MR-C36 PointPicker — 食物點清單：選一個食物點上架，或新增食物點（MR-C37） */
/**
 * T-126：提供者只在新增食物點時看到地圖（MR-C37 的 LocationPicker），這裡不放總覽地圖，用清單選點。
 * markers（listPoints 的食物點）只交給 MR-C37 當選位置時的參考定位針。
 * 食物點的名稱與位置來自開放資料（T-115），下方放 SourceNote。
 */
import { BaseButton, BaseChip, ListItem, SourceNote } from '@/ui'
import type { Marker } from '../logic/mapMarker'
import { pointSubtitle, type Point, type PointForm } from '../logic/supplier'
import PointCreateForm from './PointCreateForm.vue'

defineProps<{
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
</script>

<template>
  <div class="flex flex-col gap-3">
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
