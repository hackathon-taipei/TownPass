<script setup lang="ts">
/** @component MR-C37 PointCreateForm — 新增食物點：名稱、位置（MR-C02）→ createPoint（kind = custom） */
/**
 * 只有審核通過的提供者看得到。地圖上的既有食物點只當參考（LocationPicker markers）。
 * 表單狀態在 useSupplierPage() 的 pointForm。
 */
import { computed } from 'vue'
import { BaseButton, BaseCard, BaseInput } from '@/ui'
import type { Marker } from '../logic/mapMarker'
import { buildPointCreate, type PointForm } from '../logic/supplier'
import LocationPicker from './LocationPicker.vue'
import SubmitButton from './SubmitButton.vue'

const props = defineProps<{ form: PointForm; points: Marker[]; saving?: boolean; offline?: boolean; error?: string }>()
const emit = defineEmits<{ submit: []; cancel: [] }>()

const ready = computed(() => buildPointCreate(props.form).ok)
</script>

<template>
  <BaseCard flat>
    <form class="flex flex-col gap-3" @submit.prevent="emit('submit')">
      <BaseInput v-model="form.name" label="食物點名稱" placeholder="例：店門口取餐處" />
      <LocationPicker v-model="form.location" :markers="points" label="在地圖上點一下食物點的位置" />
      <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
      <SubmitButton :loading="saving" :disabled="!ready || offline">新增並選這個點</SubmitButton>
      <BaseButton variant="ghost" block @click="emit('cancel')">取消</BaseButton>
    </form>
  </BaseCard>
</template>
