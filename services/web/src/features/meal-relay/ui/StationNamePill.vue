<script setup lang="ts">
/** @component MR-C95 StationNamePill — 據點名稱膠囊：淺青底、定位圖示＋據點名稱 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §3.5、04 左圖）據點頁 BrandHeader 下面的第一列。
 * 開放資料的據點名稱常很長：最多兩行，再長才截斷（完整名稱放在 title）。
 *
 *   <StationNamePill :name="station.name" />
 */
import { MapPin } from 'lucide-vue-next'

defineProps<{ name: string }>()
</script>

<template>
  <div class="flex min-h-12 items-center gap-2 rounded-xl bg-primary-100 px-4 py-2" :title="name">
    <MapPin class="h-6 w-6 shrink-0 text-primary-700" :stroke-width="2.25" aria-hidden="true" />
    <h2 class="line-clamp-2 min-w-0 flex-1 text-xl leading-snug font-bold break-words text-primary-800">{{ name }}</h2>
  </div>
</template>
