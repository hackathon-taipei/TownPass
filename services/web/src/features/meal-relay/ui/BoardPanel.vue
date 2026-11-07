<script setup lang="ts">
/** @component MR-C52 BoardPanel — 看板：5 張統計卡（MR-C13）、食物去向（MR-C03），已結束的收合（MR-C56） */
/**
 * 管理系統「看板」分頁，資料來自 getBoard（logic/admin.ts 每 15 秒重新取得）。
 * T-126：拿掉總覽地圖，改用統計卡與清單；管理員只在登記或修改長者位置時看到地圖（MR-C53 的 LocationPicker）。
 * 食物去向：進行中的直接列出，已過期、已下架的收合成「已結束 N 批」。據點與食物點是開放資料，下方放 SourceNote。
 */
import { computed } from 'vue'
import { BaseCard, SectionTitle, SourceNote } from '@/ui'
import type { Board, Food } from '../logic/admin'
import { STAT_FIELDS } from '../logic/admin'
import { splitEnded } from '../logic/shared'
import EndedGroup from './EndedGroup.vue'
import FoodCard from './FoodCard.vue'
import StatCard from './StatCard.vue'

const props = defineProps<{ board: Board | null; foods: Food[]; now: number; sourceText: string; error?: string }>()
const groups = computed(() => splitEnded(props.foods))
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="error" role="alert" class="text-sm text-warn-200">{{ error }}</p>
    <div v-if="board" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard v-for="f in STAT_FIELDS" :key="f.key" :label="f.label" :value="board.stats[f.key]" :tone="f.tone" />
    </div>

    <BaseCard>
      <SectionTitle :title="`食物去向（${groups.active.length}）`" />
      <div v-if="groups.active.length" class="flex flex-col gap-3">
        <FoodCard v-for="f in groups.active" :key="f.id" :food="f" :now="now" />
      </div>
      <p v-else class="py-4 text-center text-sm text-grey-500">目前沒有進行中的食物</p>
      <EndedGroup class="mt-3" :count="groups.ended.length">
        <FoodCard v-for="f in groups.ended" :key="f.id" :food="f" :now="now" />
      </EndedGroup>
    </BaseCard>

    <SourceNote v-if="sourceText" :source="sourceText" />
  </div>
</template>
