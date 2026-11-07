<script setup lang="ts">
/** @component MR-C17 VisitResultPicker — 拜訪結果三選一：選「放門口」時拍照鈕展開（C4） */
/**
 * 合約 M11：left_at_door 只限送餐（kind = meal）、不能是生鮮蔬果（produce），而且一定要附照片。
 * 不符合時這個選項不顯示。拍照：按鈕打開相機／相簿，選好後發出 photo 事件（File），
 * 父層呼叫 uploadImage 後把 image_url 傳回 photo-url，縮圖就會淡入。
 *
 *   <VisitResultPicker v-model="result" :kind="kind" :category="claim?.food.category"
 *                      :photo-url="photoUrl" @photo="onPhoto" />
 *   送出條件：result 有值，且 result !== 'left_at_door' 或已有 photoUrl
 */
import './motion.css'
import { computed, ref, watch } from 'vue'
import type { FoodCategory, VisitKind, VisitResult } from '../logic/mealLabels'
import { VISIT_RESULT_LABEL } from '../logic/mealLabels'

const props = defineProps<{ kind: VisitKind; category?: FoodCategory; photoUrl?: string | null; name?: string }>()
const result = defineModel<VisitResult | null>({ required: true })
const emit = defineEmits<{ photo: [file: File] }>()

const canLeave = computed(() => props.kind === 'meal' && props.category !== 'produce')
const options = computed(() =>
  (['seen', 'left_at_door', 'returned'] as VisitResult[]).filter((r) => r !== 'left_at_door' || canLeave.value),
)
// 種類改變後「放門口」不能選了，就清掉
watch(canLeave, (ok) => !ok && result.value === 'left_at_door' && (result.value = null))

const fileInput = ref<HTMLInputElement>()
function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit('photo', file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="text-sm font-semibold text-grey-900">拜訪結果</legend>
    <label v-for="r in options" :key="r" class="flex min-h-11 items-center gap-2 text-base text-grey-800">
      <input v-model="result" type="radio" :name="name ?? 'visit-result'" :value="r" class="size-5 accent-primary-500" />
      {{ VISIT_RESULT_LABEL[r] }}
    </label>
    <Transition name="expand">
      <div v-if="result === 'left_at_door'" class="expand-box">
        <div class="flex items-center gap-3 pt-1">
          <button
            type="button"
            class="press h-11 rounded-full bg-white px-5 text-base font-medium text-primary-700 ring-1 ring-primary-200"
            @click="fileInput?.click()"
          >
            {{ photoUrl ? '重拍' : '拍照' }}
          </button>
          <input ref="fileInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFile" />
          <Transition name="fade-up">
            <img v-if="photoUrl" :src="photoUrl" alt="門口照片" class="h-11 w-14 rounded-md object-cover ring-1 ring-grey-100" />
          </Transition>
          <span v-if="!photoUrl" class="text-sm text-grey-500">放門口一定要拍照</span>
        </div>
      </div>
    </Transition>
  </fieldset>
</template>
