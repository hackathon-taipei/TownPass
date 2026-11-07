<script setup lang="ts">
/** @component O02 OsmMap — OpenStreetMap 地圖（斷網時改用隨附的臺北底圖） */
/**
 * OpenStreetMap via Leaflet. Competition rules forbid commercial map SDKs (e.g. Google Maps),
 * so use this component for every map. Attribution must stay visible (OSM licence).
 *
 * Basemap: OSM tiles while online. Offline, or when tiles fail, it switches to maps/taipei.pmtiles,
 * a vector extract shipped with the site. The OSM tile policy forbids downloading their tiles in
 * advance, so the offline map can't be a tile cache.
 *
 * Look: token-coloured pin markers (L.divIcon + inline SVG), a slightly desaturated OSM basemap so
 * the pins stand out, kit-styled zoom buttons / popup / attribution. All Leaflet overrides live in
 * the non-scoped <style> below and are prefixed with the `.tp-map` root class, so nothing leaks.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapMarker = { lat: number; lng: number; label?: string; detail?: string; tone?: 'default' | 'warning' }

const __ATTRIBUTION = '&copy; OpenStreetMap contributors'

/** Teardrop pin, 28×36, tip at (14, 35). Colours come from CSS variables (see <style>). */
const __PIN_SVG =
  '<svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true" focusable="false">' +
  '<path class="tp-map__pin-body" d="M14 1.5C7.1 1.5 1.75 6.9 1.75 13.6 1.75 22.4 14 34.5 14 34.5S26.25 22.4 26.25 13.6C26.25 6.9 20.9 1.5 14 1.5Z"/>' +
  '<circle class="tp-map__pin-dot" cx="14" cy="13.5" r="4.75"/>' +
  '</svg>'

function __iconOf(m: MapMarker): L.DivIcon {
  return L.divIcon({
    className: `tp-map__pin tp-map__pin--${m.tone ?? 'default'}`,
    html: __PIN_SVG,
    iconSize: [28, 36],
    iconAnchor: [14, 35],
    popupAnchor: [0, -32],
  })
}

const props = withDefaults(
  defineProps<{
    center?: [number, number]
    zoom?: number
    markers?: MapMarker[]
    /** zoom to show every marker */
    fit?: boolean
    /** 'offline' always uses the shipped basemap */
    basemap?: 'auto' | 'offline'
  }>(),
  { center: () => [25.0375, 121.5637], zoom: 14, markers: () => [], basemap: 'auto' },
)
const emit = defineEmits<{ markerClick: [marker: MapMarker] }>()

const el = ref<HTMLDivElement>()
let map: L.Map | undefined
let layer: L.LayerGroup | undefined

function drawMarkers() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup(
    props.markers.map((m) =>
      L.marker([m.lat, m.lng], { icon: __iconOf(m), title: m.label ?? '', riseOnHover: true })
        // setAttribute, never innerHTML: the label comes from outside data
        .on('add', (e) => (e.target as L.Marker).getElement()?.setAttribute('aria-label', m.label || '地點'))
        .bindPopup(__popupOf(m), { className: 'tp-map__popup', maxWidth: 240 })
        .on('click', () => emit('markerClick', m)),
    ),
  ).addTo(map)
  if (props.fit && props.markers.length) {
    // the pin is drawn above its point, so leave room for its 36px height at the top
    map.fitBounds(L.latLngBounds(props.markers.map((m) => [m.lat, m.lng])), {
      paddingTopLeft: [28, 48],
      paddingBottomRight: [28, 16],
      maxZoom: 16,
    })
  }
}

/** Built with textContent: labels come from outside data and must never be read as HTML. */
function __popupOf(m: MapMarker): HTMLElement {
  const box = document.createElement('div')
  const title = box.appendChild(document.createElement('strong'))
  title.className = 'tp-map__popup-title'
  title.textContent = m.label ?? ''
  if (m.detail) {
    const detail = box.appendChild(document.createElement('div'))
    detail.className = 'tp-map__popup-detail'
    detail.textContent = m.detail
  }
  return box
}

let onlineLayer: L.TileLayer | undefined
let usingOffline = false

async function useOfflineBasemap() {
  if (usingOffline || !map) return
  usingOffline = true
  onlineLayer?.remove()
  // protomaps-leaflet extends the global L, so it has to exist before the library loads
  ;(window as unknown as { L: typeof L }).L = L
  const { leafletLayer } = await import('protomaps-leaflet')
  if (!map) return
  const layer = leafletLayer({
    url: `${import.meta.env.BASE_URL}maps/taipei.pmtiles`,
    flavor: 'light',
    lang: 'zh',
    maxDataZoom: 14,
    attribution: `${__ATTRIBUTION} &middot; Protomaps`,
  }) as unknown as L.Layer
  layer.addTo(map)
}

function useOnlineBasemap() {
  onlineLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: __ATTRIBUTION,
    // only this layer gets the calmer filter (see <style>); the offline layer is left as is
    className: 'tp-map__osm',
  })
  onlineLayer.on('tileerror', () => void useOfflineBasemap())
  onlineLayer.addTo(map!)
}

onMounted(() => {
  map = L.map(el.value!, {
    // On phones a one-finger drag should scroll the page, not trap the user in the map.
    // Pinch-zoom and the +/- buttons still work.
    dragging: !L.Browser.mobile,
    scrollWheelZoom: false,
    zoomControl: false,
  }).setView(props.center, props.zoom)
  // Leaflet copies these titles into aria-label
  L.control.zoom({ position: 'bottomright', zoomInTitle: '放大', zoomOutTitle: '縮小' }).addTo(map)
  map.on('popupopen', (e) => {
    const close = e.popup.getElement()?.querySelector('.leaflet-popup-close-button')
    close?.setAttribute('aria-label', '關閉')
    close?.setAttribute('title', '關閉')
  })
  if (props.basemap === 'offline' || !navigator.onLine) void useOfflineBasemap()
  else useOnlineBasemap()
  drawMarkers()
})
watch(() => props.markers, drawMarkers, { deep: true })
watch(() => props.center, (c) => map?.setView(c))
onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <!-- isolate: Leaflet panes use z-index 400+, keep them below sticky headers/bars -->
  <div ref="el" class="tp-map isolate h-64 w-full overflow-hidden rounded-xl shadow-card ring-1 ring-grey-100" />
</template>

<style>
/* Leaflet overrides, scoped by the .tp-map root class. Colours: tokens only (var(--color-*)). */
.tp-map.leaflet-container {
  font-family: var(--font-sans);
  background: var(--color-grey-50);
}

/* calmer online basemap so the pins stand out */
.tp-map .tp-map__osm {
  filter: saturate(0.65) brightness(1.03);
}

/* pins */
.tp-map .tp-map__pin {
  background: none;
  border: 0;
  --pin-fill: var(--color-primary-500);
  --pin-stroke: var(--color-primary-700);
}
.tp-map .tp-map__pin--warning {
  --pin-fill: var(--color-orange-500);
  --pin-stroke: var(--color-orange-700);
}
.tp-map .tp-map__pin svg {
  display: block;
  overflow: visible;
  filter: drop-shadow(0 2px 2px color-mix(in srgb, var(--color-grey-900) 30%, transparent));
  transition: transform 0.15s ease;
  transform-origin: 50% 100%;
}
.tp-map .tp-map__pin:hover svg,
.tp-map .tp-map__pin:focus-visible svg {
  transform: scale(1.1);
}
.tp-map .tp-map__pin:focus-visible {
  outline: none;
}
.tp-map .tp-map__pin:focus-visible .tp-map__pin-body {
  stroke: var(--color-grey-900);
}
.tp-map .tp-map__pin-body {
  fill: var(--pin-fill);
  stroke: var(--pin-stroke);
  stroke-width: 1.5;
}
.tp-map .tp-map__pin-dot {
  fill: var(--color-white);
}

/* zoom control: white rounded buttons, card shadow, 36px touch targets */
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

/* popup */
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

/* attribution: smaller but still visible (OSM licence) */
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
