<script setup lang="ts">
/** @component MR-C41 TaskMeal — 任務卡的送餐區：要送的餐（申請列）、過敏原警告、取餐與取消這份餐 */
/**
 * 合約 M8：claimed →（取餐）delivering；claimed、delivering 都可以取消，份數退回，任務保留只做關懷（V7）。
 * M4：食物與長者的過敏原有交集時停用取餐（MR-C16，長者之後改過敏原時的保險）。
 * 斷網或處理中（disabled）時按鈕停用（ADR-024）。
 * 取餐地點有入口照片（Food.point_image_url，ADR-028）才顯示縮圖（MR-C55，點一下放大）；沒有就不顯示這一行。
 *
 *   <TaskMeal :claim="task.claim" :elder="task.assignment.elder" :disabled="busy || offline" @pickup="…" @cancel="…" />
 */
import { computed, ref } from 'vue'
import { BaseButton } from '@/ui'
import { pickupPhotoOf } from '../logic/placePhoto'
import type { Claim, Elder } from '../logic/volunteer'
import AllergenWarning from './AllergenWarning.vue'
import ClaimRow from './ClaimRow.vue'
import PlacePhoto from './PlacePhoto.vue'

const props = defineProps<{ claim: Claim; elder: Pick<Elder, 'alias' | 'allergens'>; disabled?: boolean; busy?: boolean }>()
const emit = defineEmits<{ pickup: []; cancel: [] }>()
const conflict = ref(false)
const pickupPhoto = computed(() => pickupPhotoOf(props.claim.food))
</script>

<template>
  <div class="space-y-2">
    <ClaimRow :claim="claim" />
    <div v-if="pickupPhoto" class="flex items-center gap-3">
      <PlacePhoto :photo="pickupPhoto" />
      <p class="min-w-0 flex-1 text-sm text-grey-700">取餐地點入口：{{ claim.food.point_name }}<span class="block text-xs text-grey-500">點照片可以放大</span></p>
    </div>
    <AllergenWarning
      v-model:conflict="conflict"
      :food-allergens="claim.food.allergens"
      :elder-allergens="elder.allergens"
      :food-name="claim.food.name"
      :elder-name="elder.alias"
    />
    <div class="flex gap-2">
      <BaseButton
        v-if="claim.status === 'claimed'"
        class="flex-1"
        :loading="busy"
        :disabled="disabled || conflict"
        @click="emit('pickup')"
      >
        取餐
      </BaseButton>
      <BaseButton class="flex-1" variant="outline" :disabled="disabled || busy" @click="emit('cancel')">取消這份餐</BaseButton>
    </div>
  </div>
</template>
