<script setup lang="ts">
/** @component MR-C68 NumberStepper — −／數字／+：有上下限，到限制時按鈕停用，中間的數字可以直接輸入 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）03 右上架食物的「份數」、修改份數。
 * 與 MR-C11 QtyInput 不同：QtyInput 是單純輸入框＋錯誤提示；這個有 −／+ 按鈕，給年長使用者用點的。
 * 按鈕 48px 見方。直接輸入時只收數字（全形也行）；輸入中不會改值，離開欄位或按 Enter 才收進 `min`～`max`；
 * 輸入的是空的就還原。`min` 預設 1、`max` 預設 999。
 *
 *   <NumberStepper v-model="qty" :min="1" :max="99" label="份數" />
 */
import { computed, ref, watch } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'
import { clampInt, parseIntInput } from '../logic/brand'

const model = defineModel<number>({ required: true })
const props = withDefaults(defineProps<{ min?: number; max?: number; label?: string; step?: number }>(), {
  min: 1,
  max: 999,
  label: '數量',
  step: 1,
})

const text = ref(String(model.value))
watch(model, (v) => (text.value = String(v)))

const atMin = computed(() => model.value <= props.min)
const atMax = computed(() => model.value >= props.max)

function set(n: number) {
  const v = clampInt(n, props.min, props.max)
  model.value = v
  text.value = String(v)
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const n = parseIntInput(el.value)
  text.value = n === null ? '' : String(n)
  el.value = text.value
  // 輸入中，剛好落在範圍內就先收進去，讓送出鈕即時反映；超出範圍等離開欄位再收
  if (n !== null && n >= props.min && n <= props.max) model.value = n
}

function commit() {
  const n = parseIntInput(text.value)
  if (n === null) text.value = String(model.value)
  else set(n)
}
</script>

<template>
  <div class="inline-flex items-stretch overflow-hidden rounded-xl bg-white ring-1 ring-grey-200" role="group" :aria-label="label">
    <button
      type="button"
      class="press flex h-12 w-12 shrink-0 items-center justify-center text-primary-700 disabled:text-grey-300"
      :disabled="atMin"
      :aria-label="`減少${label}`"
      @click="set(model - step)"
    >
      <Minus class="h-5 w-5" :stroke-width="2.5" aria-hidden="true" />
    </button>
    <input
      class="h-12 w-16 min-w-0 border-x border-grey-200 bg-white text-center text-lg font-bold text-grey-900 tabular-nums outline-none focus:bg-primary-50"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="text"
      :aria-label="label"
      @input="onInput"
      @change="commit"
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <button
      type="button"
      class="press flex h-12 w-12 shrink-0 items-center justify-center text-primary-700 disabled:text-grey-300"
      :disabled="atMax"
      :aria-label="`增加${label}`"
      @click="set(model + step)"
    >
      <Plus class="h-5 w-5" :stroke-width="2.5" aria-hidden="true" />
    </button>
  </div>
</template>
