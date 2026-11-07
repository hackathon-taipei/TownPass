<script setup lang="ts">
/** @component MR-C95 StationNamePill — 據點報到頁的據點名稱膠囊：淺青底、粗體大字 */
/**
 * 設計 v2 §3.5 第 2 項（04 左）。名字太長時換行，不截斷。
 * 設計圖左邊有定位圖示；依 T-126 決策 30「icon 只放在當下主要動作」不放（本頁沒有可點的動作）。
 *
 *   <StationNamePill :name="station.name" />
 */
defineProps<{ name: string }>()
</script>

<template>
  <h2 class="rounded-2xl bg-primary-50 px-4 py-3 text-center text-xl font-bold break-words text-primary-800 md:text-2xl">
    {{ name }}
  </h2>
</template>
