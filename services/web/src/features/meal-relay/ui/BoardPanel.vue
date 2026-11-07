<script setup lang="ts">
/** @component MR-C52 BoardPanel — 看板：5 張統計卡（MR-C13）、據點／食物點／長者地圖（MR-C07）、食物去向（MR-C03） */
/**
 * 管理系統「看板」分頁，資料來自 getBoard（logic/admin.ts 每 15 秒重新取得）。
 * 長者定位針只出現在管理系統（M13）。據點與食物點是開放資料，下方放 SourceNote。
 */
import { BaseCard, SectionTitle, SourceNote } from '@/ui'
import type { Board, Food } from '../logic/admin'
import { STAT_FIELDS } from '../logic/admin'
import type { Marker } from '../logic/mapMarker'
import FoodCard from './FoodCard.vue'
import MapView from './MapView.vue'
import StatCard from './StatCard.vue'

defineProps<{ board: Board | null; markers: Marker[]; foods: Food[]; now: number; sourceText: string; error?: string }>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="error" role="alert" class="text-sm text-warn-200">{{ error }}</p>
    <div v-if="board" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard v-for="f in STAT_FIELDS" :key="f.key" :label="f.label" :value="board.stats[f.key]" :tone="f.tone" />
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <BaseCard class="lg:col-span-2">
        <SectionTitle title="地圖：據點、食物點、長者" />
        <MapView :markers="markers" />
        <p class="mt-2 text-xs text-grey-500">長者：紅色是需要送餐或關懷、綠色是近期已見到本人。食物點：黃色可派送、紅色還沒被派出、藍色已全數派出、灰色已過期或已下架。</p>
      </BaseCard>

      <BaseCard>
        <SectionTitle :title="`食物去向（${foods.length}）`" />
        <div v-if="foods.length" class="flex flex-col gap-3">
          <FoodCard v-for="f in foods" :key="f.id" :food="f" :now="now" />
        </div>
        <p v-else class="py-4 text-center text-sm text-grey-500">目前沒有上架的食物</p>
      </BaseCard>
    </div>

    <SourceNote v-if="sourceText" :source="sourceText" />
  </div>
</template>
