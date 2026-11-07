<script setup lang="ts">
/** @component MR-C30 HomeIntro — 首頁提醒卡：長者不用操作 App，需要送餐或關懷請洽里長或社區關懷據點（§1、§2） */
/** 設計 v2（docs/meal-relay/design-v2/README.md §3.1 第 3 項）：用 MR-C64 InfoNote，文字固定。 */
import { Users } from 'lucide-vue-next'
import InfoNote from './InfoNote.vue'
</script>

<template>
  <InfoNote
    class="min-h-16 [&_svg]:size-8 [&_p:first-child]:text-xl [&_p:first-child]:leading-tight [&_p:first-child]:font-extrabold [&_p:first-child]:text-primary-900 [&_p:last-child]:text-sm"
    text="長者不用操作 App"
    detail="需要送餐或關懷，請洽里長或社區關懷據點"
    :icon="Users"
  />
</template>
