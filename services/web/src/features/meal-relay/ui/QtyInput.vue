<script setup lang="ts">
/** @component MR-C11 QtyInput — 份數輸入框：只能輸入 min 到 max 的整數 */
/**
 * 份數輸入框：提供者上架（createFood）、改份數（updateFood）用。合約 v2.2 沒有手動申請（ADR-026）。
 *   min：最小份數，預設 1。改份數時傳 food.dispatched_qty + food.delivered_qty（M14），
 *        低於下限顯示「不能少於已派出＋已送達的 N 份」。
 *   max：最大份數，預設 999。
 * 只接受數字，所以不會出現負數、小數。錯誤時外框與說明變紅（ANIMATION §5.4，不搖晃）。
 * 後端回 QTY_BELOW_USED 或 VALIDATION_ERROR 時，父層把 serverError 設為 true。
 *
 *   <QtyInput v-model="qty" />                                                       // 上架
 *   <QtyInput v-model="qty" :min="food.dispatched_qty + food.delivered_qty" />       // 改份數
 */
import './motion.css'
import { computed, ref, watch } from 'vue'
import { QTY_MAX_DEFAULT, qtyHint, qtyRangeText } from '../logic/foodQty'

const qty = defineModel<number | null>({ required: true })
const props = withDefaults(defineProps<{ min?: number; max?: number; serverError?: boolean; id?: string }>(), {
  min: 1,
  max: QTY_MAX_DEFAULT,
  serverError: false,
  id: undefined,
})

const text = ref(qty.value === null ? '' : String(qty.value))
const touched = ref(false)
watch(qty, (v) => {
  const s = v === null ? '' : String(v)
  if (s !== text.value) text.value = s
})

const hint = computed(() => qtyHint(text.value, props.min, props.max))
const invalid = computed(() => props.serverError || (touched.value && hint.value !== ''))
const hintId = computed(() => `${props.id ?? 'qty'}-hint`)

function onInput(e: Event) {
  touched.value = true
  const input = e.target as HTMLInputElement
  // 小數點後的部分丟掉（5.5 → 5），其餘只留數字（-3 → 3），再去掉開頭的 0
  const digits = input.value.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+/, '')
  input.value = digits
  text.value = digits
  qty.value = digits === '' ? null : Number(digits)
}
function onBlur() {
  touched.value = true
  if (text.value === '') {
    // 空白離開時補成最小值
    text.value = String(props.min)
    qty.value = props.min
  }
}
</script>

<template>
  <div>
    <input
      :id="id"
      :value="text"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      :maxlength="String(max).length"
      autocomplete="off"
      class="field h-11 w-full rounded-lg bg-white px-3 text-grey-900 outline-none"
      :class="invalid ? 'text-warn-200 ring-2 ring-warn-200' : 'ring-1 ring-grey-200'"
      :aria-invalid="invalid"
      :aria-describedby="hintId"
      @input="onInput"
      @blur="onBlur"
    />
    <p :id="hintId" class="mt-1 text-xs transition-colors duration-200" :class="invalid ? 'text-warn-200' : 'text-grey-500'">
      {{ invalid ? hint || '份數不合法' : qtyRangeText(min, max) }}
    </p>
  </div>
</template>
