<script setup lang="ts">
/** @component MR-C31 HomeStationList — 首頁的社區關懷據點清單（實體管道，listStations）＋資料來源 */
/**
 * stations：undefined = 讀取中，null = 讀不到（顯示 error），陣列 = 據點清單。
 * 據點來自開放資料（T-115），一律附 SourceNote。
 * 據點有入口照片（Station.image_url，ADR-028）才在右側放縮圖（MR-C57，點一下放大）；沒有就維持原本的列。
 */
import { computed } from 'vue'
import { MapPin } from 'lucide-vue-next'
import { BaseCard, EmptyState, ListItem, SectionTitle, SkeletonBlock, SourceNote } from '@/ui'
import type { Station } from '../logic/home'
import { stationPhotoOf, type PlacePhoto as PlacePhotoData } from '../logic/placePhoto'
import PlacePhoto from './PlacePhoto.vue'

const props = defineProps<{ stations?: Station[] | null; error?: string; source: string }>()
/** 每個據點的入口照片（沒有 → null） */
const photos = computed(
  () => new Map<string, PlacePhotoData | null>((props.stations ?? []).map((s): [string, PlacePhotoData | null] => [s.id, stationPhotoOf(s)])),
)
</script>

<template>
  <section>
    <SectionTitle title="社區關懷據點" />
    <BaseCard>
      <SkeletonBlock v-if="stations === undefined" :lines="3" />
      <EmptyState v-else-if="stations === null" title="讀不到據點清單" :description="error" :icon="MapPin" />
      <EmptyState v-else-if="stations.length === 0" title="目前沒有據點資料" :icon="MapPin" />
      <ul v-else class="divide-y divide-grey-100">
        <li v-for="s in stations" :key="s.id">
          <ListItem :title="s.name" subtitle="社區照顧關懷據點" :icon="MapPin">
            <template v-if="photos.get(s.id)" #trailing>
              <PlacePhoto :photo="photos.get(s.id)!" />
            </template>
          </ListItem>
        </li>
      </ul>
      <SourceNote class="mt-2" :source="source" />
    </BaseCard>
  </section>
</template>
