<script setup lang="ts">
/** @component MR-C110 StationManager — 據點管理：地圖／清單選據點、新增修改位置、刪除確認及所屬長者 */
import { computed, toRef } from 'vue'
import { BaseButton } from '@/ui'
import { useStationManager, type Station, type Elder } from '../logic/stationManager'
import MapView from './MapView.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import StationManageForm from './StationManageForm.vue'
import StationElderList from './StationElderList.vue'

const props = defineProps<{ stations: Station[]; elders: Elder[]; offline: boolean; loadError?: string; onRefresh: () => Promise<void> }>()
const blocked = computed(() => props.offline || !!props.loadError)
const manager = useStationManager({ stations: toRef(props, 'stations'), elders: toRef(props, 'elders'), offline: blocked, refresh: props.onRefresh })
const { selected, selectedId, mode, draft, busy, error, confirmingDelete, elders: selectedElders, markers } = manager
const pick = computed(() => mode.value !== 'view' && !blocked.value && !busy.value ? manager.pick : undefined)
</script>

<template>
  <section class="space-y-4" aria-labelledby="station-manager-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="station-manager-title" class="mr-display text-xl font-bold text-primary-900">據點管理（{{ stations.length }}）</h2>
      <BaseButton :disabled="blocked || busy || mode !== 'view'" @click="manager.start(true)">新增據點</BaseButton>
    </div>
    <p v-if="loadError" role="alert" class="text-warn-200">{{ loadError }}</p>
    <BaseButton v-if="loadError" variant="outline" :disabled="busy" @click="onRefresh()">重新讀取</BaseButton>
    <p v-if="error" role="alert" class="text-warn-200">{{ error }}</p>
    <p v-if="offline" role="status" class="text-grey-600">目前離線，可查看上次資料，暫時不能新增、修改或刪除。</p>
    <div class="grid gap-4 lg:grid-cols-5">
      <div class="min-w-0 space-y-3 lg:col-span-3">
        <p class="text-grey-600">{{ mode === 'view' ? '點選地圖據點或下方清單，查看所屬長者。' : '請點選地圖設定據點位置，再儲存。' }}</p>
        <MapView :markers="markers" :center="mode === 'view' ? selected?.location : draft.location ?? undefined" :picked="mode === 'view' ? null : draft.location" :on-pick="pick" :on-marker-select="(marker) => manager.select(marker.id)" />
        <div class="grid gap-2 sm:grid-cols-2" aria-label="據點清單">
          <button v-for="station in stations" :key="station.id" type="button" class="min-h-12 rounded-xl border p-3 text-left break-words disabled:opacity-50" :class="selectedId === station.id ? 'border-primary-600 bg-primary-50 text-primary-900' : 'border-grey-200 bg-white text-grey-800'" :aria-pressed="selectedId === station.id" :disabled="busy || mode !== 'view'" @click="manager.select(station.id)">
            <span class="block font-bold">{{ station.name }}</span>
            <span class="text-sm text-grey-600">{{ station.address || '尚未填寫地址' }}</span>
          </button>
        </div>
        <p v-if="!stations.length && !loadError" class="text-grey-600">目前沒有據點，請按「新增據點」並在地圖選位置。</p>
      </div>
      <div class="min-w-0 space-y-4 rounded-xl bg-white p-4 shadow-card lg:col-span-2">
        <StationManageForm v-if="mode !== 'view'" v-model="draft" :creating="mode === 'create'" :busy="busy" :disabled="blocked" @save="manager.save" @cancel="manager.cancel" />
        <template v-else-if="selected">
          <h3 class="text-lg font-bold break-words text-primary-900">{{ selected.name }}</h3>
          <p class="break-words text-grey-700">{{ selected.address || '尚未填寫地址' }}</p>
          <p class="text-sm text-grey-500">資料來源：{{ selected.source }}</p>
          <div class="flex flex-wrap gap-2">
            <BaseButton variant="outline" :disabled="blocked || busy" @click="manager.start(false)">修改據點</BaseButton>
            <BaseButton variant="danger" :disabled="blocked || busy" @click="manager.askDelete">刪除據點</BaseButton>
          </div>
          <p class="text-sm text-grey-600">已有長者、帳號或服務紀錄的據點不能刪除。</p>
          <StationElderList v-if="!loadError" :elders="selectedElders" />
        </template>
        <p v-else class="text-grey-600">選擇據點後，這裡會顯示所屬長者。</p>
      </div>
    </div>
    <ConfirmDialog v-model="confirmingDelete" title="刪除此據點？" :message="`即將刪除「${selected?.name ?? ''}」。若仍有長者、帳號或服務紀錄，系統會拒絕刪除並保留所有資料。`" confirm-text="刪除據點" danger @confirm="manager.remove" />
  </section>
</template>
