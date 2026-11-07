/**
 * LOGIC LAYER - 志工頁 MR-P04（掃描報到、今天的狀態）與我的任務 MR-P05（取餐、取消、拜訪回報），T-118。
 * 合約 docs/system/11-meal-relay.md v2.2：§2 志工、M8、M9、M11、M13、M15、M17、M18、§7、§9 掃描與斷網。
 *
 * M13：志工畫面只有自己 assigned 任務上的長者；這裡沒有、也不能呼叫任何列出長者的端點。
 * 回報後任務從清單移除，裝置上快取的任務與申請也一起清掉（§9）。
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { featureRoute } from '@/framework'
import { isInApp, request as bridgeRequest } from '@/platform/bridge'
import { readJson, writeJson } from '@/platform/storage'
import {
  MealApiError,
  cancelClaim,
  checkIn,
  currentAccountId,
  getMe,
  imageSrc,
  listMyAssignments,
  listMyClaims,
  listStations,
  pickupClaim,
  reportVisit,
  uploadImage,
  type Assignment,
  type Cached,
  type CheckInResult,
  type Claim,
  type FoodCategory,
  type Me,
  type Station,
  type VisitCreate,
  type VisitKind,
  type VisitResult,
} from '../data'
import { IMAGE_MAX_BYTES, IMAGE_QUALITY_STEPS, base64Bytes, fitSize, isImageMime } from './shared'
import { toast } from './toast'

/** 畫面層（ui/）不能直接匯入 data/（check-arch W1），任務卡用到的型別從這裡轉出去 */
export type { Assignment, Claim, Elder, FoodCategory, Station, VisitKind, VisitResult } from '../data'

/** 任務頁的路由（index.ts：volunteer/tasks） */
export const tasksRoute = featureRoute('meal-relay', 'tasks')
/** 志工頁的路由（index.ts：volunteer） */
export const volunteerRoute = featureRoute('meal-relay', 'volunteer')

/** 掃描畫面最多等多久（使用者要對準或選相簿圖片） */
const __SCAN_TIMEOUT_MS = 5 * 60_000

/** 任務頁的資料來源（食物點來自臺北市開放資料，T-115；長者是模擬資料，ADR-024） */
export const TASK_SOURCE_TEXT =
  '食物點：臺北市銀髮族服務_社區照顧關懷據點、臺北市各級學校分布圖、臺北市固定里民活動場所資料（政府資料開放平臺）；長者為模擬資料'

/** 時間只顯示「時:分」（臺北時間）；格式錯誤回空字串 */
export function clockText(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
}

/* ---------------------------------------------------------------- 掃描與報到（M15） */

/** App 掃描的回傳值 → 要送出的 QR 文字；取消（null）、空白或不是字串一律 null（不送出） */
export function normalizeScan(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  return text ? text : null
}

/** 有沒有 App 的掃描（qr_code_scan）；沒有時畫面改成貼上 QR 文字 */
export function canScan(): boolean {
  return isInApp()
}

/** 開 App 的相機（也可選相簿圖片）掃據點 QR；取消回傳 null（§9、docs/bridge.md qr_code_scan） */
export async function scanQr(): Promise<string | null> {
  if (!isInApp()) return null
  const raw = await bridgeRequest<unknown>('qr_code_scan', null, __SCAN_TIMEOUT_MS)
  return normalizeScan(raw)
}

/** 報到失敗的提示：QR_EXPIRED 請掃最新的 QR（V18）；WRONG_STATION、NOT_FOUND 等顯示後端訊息（§7） */
export function checkinErrorText(e: unknown): string {
  if (e instanceof MealApiError && e.code === 'QR_EXPIRED') return '這個 QR code 已經過期，請掃據點畫面上最新的 QR code'
  return errorText(e)
}

/** 錯誤一律顯示後端回傳的中文訊息（§7）；不是後端錯誤時用通用文字 */
export function errorText(e: unknown): string {
  if (e instanceof MealApiError) return e.message || '發生錯誤，請稍後再試'
  return '發生錯誤，請稍後再試'
}

/** V15：同一志工重複報到拿到同一批任務（回傳的任務都是原本就有的） */
export function isRepeatCheckin(knownIds: readonly string[], result: Pick<CheckInResult, 'assignments'>): boolean {
  return knownIds.length > 0 && result.assignments.every((a) => knownIds.includes(a.id))
}

/* ---------------------------------------------------------------- 任務（M8、M13、M17） */

export type TaskView = {
  id: string
  assignment: Assignment
  /** 還在進行中的送餐申請（listMyClaims 裡的 claimed、delivering）；沒有或已取消 → null */
  claim: Claim | null
  /** 回報用的種類：有進行中的申請 → meal，否則 care（M8：取消後任務保留，只做關懷） */
  kind: VisitKind
  /** 要做的事（畫面顯示）：送餐、關懷 */
  todo: VisitKind[]
  /** 給志工的補充說明；沒有時為空字串 */
  note: string
}

/** 進行中的申請：任務的 claim_id 要在 listMyClaims（只有 claimed、delivering）裡找得到 */
export function activeClaimOf(a: Pick<Assignment, 'claim_id'>, claims: readonly Claim[]): Claim | null {
  if (!a.claim_id) return null
  return claims.find((c) => c.id === a.claim_id && (c.status === 'claimed' || c.status === 'delivering')) ?? null
}

/** 任務卡要顯示的內容（只有 assigned 的任務，M13） */
export function taskViews(assignments: readonly Assignment[], claims: readonly Claim[]): TaskView[] {
  return assignments
    .filter((a) => a.status === 'assigned')
    .map((a) => {
      const claim = activeClaimOf(a, claims)
      const kind: VisitKind = claim ? 'meal' : 'care'
      const todo: VisitKind[] = claim ? (a.needs_care ? ['meal', 'care'] : ['meal']) : ['care']
      let note = ''
      if (a.claim_id && !claim) note = '這份餐已取消，這次只做關懷'
      else if (a.needs_meal && !a.claim_id) note = '這次沒有合適的餐，只做關懷'
      return { id: a.id, assignment: a, claim, kind, todo, note }
    })
}

/** 可以回報了嗎：送餐要先取餐（delivering）；還沒取餐的可以先取餐，或取消這份餐改成只做關懷（M8） */
export function reportReady(task: Pick<TaskView, 'claim'>): boolean {
  return !task.claim || task.claim.status === 'delivering'
}

/* ---------------------------------------------------------------- 拜訪回報（M9、M11） */

/** M11：放門口只限送餐，生鮮蔬果不能放門口（V11 FRESH_CANNOT_LEAVE） */
export function canLeaveAtDoor(kind: VisitKind, category: FoodCategory | undefined): boolean {
  return kind === 'meal' && category !== 'produce'
}

export type ReportForm = {
  result: VisitResult | null
  /** uploadImage 回傳的 id；放門口必填（M11 PHOTO_REQUIRED） */
  photoImageId: string | null
  /** 縮圖網址（給 VisitResultPicker 的 photo-url） */
  photoUrl: string | null
  uploading: boolean
}

export const emptyReportForm = (): ReportForm => ({ result: null, photoImageId: null, photoUrl: null, uploading: false })

/** 送出鍵不能按的原因；可以送出時回空字串 */
export function reportBlockReason(task: Pick<TaskView, 'kind' | 'claim'>, form: ReportForm, offline: boolean): string {
  if (offline) return '目前離線，暫時不能送出'
  if (!form.result) return '請選擇拜訪結果'
  if (form.result === 'left_at_door') {
    if (!canLeaveAtDoor(task.kind, task.claim?.food.category)) return '生鮮蔬果不能放門口，請改選其他結果'
    if (form.uploading) return '照片上傳中…'
    if (!form.photoImageId) return '放門口一定要拍照'
  }
  return ''
}

/** POST /visits 的內容（後端 extra="forbid"：只送需要的欄位） */
export function buildVisit(task: Pick<TaskView, 'assignment' | 'claim' | 'kind'>, form: ReportForm): VisitCreate {
  if (!form.result) throw new Error('沒有選拜訪結果')
  const body: VisitCreate = {
    elder_id: task.assignment.elder_id,
    kind: task.kind,
    result: form.result,
    assignment_id: task.assignment.id,
  }
  if (task.kind === 'meal' && task.claim) body.claim_id = task.claim.id
  if (form.result === 'left_at_door') body.photo_image_id = form.photoImageId
  return body
}

/* ---------------------------------------------------------------- 斷網與快取（ADR-024、§9） */

/** 兩份資料任一份是上次存下的（斷網），就回傳較早的 stale_at */
export function staleOf(...lists: (Cached<unknown> | null | undefined)[]): string | null {
  const times = lists.map((l) => (l as { stale_at?: string } | null | undefined)?.stale_at).filter((t): t is string => !!t)
  return times.length ? times.sort()[0]! : null
}

/**
 * M13、§9：回報後把裝置上存的這個任務與申請清掉，斷網時也不會再顯示這位長者。
 * 快取的鍵照 data/client.ts（`meal-relay.cache.<帳號 id>:<路徑>`）；資料層沒有提供清快取的函數，見 docs/meal-relay/T-118.md。
 */
export async function purgeTaskCache(assignmentId: string, claimId: string | null): Promise<void> {
  const account = await currentAccountId()
  __dropCached<Assignment>(account, '/assignments/mine', (a) => a.id !== assignmentId)
  __dropCached<Claim>(account, '/claims/mine', (c) => c.id !== claimId && c.assignment_id !== assignmentId)
}

function __dropCached<T>(account: string, path: string, keep: (item: T) => boolean): void {
  const key = `meal-relay.cache.${account}:${path}`
  const cached = readJson<{ data: T[]; saved_at: string } | null>(key, null)
  if (!cached || !Array.isArray(cached.data)) return
  writeJson(key, { ...cached, data: cached.data.filter(keep) })
}

/* ---------------------------------------------------------------- 照片（M19） */

/** 門口照片壓到長邊 ≤ 800px、≤ IMAGE_MAX_BYTES，回傳 data URL（POST /images 要完整的 data URL）；太大回 null */
async function __compressPhoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    for (const q of IMAGE_QUALITY_STEPS) {
      const url = canvas.toDataURL('image/jpeg', q)
      if (base64Bytes(url) <= IMAGE_MAX_BYTES) return url
    }
    return null
  } finally {
    bitmap.close()
  }
}

/* ---------------------------------------------------------------- 畫面用的 composable */

function __useNow(): Ref<number> {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 1000)))
  onBeforeUnmount(() => clearInterval(timer))
  return now
}

/** MR-P04 志工頁：掃描報到、今天的狀態（報到的據點、任務數）。沒有長者清單或地圖（M13）。 */
export function useVolunteerPage() {
  const now = __useNow()
  const me = ref<Cached<Me> | null>(null)
  const assignments = ref<Cached<Assignment[]> | null>(null)
  const stations = ref<Station[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const submitting = ref(false)
  const checkinError = ref('')
  const notice = ref('')
  const pasted = ref('')
  /** 這次開啟頁面後報到的結果（不存長者資料）；重新開啟頁面時改由進行中任務的據點推得 */
  const lastCheckin = ref<{ station: Station; checked_in_at: string } | null>(null)
  const scannable = canScan()

  const staleAt = computed(() => staleOf(me.value, assignments.value))
  const offline = computed(() => !!staleAt.value)
  const isVolunteer = computed(() => me.value?.role === 'volunteer')
  const taskCount = computed(() => (assignments.value ?? []).filter((a) => a.status === 'assigned').length)
  const station = computed<Station | null>(() => {
    if (lastCheckin.value) return lastCheckin.value.station
    const first = (assignments.value ?? [])[0]
    return first ? (stations.value.find((s) => s.id === first.station_id) ?? null) : null
  })
  const checkedInAt = computed(() => lastCheckin.value?.checked_in_at ?? null)
  const checkedIn = computed(() => !!lastCheckin.value || taskCount.value > 0)

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      me.value = await getMe()
      if (me.value.role === 'volunteer') {
        assignments.value = await listMyAssignments()
        if (assignments.value.length && !lastCheckin.value) stations.value = await listStations().catch(() => [])
      }
    } catch (e) {
      loadError.value = errorText(e)
    } finally {
      loading.value = false
    }
  }

  /** 送出報到；qrText 為 null（掃描取消）就不送 */
  async function submit(qrText: string | null) {
    if (!qrText || submitting.value) return
    submitting.value = true
    checkinError.value = ''
    notice.value = ''
    const known = (assignments.value ?? []).map((a) => a.id)
    try {
      const result = await checkIn(qrText)
      lastCheckin.value = { station: result.station, checked_in_at: result.checkin.checked_in_at }
      assignments.value = result.assignments
      pasted.value = ''
      notice.value = isRepeatCheckin(known, result)
        ? `你今天已經在${result.station.name}報到過了，任務和剛才一樣，沒有重複派送`
        : result.assignments.length
          ? `已在${result.station.name}報到，派給你 ${result.assignments.length} 件任務`
          : `已在${result.station.name}報到，目前沒有需要服務的長者`
      toast(notice.value)
    } catch (e) {
      checkinError.value = checkinErrorText(e)
      toast(checkinError.value, 'error')
    } finally {
      submitting.value = false
    }
  }

  /** 「掃描報到」：App 的 qr_code_scan；取消就不送出 */
  async function scan() {
    if (submitting.value) return
    checkinError.value = ''
    let text: string | null
    try {
      text = await scanQr()
    } catch {
      checkinError.value = '沒有掃到 QR code，請再試一次'
      return
    }
    await submit(text)
  }

  /** 瀏覽器沒有 App 時：送出貼上的 QR 文字 */
  const submitPasted = () => submit(normalizeScan(pasted.value))

  onMounted(load)
  return {
    now,
    me,
    loading,
    loadError,
    staleAt,
    offline,
    isVolunteer,
    scannable,
    pasted,
    submitting,
    checkinError,
    notice,
    station,
    checkedIn,
    checkedInAt,
    taskCount,
    scan,
    submitPasted,
    reload: load,
  }
}

/** MR-P05 我的任務：只有進行中的任務，取餐、取消、回報；回報後任務消失（M13、V20） */
export function useMyTasks() {
  const now = __useNow()
  const assignments = ref<Cached<Assignment[]> | null>(null)
  const claims = ref<Cached<Claim[]> | null>(null)
  const loading = ref(true)
  const loadError = ref('')
  const busyId = ref<string | null>(null)

  const reportTask = ref<TaskView | null>(null)
  const form = ref<ReportForm>(emptyReportForm())
  const reporting = ref(false)
  const reportError = ref('')

  const staleAt = computed(() => staleOf(assignments.value, claims.value))
  const offline = computed(() => !!staleAt.value)
  const tasks = computed(() => taskViews(assignments.value ?? [], claims.value ?? []))
  const reportOpen = computed({
    get: () => !!reportTask.value,
    set: (v: boolean) => {
      if (!v && !reporting.value) reportTask.value = null
    },
  })
  const blockReason = computed(() => (reportTask.value ? reportBlockReason(reportTask.value, form.value, offline.value) : ''))

  async function load() {
    loading.value = !assignments.value
    loadError.value = ''
    try {
      const [a, c] = await Promise.all([listMyAssignments(), listMyClaims()])
      assignments.value = a
      claims.value = c
    } catch (e) {
      loadError.value = errorText(e)
    } finally {
      loading.value = false
    }
  }

  function __replaceClaim(updated: Claim) {
    const list = (claims.value ?? []).filter((c) => c.id !== updated.id)
    claims.value = updated.status === 'claimed' || updated.status === 'delivering' ? [...list, updated] : list
  }

  /** 取餐：claimed → delivering（M8） */
  async function pickup(task: TaskView) {
    if (!task.claim || busyId.value || offline.value) return
    busyId.value = task.id
    try {
      __replaceClaim(await pickupClaim(task.claim.id))
      toast('已取餐，送到後請回報')
    } catch (e) {
      toast(errorText(e), 'error')
      await load()
    } finally {
      busyId.value = null
    }
  }

  /** 取消這份餐：份數退回，任務保留，可以只做關懷（M8、V7） */
  async function cancel(task: TaskView) {
    if (!task.claim || busyId.value || offline.value) return
    busyId.value = task.id
    try {
      __replaceClaim(await cancelClaim(task.claim.id))
      toast('已取消這份餐，份數已退回；任務還在，可以只做關懷')
    } catch (e) {
      toast(errorText(e), 'error')
      await load()
    } finally {
      busyId.value = null
    }
  }

  function openReport(task: TaskView) {
    if (!reportReady(task)) return
    reportTask.value = task
    form.value = emptyReportForm()
    reportError.value = ''
  }

  /** VisitResultPicker 拍照後：壓縮 → uploadImage（M19）→ 放門口的 photo_image_id（M11） */
  async function attachPhoto(file: File) {
    if (offline.value) return
    reportError.value = ''
    if (!isImageMime(file.type)) {
      reportError.value = '只能用 JPG、PNG 或 WebP 圖片'
      return
    }
    form.value = { ...form.value, uploading: true }
    try {
      const dataUrl = await __compressPhoto(file)
      if (!dataUrl) {
        reportError.value = '照片太大，請靠近一點再拍一次'
        return
      }
      const uploaded = await uploadImage(dataUrl)
      form.value = { ...form.value, photoImageId: uploaded.id, photoUrl: imageSrc(uploaded.image_url) ?? dataUrl }
    } catch (e) {
      reportError.value = e instanceof MealApiError ? errorText(e) : '無法讀取這張照片，請再拍一次'
    } finally {
      form.value = { ...form.value, uploading: false }
    }
  }

  /** 把任務從畫面與裝置快取移除（回報成功，或任務已經不是自己的） */
  async function __dropTask(task: TaskView) {
    assignments.value = (assignments.value ?? []).filter((a) => a.id !== task.id)
    claims.value = (claims.value ?? []).filter((c) => c.assignment_id !== task.id && c.id !== task.assignment.claim_id)
    await purgeTaskCache(task.id, task.assignment.claim_id)
  }

  /** 回報拜訪（M9）：成功後任務消失、快取清掉（M13、V20） */
  async function submitReport() {
    const task = reportTask.value
    if (!task || reporting.value || blockReason.value) return
    reporting.value = true
    reportError.value = ''
    try {
      await reportVisit(buildVisit(task, form.value))
      await __dropTask(task)
      reportTask.value = null
      toast(`已回報${task.assignment.elder.alias}的拜訪，謝謝你`)
      void load() // 重新取得，裝置上的快取也換成最新的
    } catch (e) {
      reportError.value = errorText(e)
      if (e instanceof MealApiError && e.code === 'FRESH_CANNOT_LEAVE') form.value = { ...form.value, result: null } // V11
      if (e instanceof MealApiError && e.code === 'NOT_OWNER') {
        // V20：任務已經不是自己的（已完成或已釋出），從畫面移除
        await __dropTask(task)
        reportTask.value = null
        toast(reportError.value, 'error')
      }
    } finally {
      reporting.value = false
    }
  }

  onMounted(load)
  return {
    now,
    loading,
    loadError,
    staleAt,
    offline,
    tasks,
    busyId,
    pickup,
    cancel,
    reportTask,
    reportOpen,
    form,
    reporting,
    reportError,
    blockReason,
    openReport,
    attachPhoto,
    submitReport,
    reload: load,
  }
}
