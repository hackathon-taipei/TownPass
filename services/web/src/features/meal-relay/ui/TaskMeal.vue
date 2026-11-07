<script setup lang="ts">
/** @component MR-C41 TaskMeal — 任務卡的食物區：照片（點了放大）、名稱、「1 份・最晚 HH:MM 食用」、取餐地點（名稱＋地址＋入口照片）、過敏原衝突警告 */
/**
 * 設計 v2 01 右（design-v2/README.md §3.3 第 1 項）：照片、名稱、份數與最晚食用時間、黃底「取餐地點：{食物點名稱}」、食物點地址（T-133）。
 * 取餐、取消的按鈕在 MR-C40 TaskCard（主按鈕與「取消這份餐」）。
 * M4：食物與長者的過敏原有交集時顯示 MR-C16 AllergenWarning，`v-model:conflict` 讓任務卡停用「確認已取餐」。
 * T-127：食物有照片就顯示縮圖（MR-C55），點了用 MR-C09 BottomSheet 放大；沒照片就不放佔位圖。
 * T-128：取餐地點有入口照片（Food.point_image_url，ADR-028）才顯示縮圖（MR-C57，點一下放大）。
 *
 *   <TaskMeal v-model:conflict="conflict" :claim="task.claim" :elder="task.assignment.elder" />
 */
import './motion.css'
import { computed, ref } from 'vue'
import { foodPhotoOf } from '../logic/shared'
import { pickupPhotoOf } from '../logic/placePhoto'
import { mealLineOf, pickupPlaceOf, type Claim, type Elder } from '../logic/volunteer'
import AllergenWarning from './AllergenWarning.vue'
import BottomSheet from './BottomSheet.vue'
import FoodThumb from './FoodThumb.vue'
import PlacePhoto from './PlacePhoto.vue'

const props = defineProps<{ claim: Claim; elder: Pick<Elder, 'alias' | 'allergens'> }>()
const conflict = defineModel<boolean>('conflict', { default: false })
const photo = computed(() => foodPhotoOf(props.claim.food))
const zoom = ref(false)
const pickupPhoto = computed(() => pickupPhotoOf(props.claim.food))
const place = computed(() => pickupPlaceOf(props.claim.food))
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-start gap-3">
      <button
        v-if="photo"
        type="button"
        class="press shrink-0 rounded-xl"
        :aria-label="`放大「${photo.alt}」的照片`"
        @click="zoom = true"
      >
        <FoodThumb class="aspect-[6/5] h-auto! w-[clamp(5rem,31vw,7.25rem)]! rounded-xl!" :food="claim.food" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="text-xl leading-tight font-black break-words text-primary-900">{{ claim.food.name }}</p>
        <p class="text-sm text-grey-600">{{ mealLineOf(claim) }}</p>
        <p class="mt-1 inline-block rounded-lg bg-secondary-200 px-1.5 py-0.5 text-sm leading-snug font-bold text-grey-900">取餐地點：{{ place.name }}</p>
        <p v-if="place.address" class="mt-0.5 text-sm break-words text-grey-600">{{ place.address }}</p>
      </div>
    </div>
    <BottomSheet v-if="photo" v-model="zoom" :title="photo.alt">
      <img :src="photo.src" :alt="photo.alt" class="max-h-[70vh] w-full rounded-xl bg-grey-50 object-contain" />
    </BottomSheet>
    <div v-if="pickupPhoto" class="flex items-center gap-3">
      <PlacePhoto :photo="pickupPhoto" />
      <p class="min-w-0 flex-1 text-sm text-grey-700">取餐地點入口<span class="block text-xs text-grey-500">點照片可以放大</span></p>
    </div>
    <AllergenWarning
      v-model:conflict="conflict"
      :food-allergens="claim.food.allergens"
      :elder-allergens="elder.allergens"
      :food-name="claim.food.name"
      :elder-name="elder.alias"
    />
  </div>
</template>
