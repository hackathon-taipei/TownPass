<script setup lang="ts">
/** @component MR-C16 AllergenWarning — 過敏原衝突警告：有交集時展開（C3） */
/**
 * 食物與長者的過敏原有交集時，用高度展開＋淡入出現，不搖晃、不閃爍。
 * 合約 M4：食物與長者的過敏原有交集，就不能送給這位長者（派送時已排除；長者之後改了過敏原時用來提醒志工）。
 *
 *   <AllergenWarning :food-allergens="food.allergens" :elder-allergens="elder.allergens"
 *                    :food-name="food.name" :elder-name="elder.alias" v-model:conflict="blocked" />
 *   <SubmitButton :disabled="blocked">取餐</SubmitButton>   // 有衝突時停用，改按取消（cancelClaim）
 */
import './motion.css'
import { computed, watchEffect } from 'vue'
import type { Allergen } from '../logic/mealLabels'
import { ALLERGEN_LABEL, allergenConflicts } from '../logic/mealLabels'

const props = defineProps<{
  foodAllergens: readonly Allergen[]
  elderAllergens: readonly Allergen[]
  foodName: string
  elderName: string
}>()
const conflict = defineModel<boolean>('conflict', { default: false })

const hits = computed(() => allergenConflicts(props.foodAllergens, props.elderAllergens))
const names = computed(() => hits.value.map((a) => `「${ALLERGEN_LABEL[a]}」`).join('、'))
watchEffect(() => (conflict.value = hits.value.length > 0))
</script>

<template>
  <Transition name="expand">
    <div v-if="hits.length" class="expand-box">
      <div>
        <p class="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800" role="alert">
          {{ foodName }}含有{{ names }}，{{ elderName }}對這些過敏，請不要送，改按「取消」退回這份餐。
        </p>
      </div>
    </div>
  </Transition>
</template>
