<script setup lang="ts">
/** @component MR-C39 FoodEditSheet — 修改一批食物：份數（MR-C68 NumberStepper，下限＝派出中＋已送達，M14、V21）與最晚食用時間，用 MR-C09 BottomSheet */
/**
 * 份數下限是 editQtyMin(food)＝max(1, 派出中＋已送達)：到下限「−」停用，直接輸入更小的數也會收回下限。
 * 最晚食用時間不能早於現在；後端回 QTY_BELOW_USED 時顯示後端訊息與目前已用份數（V21），面板不關。
 * 下架不在這裡：設計 v2 改用 MR-C67 ConfirmDialog（T-136）。
 * 表單狀態在 useSupplierPage() 的 editForm／editError。
 */
import { computed } from 'vue'
import { BaseInput } from '@/ui'
import { qtyRangeText } from '../logic/foodQty'
import { foodQtyText } from '../logic/shared'
import { editQtyMin, expiresError, qtyFloorOf, type EditForm, type Food } from '../logic/supplier'
import BottomSheet from './BottomSheet.vue'
import NumberStepper from './NumberStepper.vue'
import SubmitButton from './SubmitButton.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  food: Food | null
  form: EditForm
  now: number
  error: { field: 'qty' | 'expires_at' | null; message: string } | null
  saving?: boolean
  offline?: boolean
}>()
const emit = defineEmits<{ save: [] }>()

const min = computed(() => (props.food ? editQtyMin(props.food) : 1))
const timeError = computed(() => {
  if (props.error?.field === 'expires_at') return props.error.message
  return props.form.expires_local ? expiresError(props.form.expires_local, props.now) : ''
})
</script>

<template>
  <BottomSheet v-model="open" title="修改食物">
    <div v-if="food" class="flex flex-col gap-4">
      <p class="text-sm text-grey-700">
        <span class="font-semibold text-grey-900">{{ food.name }}</span>・{{ foodQtyText(food) }}
      </p>

      <form class="flex flex-col gap-4" @submit.prevent="emit('save')">
        <fieldset>
          <legend class="mb-1.5 text-sm font-medium text-grey-700">份數</legend>
          <NumberStepper :model-value="form.qty ?? min" :min="min" :max="999" label="份數" @update:model-value="form.qty = $event" />
          <p class="mt-1 text-sm text-grey-500">{{ qtyRangeText(min) }}</p>
          <p v-if="error?.field === 'qty'" class="mt-1 text-sm text-warn-200" role="alert">
            {{ error.message }}（目前派出中＋已送達 {{ qtyFloorOf(food) }} 份）
          </p>
        </fieldset>
        <BaseInput v-model="form.expires_local" type="datetime-local" label="最晚食用時間" :error="timeError" />
        <p v-if="error && error.field === null" class="text-sm text-warn-200" role="alert">{{ error.message }}</p>
        <SubmitButton class="min-h-12 text-lg" :loading="saving" :disabled="offline">儲存修改</SubmitButton>
      </form>
    </div>
  </BottomSheet>
</template>
