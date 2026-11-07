<script setup lang="ts">
/** @component MR-C38 FoodPublishForm — 上架食物：先拍照（MR-C06，可略過），再填名稱、類別、過敏原（MR-C01）、份數（MR-C11）、最晚食用時間 */
/**
 * 送出時邏輯層先 uploadImage 再 createFood。必填欄位填好前送出鍵停用（D4）；離線時停用（ADR-024）。
 * 表單狀態在 useSupplierPage() 的 foodForm；圖片由父層的 setImage 寫回。
 * T-127 漸進式揭示：第一步只有「拍照」；拍完或按「略過」才展開其他欄位。照片仍是選填（合約 M19 沒有規定必填）。
 * 略過時提示「有照片，志工比較好找」，整個頁面只提示一次（__skipHintShown）。
 */
import './motion.css'
import { computed, ref } from 'vue'
import { BaseButton, BaseChip, BaseInput } from '@/ui'
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

/** 已經有照片或填過名稱（例如切換分頁再回來）就直接展開 */
const revealed = ref(Boolean(props.form.image_preview || props.form.name.trim()))
const skipHint = ref(false)
const hintShown = computed(() => skipHint.value && revealed.value && !props.form.image_preview)

function onImage(payload: { data: string; mime: string }) {
  emit('image', payload)
  revealed.value = true
}

function skip() {
  revealed.value = true
  if (__skipHintShown) return
  __skipHintShown = true
  skipHint.value = true
}
</script>

<script lang="ts">
/** 「略過」的提示整個頁面只出現一次（T-127）：上架後再上架一批就不再提示 */
let __skipHintShown = false
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="emit('submit')">
    <p class="text-sm text-grey-700">
      上架到：<span class="font-semibold text-grey-900">{{ pointName ?? '請先在上方選食物點' }}</span>
    </p>

    <section class="flex flex-col gap-2" aria-label="食物照片">
      <template v-if="!revealed">
        <p class="text-base font-semibold text-grey-900">先拍一張食物照片</p>
        <p class="text-sm text-grey-600">志工到取餐地點時，看照片就知道要拿哪一批，也比較容易看出過敏原。</p>
      </template>
      <p v-else class="text-sm font-medium text-grey-700">食物照片（選填）</p>
      <ImageInput
        :label="revealed ? '拍照或選圖' : '拍照'"
        :preview-url="form.image_preview"
        :disabled="saving"
        @change="onImage"
        @clear="emit('image', null)"
      />
      <BaseButton v-if="!revealed" variant="ghost" block @click="skip">略過，先填資料</BaseButton>
      <Transition name="fade-up">
        <p v-if="hintShown" class="text-sm text-grey-600" role="status">有照片，志工比較好找</p>
      </Transition>
    </section>

    <Transition name="fade-up">
      <div v-if="revealed" class="flex flex-col gap-4">
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

        <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
        <SubmitButton :loading="saving" :disabled="!ready || offline">上架</SubmitButton>
      </div>
    </Transition>
  </form>
</template>
