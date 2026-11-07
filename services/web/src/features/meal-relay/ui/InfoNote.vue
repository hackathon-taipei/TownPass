<script setup lang="ts">
/** @component MR-C64 InfoNote — 淺黃提醒卡：圖示＋文字，可帶第二行小字 */
/**
 * 設計 v2（docs/meal-relay/design-v2/）01 首頁「長者不用操作 App」、03「審核通過後，就能上架食物」「上架後仍可修改份數與時間」「還有食物等待派送」。
 * 預設圖示是 lucide 的 `Info`；用 `icon` 換成別的（例如 `Users`、`Truck`）。文字也可以放在預設插槽。
 *
 *   <InfoNote text="長者不用操作 App" detail="需要送餐或關懷，請洽里長或社區關懷據點" :icon="Users" />
 */
import { Info } from 'lucide-vue-next'
import type { Component } from 'vue'

defineProps<{ text?: string; detail?: string; icon?: Component }>()
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl bg-secondary-100 px-3 py-2.5 ring-1 ring-secondary-200" role="note">
    <component :is="icon ?? Info" class="h-6 w-6 shrink-0 text-secondary-700" :stroke-width="1.75" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-grey-800"><slot>{{ text }}</slot></p>
      <p v-if="detail" class="mt-0.5 text-xs text-grey-600">{{ detail }}</p>
    </div>
  </div>
</template>
