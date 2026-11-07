/**
 * MR-P07 據點頁的邏輯（T-119）：定時更新的報到 QR、倒數、今天報到。
 * 合約 docs/system/11-meal-relay.md v2.2：§2 據點、§5 QR_ROTATE_SEC、M15、§8 getMyStation、§9；斷網 ADR-024。
 *
 * 取得時機（M15）：
 *   - 平常每 STATION_POLL_MS 取一次（今天報到的清單要即時；正式版的 QR 30 分鐘才換一次）
 *   - 到期前 QR_REFRESH_LEAD_MS（約 3 秒）再取一次：先確認連線還在，斷了就在 QR 過期前收起來
 *   - 後端只在時間窗結束後才給新的 token，所以到期後 QR_SWAP_DELAY_MS 再取一次換成新的 QR
 * 取得失敗或只拿到裝置上的舊資料（stale_at）：不顯示 QR（「連線中斷，QR 無法更新」），每 QR_RETRY_MS 自動重試。
 */
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import { getMyStation, MealApiError } from '../data'
import type { Cached, Checkin, MyStation } from '../data'

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），型別從這裡轉出去 */
export type { Checkin, MyStation, Station } from '../data/types'

/* ---------------------------------------------------------------- 設定 */

/** M15：到期前約 3 秒重新取得 */
export const QR_REFRESH_LEAD_MS = 3_000
/** M15：時間窗結束後多久取新的 QR（後端要等時間窗結束才換 token） */
export const QR_SWAP_DELAY_MS = 300
/**
 * 換 QR 時，舊 QR 在到期後最多再留多久（等新的 QR 回來，避免閃白）。
 * 後端也接受前一個時間窗的 token（M15），所以這段時間掃舊 QR 仍能報到；超過就收起來。
 */
export const QR_SWAP_GRACE_MS = 2_000
/** 平常多久取一次（更新今天報到） */
export const STATION_POLL_MS = 10_000
/** 取得失敗後多久自動重試 */
export const QR_RETRY_MS = 5_000
/** 兩次取得之間最少隔多久（裝置時鐘不準時避免一直打 API） */
export const STATION_MIN_DELAY_MS = 1_000
/** 倒數更新頻率 */
export const STATION_TICK_MS = 250

export const QR_OFFLINE_TEXT = '連線中斷，QR 無法更新'
export const QR_RETRYING_TEXT = '正在自動重新連線…'

/* ---------------------------------------------------------------- 純函數 */

function __ms(iso: string | null | undefined): number {
  if (!iso) return Number.NaN
  return Date.parse(iso)
}

/** 到 expiresAt 還剩幾秒（無條件進位；已過或格式錯誤是 0） */
export function qrSecondsLeft(expiresAt: string | null | undefined, now: number): number {
  const end = __ms(expiresAt)
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - now) / 1000))
}

/** 倒數的大字與單位：60 秒內「28」＋「秒後更新」；更久（正式版 30 分鐘）「29:59」＋「後更新」 */
export function qrCountdownParts(seconds: number): { value: string; unit: string } {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return { value: String(s), unit: '秒後更新' }
  const m = Math.floor(s / 60)
  return { value: `${m}:${String(s % 60).padStart(2, '0')}`, unit: '後更新' }
}

/** 下一次取得要等多久（ms）。expiresAt 是目前 QR 的到期時間（ms）。 */
export function nextFetchDelay(expiresAt: number, now: number): number {
  if (Number.isNaN(expiresAt)) return QR_RETRY_MS
  const lead = expiresAt - QR_REFRESH_LEAD_MS
  const swap = expiresAt + QR_SWAP_DELAY_MS
  // 還沒到「到期前 3 秒」→ 等到那時；已過 → 等到期後換新的 QR；連那都過了（裝置時鐘快）→ 盡快再取
  const target = now < lead ? lead : now < swap ? swap : now
  return Math.max(STATION_MIN_DELAY_MS, Math.min(target - now, STATION_POLL_MS))
}

/** 今天報到，新的在上（§9） */
export function checkinsNewestFirst(list: readonly Checkin[]): Checkin[] {
  return [...list].sort((a, b) => (__ms(b.checked_in_at) || 0) - (__ms(a.checked_in_at) || 0))
}

/** 報到時間「14:05」（臺北時間 +08:00，§8「今天」的判斷基準） */
export function checkinTimeText(iso: string): string {
  const t = __ms(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t + 8 * 3_600_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** QR 的 SVG 資料：size 是模組數，path 是所有深色模組（同一列相連的合成一段），四周留 4 格空白 */
export interface QrSvg {
  size: number
  viewBox: string
  path: string
}

/** 用已安裝的 qrcode（MIT）把 qr_text 轉成 SVG path；同樣的文字回傳同樣的結果 */
export function qrSvg(text: string): QrSvg {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules
  const parts: string[] = []
  for (let y = 0; y < size; y++) {
    let x = 0
    while (x < size) {
      if (!data[y * size + x]) {
        x++
        continue
      }
      const start = x
      while (x < size && data[y * size + x]) x++
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`)
    }
  }
  const quiet = 4
  return { size, viewBox: `${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`, path: parts.join('') }
}

/** 讀取失敗要不要自動重試：斷網（OFFLINE）或伺服器錯誤要；權限、找不到這類錯誤重試也沒用 */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof MealApiError)) return true
  return e.status === 0 || e.status >= 500
}

/* ---------------------------------------------------------------- 據點頁 */

/**
 * 據點頁的狀態。頁面在 onMounted 呼叫 start()；元件卸載（effect scope 結束）時自動 stop()。
 *
 *   const s = useStation()
 *   onMounted(s.start)
 */
export function useStation() {
  const now = ref(Date.now())
  /** 最近一次拿到的資料（可能是裝置上的舊資料，帶 stale_at） */
  const data = shallowRef<Cached<MyStation> | null>(null)
  const loading = ref(true)
  /** 最近一次取得失敗，或只拿到裝置上的舊資料 */
  const failed = ref(false)
  /** 重試也沒用的錯誤（例如這個帳號不是據點）：後端回傳的中文訊息（§7） */
  const errorMessage = ref<string | null>(null)
  /** 最近一次成功取得的時間（斷網但裝置上沒有存資料時給 StaleBanner 用） */
  const lastOkAt = ref<string | null>(null)
  /** 一個時間窗多長（ms）：用連續兩個 QR 的到期時間差估計，給倒數條用 */
  const periodMs = ref(0)
  let periodGuessed = true

  let running = false
  let seq = 0
  let inflight = false
  let fetchTimer: ReturnType<typeof setTimeout> | undefined
  let tickTimer: ReturnType<typeof setInterval> | undefined

  const expiresAt = computed(() => __ms(data.value?.qr_expires_at))

  /** 現在可以顯示的 QR 文字；斷網、舊資料、過期都回 null（不顯示會過期的舊 QR） */
  const qrText = computed<string | null>(() => {
    const d = data.value
    if (!d || failed.value || d.stale_at || errorMessage.value) return null
    if (Number.isNaN(expiresAt.value) || now.value >= expiresAt.value + QR_SWAP_GRACE_MS) return null
    return d.qr_text
  })
  const secondsLeft = computed(() => (qrText.value ? qrSecondsLeft(data.value?.qr_expires_at, now.value) : 0))
  /** 倒數條：剩下的比例 0～1 */
  const fraction = computed(() => {
    if (!qrText.value || periodMs.value <= 0) return 0
    return Math.min(1, Math.max(0, (expiresAt.value - now.value) / periodMs.value))
  })
  /** 斷網中（會自動重試） */
  const offline = computed(() => !loading.value && !errorMessage.value && (failed.value || !!data.value?.stale_at))
  /** 給 StaleBanner：斷網時顯示上次成功的時間 */
  const staleAt = computed(() => (offline.value ? (data.value?.stale_at ?? lastOkAt.value) : null))
  const station = computed(() => data.value?.station ?? null)
  const checkins = computed(() => checkinsNewestFirst(data.value?.checkins ?? []))

  function __schedule(delay: number) {
    clearTimeout(fetchTimer)
    if (running) fetchTimer = setTimeout(() => void refresh(), delay)
  }

  function __updatePeriod(prev: number, next: number, t: number) {
    if (Number.isNaN(next)) return
    const diff = next - prev
    if (!Number.isNaN(prev) && diff > 0) {
      // 連續兩個時間窗的到期差＝時間窗長度；斷線跳過幾個窗時差會變大，所以取小的
      periodMs.value = periodGuessed ? diff : Math.min(periodMs.value, diff)
      periodGuessed = false
    } else if (periodMs.value <= 0) {
      periodMs.value = Math.max(1_000, next - t) // 第一次只能先用剩下的時間
    }
  }

  /** 取一次 GET /stations/mine，再排下一次 */
  async function refresh(): Promise<void> {
    if (inflight) return
    inflight = true
    const mine = ++seq
    let delay = QR_RETRY_MS
    try {
      const res = await getMyStation()
      if (mine !== seq) return
      const t = Date.now()
      if (res.stale_at) {
        // ADR-024：裝置上的舊資料只用來顯示今天報到，QR 不顯示
        data.value = res
        failed.value = true
      } else {
        __updatePeriod(expiresAt.value, __ms(res.qr_expires_at), t)
        data.value = res
        failed.value = false
        errorMessage.value = null
        lastOkAt.value = new Date(t).toISOString()
        delay = nextFetchDelay(__ms(res.qr_expires_at), t)
      }
    } catch (e) {
      if (mine !== seq) return
      if (isRetryable(e)) {
        failed.value = true
      } else {
        errorMessage.value = e instanceof Error && e.message ? e.message : '無法取得據點資料'
        delay = -1 // 不自動重試，等使用者按「重試」
      }
    } finally {
      if (mine === seq) {
        inflight = false
        loading.value = false
        now.value = Date.now()
        if (delay >= 0) __schedule(delay)
      }
    }
  }

  function __onVisible() {
    // App 在背景時計時器可能暫停；回到前景立刻重新取得
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') retry()
  }

  function start() {
    if (running) return
    running = true
    now.value = Date.now()
    tickTimer = setInterval(() => (now.value = Date.now()), STATION_TICK_MS)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', __onVisible)
    void refresh()
  }

  function stop() {
    running = false
    seq++ // 進行中的請求回來後不再更新畫面
    inflight = false
    clearTimeout(fetchTimer)
    clearInterval(tickTimer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', __onVisible)
  }

  /** 立刻重新取得（「重試」按鈕、回到前景） */
  function retry() {
    if (!running) return
    seq++
    inflight = false
    clearTimeout(fetchTimer)
    void refresh()
  }

  if (getCurrentScope()) onScopeDispose(stop)

  return {
    now,
    loading,
    station,
    qrText,
    secondsLeft,
    fraction,
    checkins,
    offline,
    staleAt,
    errorMessage,
    start,
    stop,
    retry,
  }
}
