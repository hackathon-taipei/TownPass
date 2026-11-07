/** LOGIC LAYER — T-140 管理員據點地圖 CRUD，長者僅取管理台已授權名冊。 */
import { computed, ref, watch, type Ref } from 'vue'
import { createStation, updateStation, deleteStation, MealApiError } from '../data'
import type { Station, Elder, Location, StationCreate } from '../data'
import type { Marker } from './mapMarker'
import { toast } from './toast'

export type { Station, Elder, Location }
export interface StationDraft { name: string; address: string; location: Location | null }
export function stationElders(elders: readonly Elder[], stationId: string | null): Elder[] {
  return stationId ? elders.filter((e) => e.station_id === stationId) : []
}
export function stationDraftError(d: StationDraft): string {
  if (!d.name.trim()) return '請填據點名稱'
  if (d.name.trim().length > 100) return '據點名稱最多100字'
  if (d.address.trim().length > 120) return '地址最多120字'
  if (!d.location || !Number.isFinite(d.location.lat) || !Number.isFinite(d.location.lng) || Math.abs(d.location.lat) > 90 || Math.abs(d.location.lng) > 180) return '請在地圖上選擇有效位置'
  return ''
}
export function useStationManager(options: { stations: Ref<Station[]>; elders: Ref<Elder[]>; offline: Ref<boolean>; refresh: () => Promise<void> }) {
  const selectedId = ref<string | null>(null)
  const mode = ref<'view' | 'create' | 'edit'>('view')
  const draft = ref<StationDraft>({ name: '', address: '', location: null })
  const busy = ref(false)
  const error = ref('')
  const confirmingDelete = ref(false)
  const selected = computed(() => options.stations.value.find((s) => s.id === selectedId.value) ?? null)
  const elders = computed(() => stationElders(options.elders.value, selectedId.value))
  const markers = computed<Marker[]>(() => options.stations.value.map((s) => ({ id: s.id, kind: 'station', label: s.name, location: s.location })))
  watch(options.stations, (stations) => {
    if (!stations.some((s) => s.id === selectedId.value)) selectedId.value = stations[0]?.id ?? null
  }, { immediate: true })
  function select(id: string) {
    if (busy.value || mode.value !== 'view') return
    selectedId.value = id
    error.value = ''
  }
  function start(create: boolean) {
    if (busy.value || options.offline.value || (!create && !selected.value)) return
    error.value = ''
    mode.value = create ? 'create' : 'edit'
    draft.value = create ? { name: '', address: '', location: null } : { name: selected.value!.name, address: selected.value!.address ?? '', location: { ...selected.value!.location } }
  }
  function cancel() { if (!busy.value) { mode.value = 'view'; error.value = '' } }
  function pick(location: Location) { if (mode.value !== 'view' && !busy.value && !options.offline.value) draft.value.location = location }
  function askDelete() { if (selected.value && !busy.value && !options.offline.value && mode.value === 'view') confirmingDelete.value = true }
  async function save(): Promise<boolean> {
    if (busy.value || options.offline.value || mode.value === 'view') return false
    error.value = stationDraftError(draft.value)
    if (error.value) return false
    busy.value = true
    try {
      const body: StationCreate = { name: draft.value.name.trim(), address: draft.value.address.trim(), location: { ...draft.value.location! } }
      const saved = mode.value === 'create' ? await createStation(body) : await updateStation(selectedId.value!, body)
      await options.refresh()
      selectedId.value = saved.id
      mode.value = 'view'
      toast('據點已儲存')
      return true
    } catch (e) { error.value = e instanceof MealApiError ? e.message : '儲存失敗，請再試一次'; return false }
    finally { busy.value = false }
  }
  async function remove(): Promise<boolean> {
    confirmingDelete.value = false
    if (!selected.value || busy.value || options.offline.value) return false
    busy.value = true
    error.value = ''
    try {
      await deleteStation(selected.value.id)
      await options.refresh()
      toast('據點已刪除')
      return true
    } catch (e) { error.value = e instanceof MealApiError ? e.message : '刪除失敗，請再試一次'; return false }
    finally { busy.value = false }
  }
  return { selected, selectedId, mode, draft, busy, error, confirmingDelete, elders, markers, select, start, cancel, pick, askDelete, save, remove }
}
