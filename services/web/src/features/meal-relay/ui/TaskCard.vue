<script setup lang="ts">
/** @component MR-C40 TaskCard — 派送任務卡：長者代號、警示、要做的事、位置（只有這位長者）、過敏、要送的餐、回報 */
/**
 * 合約 v2.2 §9 MR-P05、M13：只顯示自己 assigned 任務上的這一位長者；地圖（MR-C07）只有這一根定位針，不做導航。
 * 送餐：MR-C41 TaskMeal（取餐、取消）；回報要先取餐，或取消這份餐改成只做關懷（reportReady）。
 *
 *   <TaskCard :task="task" :now="now" :busy="busyId === task.id" :offline="offline"
 *             @pickup="pickup(task)" @cancel="cancel(task)" @report="openReport(task)" />
 */
import { computed } from 'vue'
import { BaseButton, BaseCard, BaseTag } from '@/ui'
import type { Marker } from '../logic/mapMarker'
import { ALLERGEN_LABEL, countdownText } from '../logic/shared'
import { reportReady, type TaskView } from '../logic/volunteer'
import ElderStatusTag from './ElderStatusTag.vue'
import MapView from './MapView.vue'
import TaskMeal from './TaskMeal.vue'

const props = defineProps<{ task: TaskView; now: number; busy?: boolean; offline?: boolean }>()
const emit = defineEmits<{ pickup: []; cancel: []; report: [] }>()

const elder = computed(() => props.task.assignment.elder)
const markers = computed<Marker[]>(() => [
  { id: elder.value.id, kind: 'elder', location: elder.value.location, status: elder.value.alert ? 'alert' : 'ok', label: elder.value.alias },
])
const allergens = computed(() => elder.value.allergens.map((a) => ALLERGEN_LABEL[a]).join('、') || '沒有過敏原')
const ready = computed(() => reportReady(props.task))
</script>

<template>
  <BaseCard>
    <div class="flex items-start gap-2">
      <h3 class="min-w-0 flex-1 truncate text-lg font-semibold text-grey-900">{{ elder.alias }}</h3>
      <span class="shrink-0 text-sm text-grey-500">{{ countdownText(task.assignment.expires_at, now) }}</span>
    </div>
    <ElderStatusTag class="mt-1" :elder="elder" />

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-sm text-grey-600">要做的事</span>
      <BaseTag v-for="k in task.todo" :key="k" :tone="k === 'meal' ? 'primary' : 'secondary'">{{ k === 'meal' ? '送餐' : '關懷' }}</BaseTag>
    </div>
    <p v-if="task.note" class="mt-1 text-sm text-grey-600">{{ task.note }}</p>

    <MapView class="mt-3" :markers="markers" :center="elder.location" />

    <p class="mt-3 text-base text-grey-800">
      <span class="text-sm text-grey-600">過敏</span>
      <span class="ml-2" :class="elder.allergens.length ? 'font-semibold text-warn-200' : ''">{{ allergens }}</span>
    </p>

    <TaskMeal
      v-if="task.claim"
      class="mt-3"
      :claim="task.claim"
      :elder="elder"
      :busy="busy"
      :disabled="offline"
      @pickup="emit('pickup')"
      @cancel="emit('cancel')"
    />

    <BaseButton class="mt-3" block variant="secondary" :disabled="!ready || offline || busy" @click="emit('report')">回報拜訪</BaseButton>
    <p v-if="!ready" class="mt-1 text-sm text-grey-500">送餐要先取餐再回報；不送了可以按「取消這份餐」，改成只做關懷</p>
  </BaseCard>
</template>
