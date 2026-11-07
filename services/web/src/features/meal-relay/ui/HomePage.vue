<script setup lang="ts">
/** @component MR-P01 HomePage — 鄰食蜂首頁：主視覺、依角色的主按鈕、長者不用操作 App、附近關懷據點（點開看位置）、想成為志工？ */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §2、§3.1，設計圖 01 左；T-134）：
 * MR-P01 = T01 PageContainer {
 *   MR-C05 StaleBanner（斷網時）,
 *   MR-C61 BrandHero,
 *   MR-C21 PageTransition { #skeleton, MR-C33 HomeEntryCard | M05 EmptyState（讀不到身分）＋ A01 重新讀取 | （admin 沒有按鈕） },
 *   MR-C30 HomeIntro { MR-C64 InfoNote },
 *   MR-C31 HomeStationList { M03, 據點列×n { MR-C57 PlacePhoto } } → MR-C70 HomeStationSheet { MR-C09 BottomSheet, MR-C07 MapView },
 *   MR-C32 HomeVolunteerInfo { MR-C65 Accordion { A01×3 } },
 *   A07 SourceNote（頁尾）
 * }
 * 沒有選角色的按鈕，也沒有管理系統連結（§2、§9）。只呼叫 getMe、listStations。
 */
import { RefreshCw, UserX } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer, SourceNote } from '@/ui'
import { useHome } from '../logic/home'
import BrandHero from './BrandHero.vue'
import HomeEntryCard from './HomeEntryCard.vue'
import HomeIntro from './HomeIntro.vue'
import HomeStationList from './HomeStationList.vue'
import HomeStationSheet from './HomeStationSheet.vue'
import HomeVolunteerInfo from './HomeVolunteerInfo.vue'
import PageTransition from './PageTransition.vue'
import StaleBanner from './StaleBanner.vue'

const {
  me,
  meError,
  stations,
  stationsError,
  now,
  entry,
  staleAt,
  stationSource,
  load,
  openLink,
  volunteerLinks,
  sheetStation,
  sheetOpen,
  openStation,
} = useHome()
</script>

<template>
  <PageContainer>
    <div class="space-y-4 pt-3">
      <StaleBanner :stale-at="staleAt" :now="now" />
      <BrandHero />
      <PageTransition :loading="me === undefined" :page-key="me?.role ?? 'none'">
        <template #skeleton>
          <div class="h-13 w-full animate-pulse rounded-xl bg-grey-200" />
        </template>
        <HomeEntryCard v-if="entry" :entry="entry" />
        <EmptyState v-else-if="me === null" title="讀不到你的身分" :description="meError" :icon="UserX">
          <BaseButton variant="outline" :icon="RefreshCw" @click="load">重新讀取</BaseButton>
        </EmptyState>
      </PageTransition>
      <HomeIntro />
      <HomeStationList :stations="stations" :error="stationsError" @select="openStation" @retry="load" />
      <HomeVolunteerInfo :links="volunteerLinks" @open="openLink" />
      <SourceNote class="text-center" :source="stationSource" />
    </div>
    <HomeStationSheet v-model="sheetOpen" :station="sheetStation" />
  </PageContainer>
</template>
