<script setup lang="ts">
/** @component MR-C55 PlacePhoto — 地點照片縮圖（入口、店面）：點一下用底部面板（MR-C09）放大；圖片讀不到就整個隱藏 */
/**
 * 合約 v2.3（ADR-028）：有照片才顯示。父層用 logic/placePhoto.ts 的 xxxPhotoOf() 取得 photo，
 * 回傳 null 時不要放這個元件（不留空框、不放佔位圖）。圖片讀取失敗（例如斷網）也自動隱藏。
 *
 *   <PlacePhoto v-if="photo" :photo="photo" size="sm" />
 *   size：sm＝48px 方形縮圖（清單、任務卡）；md＝滿版寬、高 128px（頁首）
 */
import './motion.css'
import { ref, watch } from 'vue'
import type { PlacePhoto as PlacePhotoData } from '../logic/placePhoto'
import BottomSheet from './BottomSheet.vue'

const props = withDefaults(defineProps<{ photo: PlacePhotoData; size?: 'sm' | 'md' }>(), { size: 'sm' })

const open = ref(false)
const failed = ref(false)
watch(
  () => props.photo.src,
  () => (failed.value = false),
)
</script>

<template>
  <div v-if="!failed" :class="size === 'sm' ? 'shrink-0' : 'w-full'">
    <button
      type="button"
      class="press block overflow-hidden rounded-lg bg-grey-50 ring-1 ring-grey-100"
      :class="size === 'sm' ? 'size-12' : 'h-32 w-full'"
      :aria-label="`放大看${photo.alt}`"
      @click="open = true"
    >
      <img :src="photo.src" :alt="photo.alt" class="size-full object-cover" loading="lazy" @error="failed = true" />
    </button>
    <BottomSheet v-model="open" :title="photo.title">
      <img :src="photo.src" :alt="photo.alt" class="max-h-[70vh] w-full rounded-xl object-contain" />
    </BottomSheet>
  </div>
</template>
