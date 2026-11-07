<script setup lang="ts">
/** @component MR-C61 BrandHero — 首頁主視覺：完整標誌＋兩行標語 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）01 左，首頁最上面。
 * 標誌是 public/meal-relay/brand/logo.webp（完整版，去背）；標語預設「把多出來的食物，送到需要的人手上」，
 * 用 `lines` 換成別的（一行一個字串）。
 *
 *   <BrandHero />
 */
import { computed } from 'vue'
import { BRAND_NAME, BRAND_SUBTITLE, brandSrc } from '../logic/brand'

withDefaults(defineProps<{ lines?: string[] }>(), { lines: () => ['把多出來的食物，', '送到需要的人手上'] })

const logo = computed(() => brandSrc('logo', import.meta.env.BASE_URL))
</script>

<template>
  <section class="flex flex-col items-center text-center">
    <img class="relative z-10 -mb-8 h-44 w-auto max-w-full" :src="logo" :alt="`${BRAND_NAME}（${BRAND_SUBTITLE}）`" draggable="false" />
    <div class="w-full rounded-[2rem] bg-primary-50 px-4 pt-10 pb-4">
      <p class="text-2xl leading-snug font-extrabold text-primary-800">
        <template v-for="(line, i) in lines" :key="i">
          <br v-if="i > 0" />
          {{ line }}
        </template>
      </p>
    </div>
  </section>
</template>
