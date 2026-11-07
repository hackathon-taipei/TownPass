<script setup lang="ts">
/** @component MR-C30 HomeIntro — 首頁說明：長者不用操作 App，需要送餐或關懷請洽里長或最近的社區關懷據點（§1、§2） */
import { HandPlatter } from 'lucide-vue-next'
import { BaseCard, IconBadge } from '@/ui'
</script>

<template>
  <BaseCard>
    <div class="flex items-start gap-3">
      <IconBadge :icon="HandPlatter" />
      <div class="min-w-0 flex-1 space-y-2 text-base text-grey-700">
        <p class="font-semibold text-grey-900">把多出來的食物，送到需要的長者手上</p>
        <p>提供者把多出來的食物上架；志工到社區關懷據點報到後，系統會自動派給他要送餐、關懷的長者，並避開長者的過敏原。</p>
        <p><span class="font-semibold text-grey-900">長者不用操作 App。</span>家裡的長輩需要送餐或關懷，請洽里長或最近的社區關懷據點。</p>
      </div>
    </div>
  </BaseCard>
</template>
