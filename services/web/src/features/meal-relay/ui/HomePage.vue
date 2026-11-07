<script setup lang="ts">
/** @component MR-P01 HomePage — 鄰食轉運站首頁：說明、社區關懷據點、志工從哪裡來、依角色進入（一般市民「我要提供食物」） */
/**
 * MR-P01 = T01 PageContainer {
 *   MR-C05 StaleBanner, MR-C30 HomeIntro,
 *   MR-C21 PageTransition { MR-C33 HomeEntryCard | M05 EmptyState（讀不到身分）＋ A01 重試 },
 *   MR-C31 HomeStationList { M03, M01, M02×n, A07 SourceNote }, MR-C32 HomeVolunteerInfo { A01×3 }
 * }
 * 沒有選角色的按鈕，也沒有管理系統連結（§2、§9）。
 */
import { RefreshCw, UserX } from 'lucide-vue-next'
import { BaseButton, EmptyState, PageContainer } from '@/ui'
import { useHome } from '../logic/home'
import HomeEntryCard from './HomeEntryCard.vue'
import HomeIntro from './HomeIntro.vue'
import HomeStationList from './HomeStationList.vue'
import HomeVolunteerInfo from './HomeVolunteerInfo.vue'
import PageTransition from './PageTransition.vue'
import StaleBanner from './StaleBanner.vue'

const { me, meError, stations, stationsError, now, entry, staleAt, stationSource, load, openLink, volunteerLinks } = useHome()
</script>

<template>
  <PageContainer title="鄰食轉運站">
    <div class="space-y-4 pt-2">
      <StaleBanner :stale-at="staleAt" :now="now" />
      <HomeIntro />
      <PageTransition :loading="me === undefined" :page-key="me?.role ?? 'none'">
        <HomeEntryCard v-if="entry" :entry="entry" :name="me?.name" />
        <EmptyState v-else-if="me === null" title="讀不到你的身分" :description="meError" :icon="UserX">
          <BaseButton variant="outline" :icon="RefreshCw" @click="load">重新讀取</BaseButton>
        </EmptyState>
      </PageTransition>
      <HomeStationList :stations="stations" :error="stationsError" :source="stationSource" />
      <HomeVolunteerInfo :links="volunteerLinks" @open="openLink" />
    </div>
  </PageContainer>
</template>
