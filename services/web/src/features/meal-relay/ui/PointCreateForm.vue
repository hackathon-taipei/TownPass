<script setup lang="ts">
/** @component MR-C37 PointCreateForm — 新增食物點：名稱、位置（MR-C02）、入口照片（MR-C06，選填）→ createPoint（kind = custom） */
/**
 * 只有審核通過的提供者看得到。地圖上的既有食物點只當參考（LocationPicker markers）。
 * 表單狀態在 useSupplierPage() 的 pointForm。
 * 入口照片選填（ADR-028）：只拍入口或建築外觀，不能有人臉、車牌、門牌；送出時邏輯層先 uploadImage 再 createPoint。
 */
import { computed } from 'vue'
import { BaseButton, BaseCard, BaseInput } from '@/ui'
import type { Marker } from '../logic/mapMarker'
import { ENTRANCE_PHOTO_RULE } from '../logic/placePhoto'
import { buildPointCreate, setFormImage, type PointForm } from '../logic/supplier'
import ImageInput from './ImageInput.vue'
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
      <div>
        <p class="mb-1.5 text-sm font-medium text-grey-700">入口照片（選填）</p>
        <p class="mb-2 text-sm text-grey-500">讓志工到現場對照就找得到。{{ ENTRANCE_PHOTO_RULE }}。</p>
        <ImageInput
          label="拍入口照片"
          :preview-url="form.image_preview"
          :disabled="saving"
          @change="setFormImage(form, $event)"
          @clear="setFormImage(form, null)"
        />
      </div>
      <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
      <SubmitButton :loading="saving" :disabled="!ready || offline">新增並選這個點</SubmitButton>
      <BaseButton variant="ghost" block @click="emit('cancel')">取消</BaseButton>
    </form>
  </BaseCard>
</template>
