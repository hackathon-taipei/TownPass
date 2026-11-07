<script setup lang="ts">
/** @component MR-C38 FoodPublishForm — 上架食物：步驟列（MR-C63）、先拍照（MR-C06，可略過），再填名稱、類別（MR-C89）、份數（MR-C68）、最晚食用時間、過敏原（MR-C90）、食物點（#point 插槽） */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 右）：
 *   MR-C63 StepIndicator 拍照 → 填寫資訊 → 上架（publishStepOf）、MR-C06 ImageInput、A04 食物名稱、MR-C89 CategoryPicker、
 *   MR-C68 NumberStepper 份數 1～999、A04 datetime-local 最晚食用時間、MR-C90 AllergenField、#point（頁面放 MR-C91 PointField）、
 *   MR-C64 InfoNote「上架後仍可修改份數與時間」、MR-C10「確認上架」。
 * 送出時邏輯層先 uploadImage 再 createFood。必填欄位填好前送出鍵停用（D4）；離線時停用（ADR-024）。
 * 表單狀態在 useSupplierPage() 的 foodForm；圖片由父層的 setImage 寫回。
 * T-127 漸進式揭示：第一步只有「拍照」；拍完或按「略過」才展開其他欄位。照片仍是選填（合約 M19 沒有規定必填）。
 * 略過時提示「有照片，志工比較好找」，整個頁面只提示一次（__skipHintShown）。
 */
import './motion.css'
import { computed, ref } from 'vue'
import { BaseButton, BaseInput } from '@/ui'
import { PUBLISH_STEPS, expiresError, publishStepOf, type FoodForm } from '../logic/supplier'
import AllergenField from './AllergenField.vue'
import CategoryPicker from './CategoryPicker.vue'
import ImageInput from './ImageInput.vue'
import InfoNote from './InfoNote.vue'
import NumberStepper from './NumberStepper.vue'
import StepIndicator from './StepIndicator.vue'
import SubmitButton from './SubmitButton.vue'

const props = defineProps<{ form: FoodForm; now: number; saving?: boolean; offline?: boolean; error?: string }>()
const emit = defineEmits<{ submit: []; image: [payload: { data: string; mime: string } | null] }>()

const timeError = computed(() => (props.form.expires_local ? expiresError(props.form.expires_local, props.now) : ''))

/** 已經有照片或填過名稱（例如切換分頁再回來）就直接展開 */
const revealed = ref(Boolean(props.form.image_preview || props.form.name.trim()))
const skipHint = ref(false)
const hintShown = computed(() => skipHint.value && revealed.value && !props.form.image_preview)
const step = computed(() => publishStepOf(props.form, props.now, revealed.value))

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
  <form class="flex flex-col gap-4" aria-label="上架食物" @submit.prevent="emit('submit')">
    <StepIndicator :steps="[...PUBLISH_STEPS]" :current="step" />

    <section class="flex flex-col gap-2" aria-label="食物照片">
      <template v-if="!revealed">
        <p class="text-base font-semibold text-grey-900">先拍一張食物照片</p>
        <p class="text-sm text-grey-600">志工到取餐地點時，看照片就知道要拿哪一批，也比較容易看出過敏原。</p>
      </template>
      <ImageInput
        :label="revealed ? '拍照或選圖' : '拍照'"
        :preview-url="form.image_preview"
        :disabled="saving"
        @change="onImage"
        @clear="emit('image', null)"
      />
      <p class="text-xs text-grey-500">照片選填，方便志工辨認</p>
      <BaseButton v-if="!revealed" variant="ghost" block @click="skip">略過，先填資料</BaseButton>
      <Transition name="fade-up">
        <p v-if="hintShown" class="text-sm text-grey-600" role="status">有照片，志工比較好找</p>
      </Transition>
    </section>

    <Transition name="fade-up">
      <div v-if="revealed" class="flex flex-col gap-4">
        <BaseInput v-model="form.name" label="食物名稱" placeholder="例：雞腿便當" />
        <CategoryPicker v-model="form.category" />
        <fieldset>
          <legend class="mb-1.5 text-sm font-medium text-grey-700">份數</legend>
          <NumberStepper :model-value="form.qty ?? 1" :min="1" :max="999" label="份數" @update:model-value="form.qty = $event" />
        </fieldset>
        <BaseInput v-model="form.expires_local" type="datetime-local" label="最晚食用時間" :error="timeError" />
        <AllergenField v-model="form.allergens" />
        <slot name="point" />
        <InfoNote text="上架後仍可修改份數與時間" />
        <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error }}</p>
        <SubmitButton class="min-h-12 text-lg" :loading="saving" :disabled="step < 2 || offline">確認上架</SubmitButton>
      </div>
    </Transition>
  </form>
</template>
