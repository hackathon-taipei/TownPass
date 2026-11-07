<script setup lang="ts">
/** @component MR-C31 HomeStationList — 首頁「附近關懷據點」：每列定位圖示、據點名稱、地址、右箭頭，點一列開地址與地圖面板 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §2、§3.1 第 4 項）。
 * stations：undefined = 讀取中，null = 讀不到（顯示 error 與「重新讀取」），陣列 = 據點清單（listStations，實體管道）。
 * 點一列 → @select(station)，父層用 MR-C70 開底部面板。
 * 據點有入口照片（Station.image_url，ADR-028，T-128）才在右側放縮圖（MR-C57，點一下放大）；沒有就不放。
 * 整列可點：按鈕用 after: 蓋滿整列，照片縮圖疊在上面（不把按鈕放進按鈕裡）。
 * 資料來源 SourceNote 在頁尾（MR-P01）。
 */
import { computed } from 'vue'
import { ChevronRight, MapPin } from 'lucide-vue-next'
import { BaseButton, BaseCard, EmptyState, SectionTitle, SkeletonBlock } from '@/ui'
import { stationAddressText, type Station } from '../logic/home'
import { stationPhotoOf, type PlacePhoto as PlacePhotoData } from '../logic/placePhoto'
import PlacePhoto from './PlacePhoto.vue'

const props = defineProps<{ stations?: Station[] | null; error?: string }>()
defineEmits<{ select: [station: Station]; retry: [] }>()

/** 每個據點的入口照片（沒有 → null） */
const photos = computed(
  () => new Map<string, PlacePhotoData | null>((props.stations ?? []).map((s): [string, PlacePhotoData | null] => [s.id, stationPhotoOf(s)])),
)
</script>

<template>
  <section>
    <SectionTitle class="[&_h2]:font-['Meal_Relay_Display',var(--font-sans)] [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-primary-800" title="附近關懷據點" />
    <BaseCard v-if="stations === undefined"><SkeletonBlock :lines="3" /></BaseCard>
    <BaseCard v-else-if="stations === null">
      <EmptyState title="讀不到據點清單" :description="error" :icon="MapPin">
        <BaseButton variant="outline" @click="$emit('retry')">重新讀取</BaseButton>
      </EmptyState>
    </BaseCard>
    <BaseCard v-else-if="stations.length === 0"><EmptyState title="目前沒有據點資料" :icon="MapPin" /></BaseCard>
    <ul v-else class="space-y-px">
      <li
        v-for="s in stations"
        :key="s.id"
        class="press relative flex min-h-14 items-center gap-2.5 rounded-xl border border-grey-200 bg-grey-50/40 px-3 py-1.5 active:bg-grey-50"
      >
        <MapPin class="size-7 shrink-0 fill-primary-700 text-primary-700 [&_circle]:fill-white [&_circle]:stroke-white" aria-hidden="true" />
        <button
          type="button"
          class="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-xl"
          :aria-label="`${s.name}，${stationAddressText(s)}，查看位置`"
          @click="$emit('select', s)"
        >
          <span class="block text-lg leading-tight font-extrabold break-words text-grey-900">{{ s.name }}</span>
          <span class="block text-sm text-grey-600">{{ stationAddressText(s) }}</span>
        </button>
        <PlacePhoto v-if="photos.get(s.id)" class="relative z-10" :photo="photos.get(s.id)!" />
        <ChevronRight class="size-5 shrink-0 text-grey-600" aria-hidden="true" />
      </li>
    </ul>
  </section>
</template>
