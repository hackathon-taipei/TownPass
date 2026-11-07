<script setup lang="ts">
/** @component MR-C79 TaskLocation — 任務卡的「查看位置」收合列：展開才畫地圖（據點、這位長者、我）與圖例 */
/**
 * 設計 v2 01 右（design-v2/README.md §3.3）：MR-C65 Accordion「查看位置」，裡面是 MR-C07 MapView＋MR-C58 MapLegend。
 * 長者定位針只有這一位（M13）；另外保留 T-126 的任務據點與「我的位置」企鵝（裝置定位，不送後端、不存）。
 * 收合時不建立地圖；展開後才掛上 MapView（定位的 watch 與 T-126 相同，多張卡共用一個）。
 *
 *   <TaskLocation :task="task" />
 */
import { computed, ref } from 'vue'
import { MapPin } from 'lucide-vue-next'
import { legendOf, taskMarkers, useMyLocation } from '../logic/mapMarker'
import type { TaskView } from '../logic/volunteer'
import Accordion from './Accordion.vue'
import MapLegend from './MapLegend.vue'
import MapView from './MapView.vue'

const props = defineProps<{ task: TaskView }>()
const open = ref(false)
const myLocation = useMyLocation()
const markers = computed(() =>
  taskMarkers({
    station: props.task.station,
    elder: props.task.assignment.elder,
    me: myLocation.value ? { id: props.task.assignment.volunteer_id, location: myLocation.value } : null,
    base: import.meta.env.BASE_URL,
  }),
)
const legend = computed(() => legendOf(markers.value))
</script>

<template>
  <Accordion v-model="open" title="查看位置" :icon="MapPin">
    <template v-if="open">
      <!-- 據點讀到後重建一次地圖，讓第一次縮放包含據點與長者 -->
      <MapView :key="task.station ? 'with-station' : 'elder-only'" :markers="markers" />
      <MapLegend class="mt-2" :items="legend" />
    </template>
  </Accordion>
</template>
