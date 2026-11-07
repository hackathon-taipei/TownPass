<script setup lang="ts">
/** @component MR-C05 StaleBanner — 斷網時顯示上次更新時間，提醒送出鍵停用（ADR-024） */
/**
 * 所有頁面最上方。staleAt 為空（線上資料）時完全不顯示；有值時文字由 shared.ts 的 staleText 組出，
 * now 由父層每秒更新一次傳進來。
 */
import './motion.css'
import { computed } from 'vue'
import { staleText } from '../logic/shared'

const props = defineProps<{ staleAt?: string | null; now: number }>()
const text = computed(() => staleText(props.staleAt, props.now))
</script>

<template>
  <Transition name="fade-up">
    <div v-if="text" role="status" class="rounded-xl bg-secondary-100 px-3 py-2 text-sm font-medium text-secondary-800">
      {{ text }}
    </div>
  </Transition>
</template>
