<script setup lang="ts">
/** @component MR-C38 FoodPublishForm — 上架食物：名稱、類別、過敏原（MR-C01）、份數（MR-C11）、最晚食用時間、圖片（MR-C06） */
/**
 * 送出時邏輯層先 uploadImage 再 createFood。必填欄位填好前送出鍵停用（D4）；離線時停用（ADR-024）。
 * 表單狀態在 useSupplierPage() 的 foodForm；圖片由父層的 setImage 寫回。
 */
import { computed } from 'vue'
import { BaseChip, BaseInput } from '@/ui'
import { FOOD_CATEGORY_LABEL } from '../logic/shared'
import { buildFoodCreate, expiresError, type FoodCategory, type FoodForm } from '../logic/supplier'
import AllergenChecklist from './AllergenChecklist.vue'
import ImageInput from './ImageInput.vue'
import QtyInput from './QtyInput.vue'
import SubmitButton from './SubmitButton.vue'

const props = defineProps<{ form: FoodForm; now: number; pointName?: string; saving?: boolean; offline?: boolean; error?: string }>()
const emit = defineEmits<{ submit: []; image: [payload: { data: string; mime: string } | null] }>()

const CATEGORIES = Object.keys(FOOD_CATEGORY_LABEL) as FoodCategory[]
const ready = computed(() => buildFoodCreate(props.form, props.now).ok)
const timeError = computed(() => (props.form.expires_local ? expiresError(props.form.expires_local, props.now) : ''))
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="emit('submit')">
    <p class="text-sm text-grey-700">
      上架到：<span class="font-semibold text-grey-900">{{ pointName ?? '請先在上方選食物點' }}</span>
    </p>

    <BaseInput v-model="form.name" label="食物名稱" placeholder="例：雞腿便當" />

    <fieldset>
      <legend class="mb-2 text-sm font-medium text-grey-700">類別</legend>
      <div class="flex flex-wrap gap-2">
        <BaseChip v-for="c in CATEGORIES" :key="c" :active="form.category === c" @click="form.category = c">
          {{ FOOD_CATEGORY_LABEL[c] }}
        </BaseChip>
      </div>
    </fieldset>

    <AllergenChecklist v-model="form.allergens" hint="沒有就不用選；系統不會派給對這些過敏的長者" />

    <div>
      <label for="publish-qty" class="mb-1.5 block text-sm font-medium text-grey-700">份數</label>
      <QtyInput id="publish-qty" v-model="form.qty" />
    </div>

    <BaseInput v-model="form.expires_local" type="datetime-local" label="最晚食用時間" :error="timeError" />

    <div>
      <p class="mb-1.5 text-sm font-medium text-grey-700">圖片（選填）</p>
      <ImageInput :preview-url="form.image_preview" :disabled="saving" @change="emit('image', $event)" @clear="emit('image', null)" />
    </div>

    <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
    <SubmitButton :loading="saving" :disabled="!ready || offline">上架</SubmitButton>
  </form>
</template>
