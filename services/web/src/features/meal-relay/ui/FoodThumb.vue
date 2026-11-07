<script setup lang="ts">
/** @component MR-C55 FoodThumb — 食物照片縮圖：有照片才顯示，替代文字用食物名稱（M19） */
/**
 * T-127：讓志工一看照片就知道要拿哪一批。沒有照片時什麼都不畫（不放空框、不放佔位圖）。
 * 網址用 foodPhotoOf()（內部用 imageSrc() 轉換），不另外呼叫 API。
 *
 *   <FoodThumb :food="food" />            48px（FoodRow）
 *   <FoodThumb :food="claim.food" size="lg" />   64px（TaskMeal）
 */
import { computed } from 'vue'
import { foodPhotoOf, type Food } from '../logic/shared'

const props = withDefaults(defineProps<{ food: Pick<Food, 'image_url' | 'name'>; size?: 'md' | 'lg' }>(), { size: 'md' })
const photo = computed(() => foodPhotoOf(props.food))
</script>

<template>
  <img
    v-if="photo"
    :src="photo.src"
    :alt="photo.alt"
    loading="lazy"
    decoding="async"
    class="shrink-0 rounded-lg bg-grey-50 object-cover ring-1 ring-grey-100"
    :class="size === 'lg' ? 'h-16 w-16' : 'h-12 w-12'"
  />
</template>
