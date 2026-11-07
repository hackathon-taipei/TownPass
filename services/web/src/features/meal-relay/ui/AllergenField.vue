<script setup lang="ts">
/** @component MR-C90 AllergenField — 上架的過敏原欄位：已選的晶片可按 × 移除，「選擇過敏原」開底部面板（MR-C09）裡的 MR-C01 AllergenChecklist */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 右）。只改 v-model，不呼叫 API。
 *
 *   <AllergenField v-model="form.allergens" />
 */
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import { BaseButton } from '@/ui'
import { ALLERGEN_LABEL } from '../logic/shared'
import { withoutAllergen, type Allergen } from '../logic/supplier'
import AllergenChecklist from './AllergenChecklist.vue'
import BottomSheet from './BottomSheet.vue'

const model = defineModel<Allergen[]>({ required: true })
const open = ref(false)
</script>

<template>
  <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2" role="group" aria-label="過敏原">
    <p class="pt-2 text-sm font-bold text-grey-900" aria-hidden="true">過敏原</p>
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        v-for="a in model"
        :key="a"
        class="inline-flex min-h-9 items-center gap-0.5 rounded-lg bg-primary-600 pl-2 text-xs font-semibold text-white"
        :data-allergen="a"
      >
        {{ ALLERGEN_LABEL[a] }}
        <button
          type="button"
          class="press flex h-9 w-7 items-center justify-center rounded-lg"
          :aria-label="`移除${ALLERGEN_LABEL[a]}`"
          @click="model = withoutAllergen(model, a)"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
      <button
        type="button"
        class="press inline-flex min-h-9 items-center rounded-lg bg-white px-2 text-xs font-semibold text-grey-800 ring-1 ring-grey-400"
        @click="open = true"
      >
        選擇過敏原
      </button>
    </div>
    <p v-if="!model.length" class="col-start-2 text-xs text-grey-500">沒有就不用選；系統不會派給對這些過敏的長者</p>

    <BottomSheet v-model="open" title="選擇過敏原">
      <div class="flex flex-col gap-4">
        <AllergenChecklist v-model="model" hint="系統不會把這批食物派給對這些過敏的長者" />
        <BaseButton block size="lg" @click="open = false">完成</BaseButton>
      </div>
    </BottomSheet>
  </div>
</template>
