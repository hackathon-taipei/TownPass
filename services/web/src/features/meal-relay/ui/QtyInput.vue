<script setup lang="ts">
/** @component MR-C11 QtyInput — 份數輸入框：只能輸入 1 到 remaining 的整數 */
/**
 * 份數輸入框：提供者上架（createFood）、改份數（updateFood）用。remaining 傳允許的最大份數。
 * 份數必須是正整數（> 0）且不超過 remaining。只接受數字，所以不會出現負數、小數。
 * 錯誤時外框與說明變紅（ANIMATION §5.4，不搖晃）。後端回 QTY_EXCEEDED 時父層把 serverError 設為 true。
 *
 *   <QtyInput v-model="qty" :remaining="99" />   // qty: number | null（null = 空白）
 */
import './motion.css'
import { computed, ref, watch } from 'vue'

const qty = defineModel<number | null>({ required: true })
const props = defineProps<{ remaining: number; serverError?: boolean; id?: string }>()

const text = ref(qty.value === null ? '' : String(qty.value))
const touched = ref(false)
watch(qty, (v) => {
  const s = v === null ? '' : String(v)
  if (s !== text.value) text.value = s
})

const hint = computed(() => {
  if (text.value === '') return '請輸入份數'
  if (Number(text.value) > props.remaining) return `最多 ${props.remaining} 份`
  return ''
})
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
    text.value = '1' // 空白離開時補成最小值 1
    qty.value = 1
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
      maxlength="3"
      autocomplete="off"
      class="field h-11 w-full rounded-lg bg-white px-3 text-grey-900 outline-none"
      :class="invalid ? 'text-warn-200 ring-2 ring-warn-200' : 'ring-1 ring-grey-200'"
      :aria-invalid="invalid"
      :aria-describedby="hintId"
      @input="onInput"
      @blur="onBlur"
    />
    <p :id="hintId" class="mt-1 text-xs transition-colors duration-200" :class="invalid ? 'text-warn-200' : 'text-grey-500'">
      {{ invalid ? hint || '份數超過上限' : `請輸入 1 到 ${remaining} 份` }}
    </p>
  </div>
</template>
