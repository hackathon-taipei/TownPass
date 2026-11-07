<script setup lang="ts">
/** @component MR-C89 CategoryPicker — 食物類別晶片：便當、麵包、蔬果、其他；「其他」展開成乾貨、飲料、其他（合約 §4 FoodCategory） */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.4，03 右）。選項與值在 logic/supplier.ts 的 CATEGORY_MAIN、CATEGORY_MORE。
 * 主列使用設計稿的短名稱；展開的其他選項沿用 MR-C56 CategoryIcon（T-130）。
 * 已選的是「其他」裡的類別時，「其他」一開始就展開。
 *
 *   <CategoryPicker v-model="form.category" />
 */
import './motion.css'
import { ref } from 'vue'
import { BaseChip } from '@/ui'
import { CATEGORY_MAIN, CATEGORY_MORE, isMoreCategory, type FoodCategory } from '../logic/supplier'
import CategoryIcon from './CategoryIcon.vue'

const model = defineModel<FoodCategory | null>({ required: true })
const moreOpen = ref(isMoreCategory(model.value))
</script>

<template>
  <fieldset>
    <legend class="sr-only">類別</legend>
    <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2">
      <p class="pt-2 text-sm font-bold text-grey-900" aria-hidden="true">類別</p>
      <div class="grid grid-cols-4 gap-1.5">
        <BaseChip v-for="c in CATEGORY_MAIN" :key="c.value" class="category-button" :active="model === c.value" :data-category="c.value" @click="model = c.value">
          {{ c.label }}
        </BaseChip>
        <BaseChip class="category-button" :active="moreOpen || isMoreCategory(model)" :aria-expanded="moreOpen" data-category="more" @click="moreOpen = !moreOpen">
          其他
        </BaseChip>
      </div>
      <Transition name="fade-up">
        <div v-if="moreOpen" class="col-start-2 flex flex-wrap gap-2 rounded-xl bg-grey-50 p-2" role="group" aria-label="其他類別">
          <BaseChip v-for="c in CATEGORY_MORE" :key="c.value" :active="model === c.value" :data-category="c.value" @click="model = c.value">
            <CategoryIcon kind="food" :value="c.value" :label="false" />{{ c.label }}
          </BaseChip>
        </div>
      </Transition>
    </div>
  </fieldset>
</template>

<style scoped>
.category-button {
  justify-content: center;
  min-width: 0;
  padding-inline: 0.25rem;
  border-color: var(--color-grey-400);
  border-radius: 0.5rem;
  background-color: var(--color-white);
  color: var(--color-grey-800);
}
.category-button[aria-pressed="true"] {
  border-color: var(--color-primary-600);
  background-color: var(--color-primary-600);
  color: var(--color-white);
}
</style>
