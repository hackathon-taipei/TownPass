<script setup lang="ts">
/** @component MR-C32 HomeVolunteerInfo — 「想成為志工？」收合列：正式版由據點經臺北市志工管理整合平臺招募、在臺北 E 大受訓（§1），本作品不做志工申請 */
/**
 * 設計 v2（docs/meal-relay/design-v2/README.md §2、§3.1 第 5 項）：MR-C65 Accordion，預設收合，原地展開說明與 3 個連結。
 * 連結由父層用 bridge open_link 開啟（@open(url)），開法與 T-116 相同。
 */
import { BaseButton } from '@/ui'
import type { VolunteerLink } from '../logic/home'
import Accordion from './Accordion.vue'

defineProps<{ links: readonly VolunteerLink[] }>()
defineEmits<{ open: [url: string] }>()
</script>

<template>
  <Accordion title="想成為志工？">
    <p class="text-base text-grey-700">
      志工由各社區關懷據點依「臺北市政府所屬各機關志願服務管理及運用原則」，透過臺北市志工管理整合平臺招募，在臺北 E 大完成志願服務基礎訓練與據點的特殊訓練後加入據點。這個服務不受理志工申請，想幫忙請到臺北市志工管理整合平臺報名。
    </p>
    <div class="mt-3 flex flex-col gap-2">
      <BaseButton v-for="l in links" :key="l.url" variant="outline" size="lg" block @click="$emit('open', l.url)">
        {{ l.label }}
      </BaseButton>
    </div>
  </Accordion>
</template>
