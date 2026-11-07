<script setup lang="ts">
/** @component MR-C62 MascotBadge — 企鵝圓形頭像：可帶光芒，完成畫面可帶右下角打勾 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）01 中志工首頁問候、04 右完成畫面。
 * 圖是 public/meal-relay/brand/mascot.webp（企鵝＋蜂蜜罐，去背），放在淺青底的圓形裡裁切；
 * 完成插圖沒有原圖，用企鵝頭像加 lucide 的 CircleCheck 疊在右下角（`done`），設計者提供原圖後再換。
 *
 *   <MascotBadge :size="64" glow />          志工首頁問候
 *   <MascotBadge :size="160" glow done />    任務全部完成
 *
 * `alt` 沒傳時視為裝飾圖（旁邊已經有文字）。
 */
import { computed } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import { brandSrc } from '../logic/brand'

const props = withDefaults(defineProps<{ size?: number; glow?: boolean; done?: boolean; alt?: string }>(), {
  size: 64,
  glow: false,
  done: false,
  alt: '',
})

const src = computed(() => brandSrc('mascot', import.meta.env.BASE_URL))
const box = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
const badge = computed(() => `${Math.round(props.size * 0.34)}px`)
</script>

<template>
  <span class="relative inline-block shrink-0 align-middle" :style="box">
    <span class="block h-full w-full overflow-hidden rounded-full bg-primary-100 ring-2 ring-primary-800">
      <img class="h-full w-full object-cover" :src="src" :alt="alt" draggable="false" />
    </span>
    <svg
      v-if="glow"
      class="pointer-events-none absolute -top-[8%] -right-[14%] h-[34%] w-[34%] text-secondary-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 2.5v5M4.5 5.5l3 3.5M19.5 5.5l-3 3.5" />
    </svg>
    <span
      v-if="done"
      class="absolute -right-[2%] -bottom-[2%] flex items-center justify-center rounded-full bg-white shadow-card"
      :style="{ width: badge, height: badge }"
      role="img"
      aria-label="完成"
    >
      <CircleCheck class="h-full w-full text-success" :stroke-width="2.25" aria-hidden="true" />
    </span>
  </span>
</template>
