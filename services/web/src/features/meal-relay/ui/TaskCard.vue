<script setup lang="ts">
/** @component MR-C40 TaskCard — 收合式任務卡：長者代號＋晶片；展開是食物、送達地點、查看位置、過敏原、主按鈕（確認已取餐／回報拜訪）、取消這份餐 */
/**
 * 設計 v2 01 右（design-v2/README.md §3.3，T-135）：MR-C65 Accordion 群組（TASK_GROUP，一次只展開一張）{
 *   標題列：長者代號、MR-C77 TaskChips（送餐+關懷／純關懷、待取餐／配送中）
 *   展開：MR-C41 TaskMeal（食物、取餐地點）、MR-C78 TaskAddress（送達地點＋複製地址）、
 *         MR-C79 TaskLocation（查看位置：地圖）、過敏原紅字、A01 主按鈕、「取消這份餐」文字連結 }
 * 主按鈕：待取餐 →「確認已取餐」（@pickup）；配送中或純關懷 →「回報拜訪」（@report）。
 * 「取消這份餐」只發 @cancel，確認視窗由頁面開（MR-C67，V7）。
 * M13：只顯示自己 assigned 任務上的這一位長者，不做導航。斷網、處理中、過敏原衝突時按鈕停用。
 *
 *   <TaskCard :task="task" :now="now" :busy="busyId === task.id" :offline="offline"
 *             @pickup="pickup(task)" @cancel="askCancel(task)" @report="openReport(task)" />
 */
import { computed, ref } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import { BaseButton } from '@/ui'
import { ALLERGEN_LABEL, countdownText } from '../logic/shared'
import { TASK_GROUP, addressLine, taskActionOf, taskChipsOf, type TaskView } from '../logic/volunteer'
import Accordion from './Accordion.vue'
import TaskAddress from './TaskAddress.vue'
import TaskChips from './TaskChips.vue'
import TaskLocation from './TaskLocation.vue'
import TaskMeal from './TaskMeal.vue'

const props = defineProps<{ task: TaskView; now: number; busy?: boolean; offline?: boolean }>()
const emit = defineEmits<{ pickup: []; cancel: []; report: [] }>()

const elder = computed(() => props.task.assignment.elder)
const chips = computed(() => taskChipsOf(props.task))
const action = computed(() => taskActionOf(props.task))
const address = computed(() => addressLine(elder.value))
const allergens = computed(() => elder.value.allergens.map((a) => ALLERGEN_LABEL[a]).join('、'))
/** 食物與長者過敏原有交集（MR-C16）→ 停用「確認已取餐」 */
const conflict = ref(false)
const mainDisabled = computed(() => !!props.offline || !!props.busy || (action.value.action === 'pickup' && conflict.value))

function onMain() {
  if (action.value.action === 'pickup') emit('pickup')
  else emit('report')
}
</script>

<template>
  <Accordion :name="task.id" :group="TASK_GROUP" :title="elder.alias" :data-task="task.id">
    <template #chip><TaskChips :chips="chips" /></template>
    <div class="space-y-3">
      <p v-if="task.note" class="text-sm text-grey-600">{{ task.note }}</p>
      <TaskMeal v-if="task.claim" v-model:conflict="conflict" :claim="task.claim" :elder="elder" />
      <hr v-if="task.claim" class="border-grey-100" />
      <TaskAddress v-if="address" :address="address" />
      <TaskLocation :task="task" />
      <p v-if="allergens" class="flex items-center gap-2 text-base font-bold text-warn-200">
        <TriangleAlert class="h-5 w-5 shrink-0" aria-hidden="true" />
        過敏原：{{ allergens }}
      </p>
      <p v-else class="text-sm text-grey-500">沒有登記過敏原</p>
      <p class="text-sm text-grey-500">任務期限：{{ countdownText(task.assignment.expires_at, now) }}</p>
      <BaseButton
        class="rounded-xl"
        block
        size="lg"
        :loading="busy && action.action === 'pickup'"
        :disabled="mainDisabled"
        :data-action="action.action"
        @click="onMain"
      >
        {{ action.label }}
      </BaseButton>
      <button
        v-if="task.claim"
        type="button"
        class="press mx-auto block min-h-11 px-4 text-base font-semibold text-grey-600 underline underline-offset-4 disabled:opacity-40"
        :disabled="offline || busy"
        @click="emit('cancel')"
      >
        取消這份餐
      </button>
    </div>
  </Accordion>
</template>
