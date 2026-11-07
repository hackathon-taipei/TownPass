<script setup lang="ts">
/** @component MR-C95 StationNamePill — 據點報到頁的據點名稱膠囊：淺青底、粗體大字 */
/**
 * 設計 v2 §3.5 第 2 項（04 左）。名字太長時換行，不截斷。
 *
 *   <StationNamePill :name="station.name" />
 */
import { MapPin } from 'lucide-vue-next'

defineProps<{ name: string }>()
</script>

<template>
  <h2 class="flex items-center gap-2.5 rounded-2xl bg-primary-100 px-4 py-2.5 text-xl font-extrabold break-words text-primary-900 md:text-2xl">
    <MapPin class="size-7 shrink-0 fill-primary-700 text-primary-700 [&>circle]:fill-white [&>circle]:stroke-white" aria-hidden="true" />
    <span class="min-w-0">{{ name }}</span>
  </h2>
</template>
