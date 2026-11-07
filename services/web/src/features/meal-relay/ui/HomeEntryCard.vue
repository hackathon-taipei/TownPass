<script setup lang="ts">
/** @component MR-C33 HomeEntryCard — 首頁依角色的主要按鈕：進入志工／提供者／據點頁，或一般市民的「我要提供食物」（§9） */
import { computed } from 'vue'
import { ArrowRight, HandPlatter } from 'lucide-vue-next'
import { BaseButton, BaseCard } from '@/ui'
import type { HomeEntry } from '../logic/home'

const props = defineProps<{ entry: HomeEntry; name?: string }>()
const greeting = computed(() => (props.entry.kind === 'enter' && props.name ? `${props.name}，你好` : ''))
</script>

<template>
  <BaseCard>
    <p v-if="greeting" class="font-semibold text-grey-900">{{ greeting }}</p>
    <p class="text-base text-grey-700" :class="greeting && 'mt-1'">{{ entry.description }}</p>
    <BaseButton class="mt-3" block :to="entry.to" :icon="entry.kind === 'offer_food' ? HandPlatter : ArrowRight">
      {{ entry.label }}
    </BaseButton>
  </BaseCard>
</template>
