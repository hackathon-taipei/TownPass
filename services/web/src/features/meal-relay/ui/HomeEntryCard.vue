<script setup lang="ts">
/** @component MR-C33 HomeEntryCard — 首頁依角色的主按鈕：圖示＋文字＋右箭頭（我要提供食物／管理我的食物／進入志工頁／打開報到 QR） */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §2、§3.1）01 左的青色大按鈕。admin 沒有按鈕，父層不放這個元件。
 * 整個頁面只有這一個主按鈕，圖示也只放在這裡（當下的主要動作）。
 */
import type { Component } from 'vue'
import { ChevronRight, HandHeart, Package, QrCode } from 'lucide-vue-next'
import { BaseButton } from '@/ui'
import type { EntryRole, HomeEntry } from '../logic/home'

defineProps<{ entry: HomeEntry }>()

/** 依角色的方塊圖示：提供食物與管理食物用箱子、志工用愛心手、據點用 QR */
const ICON: Record<EntryRole, Component> = { citizen: Package, supplier: Package, volunteer: HandHeart, station: QrCode }
</script>

<template>
  <BaseButton block size="lg" class="rounded-xl px-5 shadow-card" :to="entry.to" :icon="ICON[entry.role]">
    <span class="min-w-0 flex-1 truncate text-left text-lg font-bold">{{ entry.label }}</span>
    <ChevronRight class="size-6 shrink-0" aria-hidden="true" />
  </BaseButton>
</template>
