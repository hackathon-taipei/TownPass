<script setup lang="ts">
/** @component MR-C07 MapView — 鄰食地圖：定位針依狀態上色、落下／換色脈衝／淡出動畫、可選點 */
/**
 * MapView — 鄰食轉運站地圖（型別與顏色見 ../logic/mapMarker.ts，對齊 docs/system/11-meal-relay.md v2.2）。
 * 長者定位針（kind: 'elder'）只放在管理系統看板與志工自己的任務（M13）；志工畫面不能出現長者清單（ADR-026）。
 * 合約沒有志工位置的 API，所以地圖上沒有志工。
 *
 *   markers: Marker[]                       // { id, kind, location, status?, label? }
 *   center?: Location                       // 指定時移到這裡；沒指定時第一次載入縮放到所有定位針
 *   onPick?: (location: Location) => void   // 有傳才允許點選位置（@pick 與 :on-pick 等同）
 *   picked?: Location | null                // 目前選取的位置（由父層控制）
 *
 * 動畫（ANIMATION.md §5.6）：依 Marker.id 比對差異，新增→落下、狀態改變→換色＋脈衝環一次、移除→淡出縮小。
 * 輪詢更新時不會自動移動或縮放地圖。MapView 不呼叫任何 API（ARCHITECTURE §3）。
 * 底圖：隨附的大臺北向量底圖（public/maps/taipei.pmtiles），縮小時精簡路名，斷網可用。比賽規則不可用 Google Maps。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Feature, LabelRule } from 'protomaps-leaflet'
import './motion.css'
import { MOTION, replayClass } from '../logic/motion'
import { MAP_STATUS_LABEL, MARKER_KIND_LABEL, pinColorOf, type Location, type Marker, type MarkerKind } from '../logic/mapMarker'

const props = defineProps<{
  markers: Marker[]
  center?: Location
  onPick?: (location: Location) => void
  picked?: Location | null
}>()

const __ATTRIBUTION = '&copy; OpenStreetMap contributors'
const __TAIPEI: L.LatLngTuple = [25.0375, 121.5637]

/** 每種 kind 的小圖示，畫在 28×36 定位針的圓頭裡（中心約 14, 13.5） */
const __GLYPH: Record<MarkerKind | 'picked', string> = {
  supplier: '<path class="tp-map__pin-glyph" d="M8.4 9.2h11.2l-1.1 3.3H9.5z M9.8 13.4h8.4v5.2H9.8z"/>', // 店面
  station: '<path class="tp-map__pin-glyph" d="M14 7.9l6 5.1v5.7H8v-5.7z"/>', // 房子
  elder:
    '<circle class="tp-map__pin-glyph" cx="14" cy="10.4" r="2.7"/>' +
    '<path class="tp-map__pin-glyph" d="M9 18.7c0-3 2.2-5.1 5-5.1s5 2.1 5 5.1z"/>', // 人像
  point: '<path class="tp-map__pin-glyph" d="M8.2 8.6h11.6v2H8.2z M8.9 11.6h10.2v6.8H8.9z"/>', // 餐盒（食物點）
  picked: '<circle class="tp-map__pin-glyph" cx="14" cy="13.5" r="4.5"/>',
}

function __pinHtml(glyph: string): string {
  return (
    '<svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true" focusable="false">' +
    '<circle class="tp-map__pin-ring" cx="14" cy="13.6" r="11.5"/>' +
    '<path class="tp-map__pin-body" d="M14 1.5C7.1 1.5 1.75 6.9 1.75 13.6 1.75 22.4 14 34.5 14 34.5S26.25 22.4 26.25 13.6C26.25 6.9 20.9 1.5 14 1.5Z"/>' +
    glyph +
    '</svg>'
  )
}

function __icon(className: string, glyph: string): L.DivIcon {
  return L.divIcon({ className, html: __pinHtml(glyph), iconSize: [28, 36], iconAnchor: [14, 35], popupAnchor: [0, -32] })
}

const __statusText = (m: Marker) => (m.status ? MAP_STATUS_LABEL[m.status] : '')
const __aria = (m: Marker) => [m.label ?? MARKER_KIND_LABEL[m.kind], __statusText(m)].filter(Boolean).join('，')
/** 說明框：名稱（沒有就用種類）＋種類・狀態。用 textContent，不用 innerHTML。 */
function __popupOf(m: Marker): HTMLElement {
  const box = document.createElement('div')
  const title = box.appendChild(document.createElement('strong'))
  title.className = 'tp-map__popup-title'
  title.textContent = m.label ?? MARKER_KIND_LABEL[m.kind]
  const detail = box.appendChild(document.createElement('div'))
  detail.className = 'tp-map__popup-detail'
  detail.textContent = [MARKER_KIND_LABEL[m.kind], __statusText(m)].filter(Boolean).join('・')
  return box
}

const el = ref<HTMLDivElement>()
let map: L.Map | undefined
let fitted = false

/* ---- 定位針：依 id 差異更新（ANIMATION §5.6 實作要求 1、2） ---- */
type Entry = { marker: L.Marker; data: Marker }
const entries = new Map<string, Entry>()
const __COLOR_CLASSES = ['yellow', 'blue', 'green', 'red', 'grey', 'default'].map((c) => `tp-map__pin--${c}`)

function __classOf(m: Marker) {
  return `tp-map__pin tp-map__pin--${pinColorOf(m.status)}`
}

function __add(m: Marker, animate: boolean) {
  const marker = L.marker([m.location.lat, m.location.lng], {
    icon: __icon(`${__classOf(m)}${animate ? ' tp-map__pin--enter' : ''}`, __GLYPH[m.kind]),
    title: __aria(m),
    riseOnHover: true,
  })
    .bindPopup(__popupOf(m), { className: 'tp-map__popup', maxWidth: 240 })
    .addTo(map!)
  marker.getElement()?.setAttribute('aria-label', __aria(m))
  entries.set(m.id, { marker, data: m })
}

function __update(entry: Entry, m: Marker) {
  const prev = entry.data
  entry.data = m
  if (prev.location.lat !== m.location.lat || prev.location.lng !== m.location.lng) {
    entry.marker.setLatLng([m.location.lat, m.location.lng])
  }
  if (prev.kind !== m.kind) {
    // 種類變了（很少見）：換圖示，視為新的定位針
    entry.marker.setIcon(__icon(__classOf(m), __GLYPH[m.kind]))
  } else if (prev.status !== m.status) {
    // 只換 class，不重建元素：顏色平滑過渡，再播一次脈衝環
    const node = entry.marker.getElement()
    node?.classList.remove(...__COLOR_CLASSES)
    node?.classList.add(`tp-map__pin--${pinColorOf(m.status)}`)
    replayClass(node, 'tp-map__pin--changed')
  }
  if (prev.status !== m.status || prev.label !== m.label || prev.kind !== m.kind) {
    entry.marker.setPopupContent(__popupOf(m))
    entry.marker.getElement()?.setAttribute('aria-label', __aria(m))
    entry.marker.getElement()?.setAttribute('title', __aria(m))
  }
}

function __remove(id: string) {
  const entry = entries.get(id)
  if (!entry) return
  entries.delete(id)
  entry.marker.getElement()?.classList.add('tp-map__pin--leave')
  setTimeout(() => entry.marker.remove(), MOTION.base)
}

function syncMarkers() {
  if (!map) return
  const firstLoad = !fitted
  const next = new Set(props.markers.map((m) => m.id))
  for (const id of [...entries.keys()]) if (!next.has(id)) __remove(id)
  for (const m of props.markers) {
    const entry = entries.get(m.id)
    if (entry) __update(entry, m)
    else __add(m, true) // 第一次載入：全部同時落下；之後：只有新的落下
  }
  // 只在第一次載入時調整視野；輪詢更新不移動地圖（ANIMATION §5.6 實作要求 3）
  if (firstLoad && props.markers.length) {
    fitted = true
    if (props.center) map.setView([props.center.lat, props.center.lng], 15)
    else
      map.fitBounds(L.latLngBounds(props.markers.map((m) => [m.location.lat, m.location.lng])), {
        paddingTopLeft: [28, 48],
        paddingBottomRight: [28, 16],
        maxZoom: 16,
      })
  }
}

/* ---- 選點 ---- */
let pickedMarker: L.Marker | undefined
function drawPicked(loc: Location | null | undefined) {
  if (!map) return
  if (!loc) {
    pickedMarker?.remove()
    pickedMarker = undefined
    return
  }
  if (pickedMarker) pickedMarker.remove() // 換位置：舊的直接移除
  pickedMarker = L.marker([loc.lat, loc.lng], {
    icon: __icon('tp-map__pin tp-map__pin--picked tp-map__pin--enter tp-map__pin--changed', __GLYPH.picked),
    title: '選擇的位置',
    keyboard: false,
    interactive: false,
  }).addTo(map)
}

function onMapClick(e: L.LeafletMouseEvent) {
  if (!props.onPick) return
  const location: Location = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }
  if (props.picked === undefined) drawPicked(location) // 父層沒控制 picked 時自己畫
  props.onPick(location)
}

/* ---- 底圖：隨附向量底圖，縮小時精簡路名 ---- */
const __MAIN_ROADS = new Set(['motorway', 'trunk', 'primary'])
const __PLACE_MINZOOM: Record<string, number> = { village: 15, hamlet: 16, locality: 16, isolated_dwelling: 16 }
const __kind = (f: Feature, key = 'kind') => String(f.props[key] ?? '')
const __district = (f: Feature) => __kind(f) === 'neighbourhood' && __kind(f, 'kind_detail') === 'suburb'
const __mainRoad = (f: Feature) =>
  __kind(f) === 'highway' || __MAIN_ROADS.has(__kind(f, 'kind_detail').replace(/_link$/, ''))

function __thinLabels(rules: LabelRule[]): LabelRule[] {
  const takes = (r: LabelRule, layer: string, kind: string) =>
    r.dataLayer === layer && (r.filter?.(16, { props: { kind } } as unknown as Feature) ?? false)
  const out: LabelRule[] = []
  let roadsDone = false
  for (const r of rules) {
    const keep = r.filter ?? (() => true)
    if (takes(r, 'roads', 'major_road') || takes(r, 'roads', 'highway')) {
      if (roadsDone) continue
      roadsDone = true
      out.push({ ...r, filter: (z, f) => keep(z, f) && (z >= 15 || __mainRoad(f)) })
    } else if (takes(r, 'roads', 'minor_road')) {
      out.push({ ...r, minzoom: Math.max(r.minzoom ?? 0, 16) })
      out.push({ ...r, minzoom: 15, filter: (_z, f) => __kind(f) === 'medium_road' })
    } else if (takes(r, 'places', 'locality')) {
      out.push({ ...r, filter: (z, f) => keep(z, f) && z >= (__PLACE_MINZOOM[__kind(f, 'kind_detail')] ?? 0) })
      if (r.minzoom !== undefined && r.maxzoom === undefined) {
        out.push({ ...r, minzoom: 12, filter: (_z, f) => __district(f) })
      }
    } else {
      out.push(r)
    }
  }
  return out
}

async function useVectorBasemap() {
  if (!map) return
  ;(window as unknown as { L: typeof L }).L = L // protomaps-leaflet 會擴充全域 L
  const { leafletLayer } = await import('protomaps-leaflet')
  if (!map) return
  const base = leafletLayer({
    url: `${import.meta.env.BASE_URL}maps/taipei.pmtiles`,
    flavor: 'light',
    lang: 'zh',
    maxDataZoom: 14,
    maxZoom: 18,
    attribution: `${__ATTRIBUTION} &middot; Protomaps`,
  })
  base.labelRules = __thinLabels(base.labelRules)
  base.clearLayout()
  ;(base as unknown as L.Layer).addTo(map)
}

onMounted(() => {
  map = L.map(el.value!, {
    // 像 Google 地圖：電腦拖曳移動、滾輪縮放；手機單指移動、雙指縮放
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: true,
    zoomControl: false,
  }).setView(props.center ? [props.center.lat, props.center.lng] : __TAIPEI, 14)
  L.control.zoom({ position: 'bottomright', zoomInTitle: '放大', zoomOutTitle: '縮小' }).addTo(map)
  map.on('popupopen', (e) => {
    const close = e.popup.getElement()?.querySelector('.leaflet-popup-close-button')
    close?.setAttribute('aria-label', '關閉')
    close?.setAttribute('title', '關閉')
  })
  map.on('click', onMapClick)
  void useVectorBasemap()
  syncMarkers()
  drawPicked(props.picked)
})
watch(() => props.markers, syncMarkers, { deep: true })
watch(
  () => props.center && [props.center.lat, props.center.lng],
  (c) => c && map?.setView(c as L.LatLngTuple),
)
watch(
  () => props.picked && [props.picked.lat, props.picked.lng],
  () => drawPicked(props.picked),
)
watch(
  () => props.onPick,
  (pick) => !pick && props.picked === undefined && drawPicked(null),
)
onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="relative">
    <!-- isolate：Leaflet 的圖層 z-index 400 起跳，讓它留在頁首、底部按鈕下面 -->
    <div
      ref="el"
      class="tp-map isolate h-64 w-full overflow-hidden rounded-xl shadow-card ring-1 ring-grey-100"
      :class="{ 'tp-map--picking': !!onPick }"
    />
    <Transition name="fade-up">
      <p
        v-if="onPick"
        class="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium text-primary-700 shadow-card"
      >
        點地圖選擇位置
      </p>
    </Transition>
  </div>
</template>

<style>
/* 地圖外框、控制鈕、說明框。定位針與動畫在 motion.css。顏色只用 token。 */
.tp-map.leaflet-container {
  font-family: var(--font-sans);
  background: var(--color-grey-50);
}
.tp-map.tp-map--picking.leaflet-container {
  cursor: crosshair;
}
.tp-map .leaflet-bar,
.tp-map.leaflet-touch .leaflet-bar {
  border: 0;
  border-radius: 0.5rem;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  background-clip: border-box;
}
.tp-map .leaflet-bar a,
.tp-map.leaflet-touch .leaflet-bar a {
  width: 36px;
  height: 36px;
  line-height: 36px;
  font-size: 20px;
  font-weight: 500;
  color: var(--color-primary-700);
  background: var(--color-white);
  border-bottom: 1px solid var(--color-grey-100);
  border-radius: 0;
}
.tp-map .leaflet-bar a:last-child {
  border-bottom: 0;
}
.tp-map .leaflet-bar a:hover,
.tp-map .leaflet-bar a:focus-visible {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}
.tp-map .leaflet-bar a:active {
  background: var(--color-primary-100);
}
.tp-map .leaflet-bar a.leaflet-disabled {
  color: var(--color-grey-300);
  background: var(--color-white);
}
.tp-map .leaflet-bottom.leaflet-right .leaflet-control-zoom {
  margin: 0 10px 24px 0;
}
.tp-map .tp-map__popup .leaflet-popup-content-wrapper {
  border-radius: 0.75rem;
  box-shadow: var(--shadow-card);
  background: var(--color-white);
  padding: 0;
}
.tp-map .tp-map__popup .leaflet-popup-content {
  margin: 12px 36px 12px 14px;
  font-family: var(--font-sans);
  line-height: 1.4;
}
.tp-map .tp-map__popup .leaflet-popup-tip {
  background: var(--color-white);
  box-shadow: var(--shadow-card);
}
.tp-map .tp-map__popup-title {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-grey-900);
}
.tp-map .tp-map__popup-detail {
  margin-top: 2px;
  font-size: 0.875rem;
  color: var(--color-grey-600);
}
.tp-map .tp-map__popup a.leaflet-popup-close-button {
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  font: 400 20px/28px var(--font-sans);
  color: var(--color-grey-400);
  border-radius: 9999px;
}
.tp-map .tp-map__popup a.leaflet-popup-close-button:hover,
.tp-map .tp-map__popup a.leaflet-popup-close-button:focus-visible {
  color: var(--color-grey-700);
  background: var(--color-grey-50);
}
.tp-map .leaflet-control-attribution {
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 6px;
  color: var(--color-grey-700);
  background: color-mix(in srgb, var(--color-white) 75%, transparent);
  border-top-left-radius: 0.375rem;
}
.tp-map .leaflet-control-attribution a {
  color: var(--color-primary-700);
}
</style>
