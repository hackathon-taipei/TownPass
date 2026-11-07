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
import { BRAND_NAME, BRAND_SUBTITLE, brandSrc } from '../logic/brand'
import MascotBadge from './MascotBadge.vue'

withDefaults(defineProps<{ title: string; variant?: 'wordmark' | 'banner' }>(), { variant: 'wordmark' })

const wordmark = computed(() => brandSrc('wordmark', import.meta.env.BASE_URL))
const mascot = computed(() => brandSrc('mascot', import.meta.env.BASE_URL))
</script>

<template>
  <header v-if="variant === 'wordmark'" class="flex min-h-18 items-center gap-2 bg-primary-100 px-4 py-2.5">
    <MascotBadge :size="48" />
    <div class="flex shrink-0 flex-col items-start leading-none">
      <img class="h-6 w-auto" :src="wordmark" :alt="BRAND_NAME" draggable="false" />
      <span class="mt-1 text-[10px] font-semibold text-primary-800">{{ BRAND_SUBTITLE }}</span>
    </div>
    <span class="mx-1 h-8 w-px shrink-0 bg-primary-700" aria-hidden="true" />
    <h1 class="mr-display min-w-0 flex-1 text-2xl leading-tight font-extrabold text-primary-800">{{ title }}</h1>
    <slot name="actions" />
  </header>

  <header v-else class="relative grid min-h-20 place-items-center overflow-hidden bg-primary-100 px-18 pt-1 pb-2">
    <img class="pointer-events-none absolute -bottom-2 left-3 size-20 object-contain" :src="mascot" alt="" draggable="false" />
    <h1 class="mr-display relative text-center text-3xl leading-tight font-black text-primary-900">{{ title }}</h1>
    <svg class="pointer-events-none absolute -bottom-0.5 right-4 h-17 w-18 text-primary-800" viewBox="0 0 76 70" aria-hidden="true" focusable="false">
      <path class="text-secondary-500" d="m54 10 2-7m6 11 6-5m-22 3-3-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4" />
      <path class="fill-white" d="M9 65V51l14-12 14 12v14M34 65V46l18-15 18 15v19" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="5" />
      <path class="text-secondary-500" d="M18 53h4v4h-4zm6 0h4v4h-4zm-6 6h4v4h-4zm6 0h4v4h-4zm23-11h5v5h-5zm7 0h5v5h-5zm-7 7h5v5h-5zm7 0h5v5h-5z" fill="currentColor" />
    </svg>
  </header>
</template>
