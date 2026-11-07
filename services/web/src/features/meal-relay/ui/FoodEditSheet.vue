<script setup lang="ts">
/** @component MR-C39 FoodEditSheet — 修改一批食物（份數、最晚食用時間，M14、V21）或確認下架，用 MR-C09 BottomSheet */
/**
 * mode = edit：份數下限是派出中＋已送達（QtyInput min），最晚食用時間不能早於現在；
 *              後端回 QTY_BELOW_USED 時份數框變紅並顯示後端訊息（V21）。
 * mode = close：下架要再確認一次；已派出的份數不受影響。
 * 表單狀態在 useSupplierPage() 的 editForm／editError。
 */
import { computed } from 'vue'
import { BaseButton, BaseInput } from '@/ui'
import { foodQtyText } from '../logic/shared'
import { editQtyMin, expiresError, qtyFloorOf, type EditForm, type Food } from '../logic/supplier'
import BottomSheet from './BottomSheet.vue'
import QtyInput from './QtyInput.vue'
import SubmitButton from './SubmitButton.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  food: Food | null
  mode: 'edit' | 'close'
  form: EditForm
  now: number
  error: { field: 'qty' | 'expires_at' | null; message: string } | null
  saving?: boolean
  offline?: boolean
}>()
const emit = defineEmits<{ save: []; close: [] }>()

const title = computed(() => (props.mode === 'close' ? '確定要下架嗎？' : '修改食物'))
const timeError = computed(() => {
  if (props.error?.field === 'expires_at') return props.error.message
  return props.form.expires_local ? expiresError(props.form.expires_local, props.now) : ''
})
</script>

<template>
  <BottomSheet v-model="open" :title="title">
    <div v-if="food" class="flex flex-col gap-4">
      <p class="text-sm text-grey-700">
        <span class="font-semibold text-grey-900">{{ food.name }}</span>・{{ foodQtyText(food) }}
      </p>

      <form v-if="mode === 'edit'" class="flex flex-col gap-4" @submit.prevent="emit('save')">
        <div>
          <label for="edit-qty" class="mb-1.5 block text-sm font-medium text-grey-700">份數</label>
          <QtyInput id="edit-qty" v-model="form.qty" :min="editQtyMin(food)" :server-error="error?.field === 'qty'" />
          <p v-if="error?.field === 'qty'" class="mt-1 text-sm text-warn-200" role="alert">
            {{ error.message }}（目前派出中＋已送達 {{ qtyFloorOf(food) }} 份）
          </p>
        </div>
        <BaseInput v-model="form.expires_local" type="datetime-local" label="最晚食用時間" :error="timeError" />
        <p v-if="error && error.field === null" class="text-sm text-warn-200" role="alert">{{ error.message }}</p>
        <SubmitButton :loading="saving" :disabled="offline">儲存修改</SubmitButton>
      </form>

      <div v-else class="flex flex-col gap-3">
        <p class="text-sm text-grey-600">下架後剩下的份數不會再被派送；已派出中的 {{ food.dispatched_qty }} 份照常送達。</p>
        <p v-if="error" class="text-sm text-warn-200" role="alert">{{ error.message }}</p>
        <BaseButton variant="danger" block :loading="saving" :disabled="offline" @click="emit('close')">確定下架</BaseButton>
        <BaseButton variant="ghost" block @click="open = false">先不要</BaseButton>
      </div>
    </div>
  </BottomSheet>
</template>
