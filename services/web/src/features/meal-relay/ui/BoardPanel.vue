<script setup lang="ts">
/** @component MR-C52 BoardPanel — 服務看板：今天的服務概況（5 張統計卡 MR-C13＋地圖 MR-C07 與圖例 MR-C58）、食物去向（照片、剩餘｜已派送｜已送達），已結束的收合（MR-C59） */
/**
 * 管理系統「服務看板」分頁，資料來自 getBoard（logic/admin.ts 每 15 秒重新取得）。設計 v2 §3.6、02-admin.webp 上半部。
 * - 統計卡：圖示＋標籤＋大數字，順序與圖示在 STAT_FIELDS；「需關懷長者」是 stats.alerts（T-113）
 * - 地圖：據點、食物點、長者（boardMarkers，T-126 三色），左上「位置示意・模擬資料」，右側圖例（boardLegend）
 * - 食物去向：進行中的直接列出，已過期、已下架的收合成「已結束 N 批」；照片用 MR-C55 FoodThumb（沒有照片就不畫）
 * 寬度 ≥ 1024px：左 2/3 概況、右 1/3 食物去向；以下一欄、統計卡 2～3 欄。據點與食物點是開放資料，下方放 SourceNote。
 */
import { computed } from 'vue'
import { BaseCard, SourceNote } from '@/ui'
import type { Board, Food } from '../logic/admin'
import { MAP_NOTE_TEXT, STAT_FIELDS, boardDateText, boardLegend, foodFlowText } from '../logic/admin'
import type { Marker } from '../logic/mapMarker'
import { splitEnded } from '../logic/shared'
import EndedGroup from './EndedGroup.vue'
import FoodThumb from './FoodThumb.vue'
import MapLegend from './MapLegend.vue'
import MapView from './MapView.vue'
import StatCard from './StatCard.vue'

const props = defineProps<{ board: Board | null; markers: Marker[]; foods: Food[]; now: number; sourceText: string; error?: string }>()
const groups = computed(() => splitEnded(props.foods))
const legend = computed(() => boardLegend(props.markers))
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="error" role="alert" class="text-sm text-warn-200">{{ error }}</p>

    <div class="grid gap-4 lg:grid-cols-3">
      <BaseCard class="lg:col-span-2">
        <h2 class="flex flex-wrap items-baseline gap-x-3 text-xl font-extrabold text-grey-900">
          今天的服務概況
          <span class="text-base font-medium text-grey-600 tabular-nums">｜ {{ boardDateText(now) }}</span>
        </h2>

        <div v-if="board" class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard v-for="f in STAT_FIELDS" :key="f.key" :label="f.label" :value="board.stats[f.key]" :tone="f.tone" :icon="f.icon" />
        </div>

        <div class="relative mt-4">
          <MapView :markers="markers" />
          <span class="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-white px-3 py-1 text-xs font-medium text-grey-700 shadow-card">
            {{ MAP_NOTE_TEXT }}
          </span>
          <div class="absolute top-2 right-2 z-10 w-36 rounded-lg bg-white p-2 shadow-card [&>ul]:flex-col [&>ul]:items-start">
            <MapLegend :items="legend" />
          </div>
        </div>
      </BaseCard>

      <BaseCard>
        <h2 class="text-xl font-extrabold text-grey-900">食物去向</h2>
        <ul v-if="groups.active.length" class="mt-3 flex flex-col gap-3">
          <li v-for="f in groups.active" :key="f.id" class="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-grey-100">
            <FoodThumb :food="f" size="lg" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-base font-bold text-grey-900">{{ f.name }}</p>
              <p class="mt-1 text-sm text-grey-600 tabular-nums">{{ foodFlowText(f) }}</p>
            </div>
          </li>
        </ul>
        <p v-else class="py-4 text-center text-sm text-grey-500">目前沒有進行中的食物</p>
        <EndedGroup class="mt-3" :count="groups.ended.length">
          <ul class="flex flex-col gap-2">
            <li v-for="f in groups.ended" :key="f.id" class="flex items-center gap-3 rounded-xl bg-grey-50 p-2">
              <FoodThumb :food="f" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-grey-700">{{ f.name }}</p>
                <p class="text-xs text-grey-500 tabular-nums">{{ foodFlowText(f) }}</p>
              </div>
            </li>
          </ul>
        </EndedGroup>
      </BaseCard>
    </div>

    <SourceNote v-if="sourceText" :source="sourceText" />
  </div>
</template>
