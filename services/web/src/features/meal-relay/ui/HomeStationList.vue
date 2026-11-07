<script setup lang="ts">
/** @component MR-C31 HomeStationList — 首頁的社區關懷據點清單（實體管道，listStations）＋資料來源 */
/**
 * stations：undefined = 讀取中，null = 讀不到（顯示 error），陣列 = 據點清單。
 * 據點來自開放資料（T-115），一律附 SourceNote。
 */
import { MapPin } from 'lucide-vue-next'
import { BaseCard, EmptyState, ListItem, SectionTitle, SkeletonBlock, SourceNote } from '@/ui'
import type { Station } from '../logic/home'

defineProps<{ stations?: Station[] | null; error?: string; source: string }>()
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
          <ListItem :title="s.name" subtitle="社區照顧關懷據點" :icon="MapPin" />
        </li>
      </ul>
      <SourceNote class="mt-2" :source="source" />
    </BaseCard>
  </section>
</template>
