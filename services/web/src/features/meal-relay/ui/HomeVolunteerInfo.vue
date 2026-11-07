<script setup lang="ts">
/** @component MR-C32 HomeVolunteerInfo — 想當志工：正式版由據點經臺北市志工管理整合平臺招募、在臺北 E 大受訓（§1），本作品不做志工申請 */
/** 連結由父層用 bridge open_link 開啟（@open(url)） */
import { ExternalLink } from 'lucide-vue-next'
import { BaseButton, BaseCard, SectionTitle } from '@/ui'
import type { VolunteerLink } from '../logic/home'

defineProps<{ links: readonly VolunteerLink[] }>()
defineEmits<{ open: [url: string] }>()
</script>

<template>
  <section>
    <SectionTitle title="想當志工？" />
    <BaseCard>
      <p class="text-base text-grey-700">
        志工由各社區關懷據點透過臺北市志工管理整合平臺招募，在臺北 E 大完成志願服務基礎訓練與據點的特殊訓練後加入據點。這個服務不受理志工申請，想幫忙請從下面的管道報名。
      </p>
      <div class="mt-3 flex flex-col gap-2">
        <BaseButton
          v-for="l in links"
          :key="l.url"
          variant="outline"
          block
          :icon="ExternalLink"
          @click="$emit('open', l.url)"
        >
          {{ l.label }}
        </BaseButton>
      </div>
    </BaseCard>
  </section>
</template>
