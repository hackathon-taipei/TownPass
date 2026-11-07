<script setup lang="ts">
/** @component MR-C60 BrandHeader — 品牌頁首：企鵝＋「鄰食蜂」字標＋頁面標題；banner 變體為淺青底、標題置中 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）03、02（字標版）、04（banner 版）的頁首。
 * 台北通 App 自己的標題列與返回鍵網頁不要畫。標題用 h1。
 *
 *   <BrandHeader title="提供食物" />                    字標版：企鵝頭像＋「鄰食蜂」＋小字「鄰食轉運站」｜標題
 *   <BrandHeader title="我的任務" variant="banner" />   banner 版：淺青底、企鵝在左、標題置中、右邊房子與光芒
 *
 * 字標圖是 public/meal-relay/brand/wordmark.webp（去背）。字標版標題右側可放 `#actions`（例如管理系統的「重置示範資料」）。
 */
import { computed } from 'vue'
import { House } from 'lucide-vue-next'
import { BRAND_NAME, BRAND_SUBTITLE, brandSrc } from '../logic/brand'
import MascotBadge from './MascotBadge.vue'

withDefaults(defineProps<{ title: string; variant?: 'wordmark' | 'banner' }>(), { variant: 'wordmark' })

const wordmark = computed(() => brandSrc('wordmark', import.meta.env.BASE_URL))
</script>

<template>
  <header v-if="variant === 'wordmark'" class="flex items-center gap-3 bg-primary-50 px-4 py-3">
    <MascotBadge :size="44" />
    <div class="flex shrink-0 flex-col items-start leading-none">
      <img class="h-6 w-auto" :src="wordmark" :alt="BRAND_NAME" draggable="false" />
      <span class="mt-1 text-[10px] font-semibold text-primary-800">{{ BRAND_SUBTITLE }}</span>
    </div>
    <span class="h-8 w-px shrink-0 bg-grey-200" aria-hidden="true" />
    <h1 class="min-w-0 flex-1 truncate text-xl font-extrabold text-primary-800">{{ title }}</h1>
    <slot name="actions" />
  </header>

  <header v-else class="relative flex min-h-16 items-center bg-primary-100 px-4 py-2">
    <MascotBadge :size="48" />
    <h1 class="flex-1 px-2 text-center text-2xl font-extrabold text-primary-800">{{ title }}</h1>
    <span class="flex w-12 shrink-0 items-end justify-end gap-0.5 text-primary-700" aria-hidden="true">
      <svg class="mb-3 h-4 w-4 text-secondary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M12 2.5v5M4.5 5.5l3 3.5M19.5 5.5l-3 3.5" />
      </svg>
      <House class="h-7 w-7" :stroke-width="2" />
    </span>
  </header>
</template>
