# 鄰食轉運站 介面元件與動畫（MR-C07～MR-C23）

地圖、按鈕、清單與所有動畫的共用元件，給 MR-P01～P08 的頁面直接組合。對齊合約 [11-meal-relay.md](../system/11-meal-relay.md) **v2.2**（ADR-026：長者不使用 App、沒有手動申請、志工只看得到派給自己的長者）與[字詞表](../system/03-glossary.md)。
元件都**不呼叫 API**，只吃資料；頁面用 `data/` 取資料後傳進來。ui/ 不能直接匯入 `data/`（check-arch W1），型別從 `logic/mealLabels.ts` 匯入。

## 1. 元件

| 編號 | 元件 | 用途 | 傳入 | 對應的端點 |
|---|---|---|---|---|
| MR-C07 | `MapView` | 地圖：食物點、長者、據點的定位針；選點；拖曳、滾輪、雙指縮放。**長者定位針只用在管理系統看板與志工自己的任務（M13）**，志工畫面不能出現長者清單；合約沒有志工位置，所以地圖上沒有志工 | `markers`、`center?`、`on-pick?`、`picked?` | `listPoints`、`getBoard`、`listElders`（管理員）、`listMyAssignments`（志工自己的任務）；選點後 `createElder`（管理員）、`createPoint`、`applySupplier` |
| MR-C08 | `TabBar` | 分頁列 | `v-model`、`tabs` | — |
| MR-C09 | `BottomSheet` | 底部面板 | `v-model`、`title` | 拜訪回報 `reportVisit` |
| MR-C10 | `SubmitButton` | 送出按鈕：送出中停用，超過 300ms 才轉圈 | `loading`、`disabled` | 所有寫入 |
| MR-C11 | `QtyInput` | 份數輸入框：只收 `min`～`max` 的整數；低於下限顯示「不能少於已派出＋已送達的 N 份」 | `v-model`、`min?`（預設 1；改份數時傳 `dispatched_qty + delivered_qty`，M14）、`max?`（預設 999）、`server-error?` | `createFood`、`updateFood`（`QTY_BELOW_USED`） |
| MR-C12 | `ToastHost` | 提示訊息（`toast('…')`、`toast(message, 'error')`） | — | 所有寫入的成功與錯誤 |
| MR-C13 | `StatCard` | 統計卡 | `label`、`value`、`tone?` | `getBoard` 的 `stats` |
| MR-C14 | `FoodRow` | 食物列：剩餘、派出中、已送達三個數字（M1）平滑變化 | `food`、`now`（頁面每秒更新一次） | `listFoods` |
| MR-C15 | `ClaimRow` | 申請列（志工只看得到自己的 `claimed`、`delivering`，M13） | `claim` | `listMyClaims` |
| MR-C16 | `AllergenWarning` | 過敏原衝突警告 | 食物與長者的 `allergens`、名稱、`v-model:conflict` | `pickupClaim` 前檢查 |
| MR-C17 | `VisitResultPicker` | 拜訪結果三選一＋放門口拍照 | `v-model`、`kind`、`category`、`photo-url`、`@photo` | `uploadImage` → `reportVisit` |
| MR-C18 | `SupplierGate` | 提供者申請 → 審核中 → 提供者頁；申請人是一般市民（`citizen`） | `supplier`、`#apply` 插槽、預設插槽 | `applySupplier`、`getMySupplier` |
| MR-C19 | `ReviewList` | 審核清單；項目有 `photo` 時左側放店面照片縮圖（MR-C57，ADR-029） | `items`（`{id, name, detail?, photo?}`）、`on-decide` | `reviewSupplier`、`listSuppliers` |
| MR-C20 | `AllergenChips` | 過敏原晶片勾選（11 類） | `v-model` | `createElder`、`updateElder`（管理員）、`createFood` |
| MR-C21 | `PageTransition` | 載入骨架、換頁、重置後淡出淡入 | `loading`、`page-key`、`variant` | `getMe`、`resetDemo` |
| MR-C22 | `ResetDemoButton` | 重置示範資料 | `on-reset`、`@done` | `resetDemo` |
| MR-C23 | `VolunteerAvatar` | 志工的企鵝頭像：依志工 id 固定分到 6 隻之一，可輕輕搖擺 | `id`、`name?`、`size?`（預設 40）、`idle?`（預設 true） | 據點頁今天報到（`getMyStation` 的 `checkins`）、志工頁 |
| MR-C57 | `PlacePhoto` | 地點照片縮圖（入口、店面）：點一下用 MR-C09 底部面板放大；圖片讀不到就整個隱藏（T-128，ADR-028；T-129，ADR-029） | `photo`（`logic/placePhoto.ts` 的 `PlacePhoto`：`src`、`alt`、`title`）、`size?`（`sm` 48px 方形，預設；`md` 滿版寬、高 128px） | 志工任務卡的取餐地點（`Food.point_image_url`）、首頁據點清單（`Station.image_url`）、審核清單與提供者頁頁首（`Supplier.image_url`） |

邏輯層：`logic/motion.ts`（`MOTION`、`useMotionNumber`、`diffById`、`replayClass`、`reducedMotion`）、`logic/toast.ts`、`logic/mapMarker.ts`（定位針型別、顏色、中文）、`logic/foodQty.ts`（`qtyHint`、`qtyRangeText`、`FOOD_QTY_FIELDS`、`foodQtyCounts`）、`logic/volunteerAvatar.ts`（`penguinOf`、`idlePhaseOf`、`penguinSrc`）、`logic/mealLabels.ts`（合約 §4 的中文、`allergenConflicts`、`claimProgress`、`timeLeftText`）。動畫的 class 在 `ui/motion.css`，每個元件都已匯入。

## 2. 動畫對照字詞表

「用語」照[字詞表](../system/03-glossary.md)；「程式名稱」是合約的欄位、列舉值、規則或端點。

| 編號 | 動畫 | 用語 | 程式名稱 | 什麼時候播 | 元件／class |
|---|---|---|---|---|---|
| A1 | 定位針落下 | 食物點、長者、據點 | `Point`、`Elder`、`Station` | 地圖上出現新的點（第一次載入全部一起落下；輪詢只有新的落下） | MapView／`tp-map__pin--enter` |
| A2 | 換色＋脈衝環一次 | 食物、警示 | `FoodStatus` `open → claimed`（M1）、`Elder.alert`（M10） | 食物點的食物全被派出；長者被見到後警示解除 | MapView／`tp-map__pin--changed` |
| A3 | 淡出縮小 | 食物點、長者 | `Food.closed`、任務 `done`／`released` 後長者不再回傳（M13） | 點從地圖上移除 | MapView／`tp-map__pin--leave` |
| A4 | 頭像待機搖擺 | 志工 | 志工 id | 一直播；每位志工起始時間錯開（`idle` 可關掉） | VolunteerAvatar／`tp-avatar--idle` |
| B1 | 選點定位針 | 長者、食物點、提供者 | `Location` | 管理員登記長者、新增食物點、提供者申請 | MapView `on-pick`／`tp-map__pin--picked` |
| B2 | 數字平滑變化 | 食物 | `Food.remaining`、`dispatched_qty`、`delivered_qty`（M1）、`BoardStats` | 剩餘、派出中、已送達份數、看板統計改變 | `useMotionNumber`、StatCard、FoodRow |
| B3 | 底色提示一次 | — | `diffById` 找出的變化 | 統計卡數字改變、輪詢到新的食物 | `.flash`、`replayClass` |
| B4～B6 | 清單進場、離場、排序 | 食物、申請、派送任務 | `listFoods`、`listMyClaims`、`listMyAssignments` | 清單有新增、移除、順序改變 | `<TransitionGroup name="list">` |
| B7 | 淡入上移 | — | — | 進度條、提示文字、選點提示出現 | `<Transition name="fade-up">` |
| B8 | 狀態晶片換色 | 食物、申請、提供者 | `FoodStatus`、`ClaimStatus`、`SupplierStatus` | 狀態改變 | FoodRow、ClaimRow、SupplierGate、ReviewList |
| B9 | 到期倒數條 | 食物 | `Food.expires_at`（最晚食用時間） | 食物 `open` 時；剩不到 25% 變紅 | FoodRow |
| B10 | 送餐進度條 | 申請 | `ClaimStatus` `claimed → delivering → done`（M8） | 志工取餐、回報後 | ClaimRow |
| B11 | 按下縮小 | — | — | 所有按鈕按下 | `.press` |
| B12 | 提示訊息 | — | 錯誤 `detail.message`（§7）、成功 | 每次寫入的結果 | ToastHost、`toast()` |
| B13 | 過期變淡 | 食物、申請 | `FoodStatus` `expired`／`closed`、`ClaimStatus` `cancelled`（M6） | 過期、下架、取消 | FoodRow、ClaimRow |
| C1 | 分頁底線滑動＋內容交叉淡入 | — | — | 切換分頁 | TabBar＋`<Transition name="tab-fade">` |
| C2 | 底部面板滑入 | 拜訪回報 | `VisitCreate`、`reportVisit` | 開啟拜訪回報 | BottomSheet |
| C3 | 過敏原警告展開 | 過敏原、長者、食物 | `Allergen`、M4、`ALLERGEN_CONFLICT` | 派給長者的食物與長者過敏原有交集（長者改過過敏原時）；停用取餐 | AllergenWarning |
| C4 | 放門口 → 拍照鈕展開 | 拜訪回報 | `VisitResult` `left_at_door`、M11、`FRESH_CANNOT_LEAVE`、`PHOTO_REQUIRED` | 選「放門口」；生鮮或純關懷時沒有這個選項 | VisitResultPicker |
| C5 | 送出中 | — | 所有寫入端點 | 呼叫 API 時，超過 300ms 才轉圈 | SubmitButton |
| D1 | 申請表 → 審核中卡片 | 提供者 | `SupplierStatus` `pending`、`applySupplier`、`ALREADY_APPLIED` | 送出提供者申請 | SupplierGate |
| D2 | 晶片變色 → 進入提供者頁 | 提供者 | `SupplierStatus` `approved`／`rejected`、`getMySupplier` | 管理員審核後 | SupplierGate |
| D3 | 晶片變色再整列收合 | 管理員、提供者 | `reviewSupplier` | 管理員按通過或不通過 | ReviewList |
| D4 | 送出鈕啟用 | 食物 | `FoodCreate` 必填欄位、M14 | 上架表單填好必填欄位 | SubmitButton `disabled` |
| D5 | 新食物進場到頂端＋底色提示 | 食物 | `createFood`、`listFoods` | 上架成功、輪詢到新食物 | `list`＋`.flash` |
| D6 | 數字徽章＋1 | 派送任務 | `Assignment`、`checkIn`（M16） | 報到後派到新的任務 | `.bump` |
| D7 | 錯誤輸入框變紅（不搖晃） | 食物 | `Food.qty`、M14、`VALIDATION_ERROR`、`QTY_BELOW_USED` | 份數不合法、改得比已派出＋已送達少，或後端回錯誤 | QtyInput |
| D8 | 過敏原晶片勾選 | 過敏原 | `Allergen`（衛福部 11 類） | 管理員登記或修改長者、上架 | AllergenChips |
| E1 | 骨架 → 依角色進入頁面 | 一般市民、志工、提供者、據點、管理員 | `Role`、`getMe` | 開啟 App | PageTransition `loading` |
| E2 | 舊頁淡出 → 新頁淡入上移 | 志工 | `Role` | 首頁「進入志工頁」、Demo 換身分（`?as=`） | PageTransition `page-key` |
| E3 | 內容淡出再淡入＋提示 | 種子資料 | `resetDemo` | 管理系統重置示範資料 | PageTransition `variant="refresh"`＋ResetDemoButton |

### 地圖顏色（合約沒寫，暫定）
| 定位針 | 狀態 | 顏色 |
|---|---|---|
| 食物點 | 有可派送的食物（`open`） | 黃 |
| 食物點 | 食物全被派出（`claimed`） | 藍 |
| 食物點 | 還沒被派出（`Food.unclaimed`，M5） | 紅 |
| 食物點 | 已過期、已下架 | 灰 |
| 長者 | 警示（`alert = true`，M10） | 紅 |
| 長者 | 近期已見到本人（`alert = false`） | 綠 |
| 據點、提供者 | — | 深灰 |

長者定位針只出現在管理系統看板，以及志工自己 `assigned` 任務上的長者（M13）。

## 3. 動態 token（`ui/motion.css`）
| token | 值 | 用在 |
|---|---|---|
| `--motion-fast` | 120ms | 按下、勾選、晶片 |
| `--motion-base` | 200ms | 顏色過渡、淡入淡出、提示訊息 |
| `--motion-slow` | 320ms | 清單進出、換頁、底部面板 |
| `--motion-emphasis` | 600ms | 狀態改變提示（脈衝環、底色） |
| `--motion-number` | 400ms | 數字變化 |
| `--ease-out`／`--ease-in`／`--ease-in-out` | `cubic-bezier(0,0,.2,1)`／`(.4,0,1,1)`／`(.4,0,.2,1)` | 進場／離場／移動 |

原則：安靜、短、不彈跳不搖晃（錯誤用顏色與文字）、只動 `transform` 與 `opacity`、狀態用顏色說、輪詢只對有變化的項目做動畫。
系統開了「減少動態」時：沒有位移、縮放、脈衝，顏色與數字直接變成新狀態（企鵝頭像也停止搖擺）。

## 4. 決策
| # | 決定 | 原因 |
|---|---|---|
| 1 | 鄰食轉運站的地圖一律用 MR-C07 MapView | 已有選點、狀態顏色、輪詢差異更新與動畫；不需要在 O02 OsmMap 加選點 |
| 2 | 元件編號從 MR-C07 開始 | MR-C01～C06 保留給共用元件（AllergenChecklist、LocationPicker、FoodCard、ElderStatusTag、StaleBanner、ImageInput） |
| 3 | 地圖顏色如上表 | 合約沒寫；照「等待中黃、處理中藍、完成綠、警示紅、結束灰」 |
| 4 | 食物列倒數到 `expires_at` | 合約沒有申請期限；最晚食用時間對志工與提供者最有用 |
| 5 | 申請列進度 3 步 | 合約 v2.2 只有 `claimed → delivering → done`（ADR-025、ADR-026） |
| 6 | 過敏原警告停用取餐鈕 | M4 有交集就不能送；派送已排除，這是長者之後改過敏原時的保險 |
| 7 | 新元件的按鈕與選項高 40–44px、字 16px | 長輩與志工用手指點得到、看得清楚 |
| 8 | `useMotionNumber` 不用 `@vueuse/core` | repo 沒有這個套件；效果相同 |
| 9 | 列舉中文暫放 `logic/mealLabels.ts` | 共用的 `logic/shared.ts` 建立後改從那裡匯入、刪掉這個檔案 |
| 10 | AllergenChips（MR-C20）與 AllergenChecklist（MR-C01）用途相同 | 二選一，或讓 MR-C01 直接包 MR-C20 |
| 11 | 志工的頭像是 6 隻企鵝之一（MR-C23），依 id 固定分配；**不畫在地圖上** | 合約 v2.2 沒有志工位置的 API；要在地圖上顯示志工，先在 #43 提合約變更 |
| 12 | 頭像待機搖擺是「不搖晃」原則的例外 | 頭像需要有生命感；幅度小（±5°、2px）、每位錯開、可用 `idle=false` 關掉，減少動態時停止 |
| 13 | QtyInput 用 `min`／`max` 取代 `remaining` | v2.2 沒有手動申請；份數只給上架與改份數，改份數的下限是已派出＋已送達（M14） |
| 14 | 地圖與食物狀態的中文改成「可派送」「已全數派出」 | 照 v2.2 §4 `FoodStatus` |
| 15 | 新元件編號 MR-C23 | MR-C24～C29 沒有被預定；第 2 波頁面從 MR-C30 開始（11-meal-relay.md），不會撞號 |
| 16 | 入口照片（T-128）：有照片才放縮圖，沒有就不顯示、不放佔位圖；點縮圖用 MR-C09 放大 | 合約 v2.3（ADR-028）照片選填；空框會讓志工以為照片沒載入。顯示判斷集中在 `logic/placePhoto.ts`（`placePhotoOf`、`pickupPhotoOf`、`stationPhotoOf`、`pointPhotoOf`），網址一律用 `imageSrc()` |
| 17 | 新增食物點（MR-C37）的入口照片欄位下方固定顯示拍攝規定 | 「只拍入口或建築外觀，不要拍到人臉、車牌、門牌號碼」（`ENTRANCE_PHOTO_RULE`）；系統無法自動檢查照片內容，只能靠提示 |
| 18 | 店面照片（T-129）：申請表（MR-C35）選了類型、而且不是「個人」才顯示照片欄位；改選「個人」時已拍的照片不上傳 | ADR-029：避免個人提供者拍到自家住址；後端也會忽略。判斷在 `showsStorefrontPhoto()`、`supplierPhotoOf()`，拍攝規定 `STOREFRONT_PHOTO_RULE` |

## 5. 素材來源與授權

| 素材 | 檔案 | 來源 | 授權 |
|---|---|---|---|
| 志工企鵝頭像 6 張 | `services/web/public/meal-relay/penguins/penguin-1～6.png`（160×160 去背 PNG） | 團隊成員郭畇呈於 2026-11-07 用 Google Gemini 以文字描述生成一張 2×3 的貼圖，再由團隊用自己的程式切割、去背。是原創的戴帽 T、綠色太陽眼鏡企鵝，**不是**既有角色（不是 Tux、Pingu 等） | 隨本 repo 以 AGPL-3.0 釋出。Google 的生成式 AI 使用條款不主張輸出內容的所有權。生成工具只在設計階段使用，執行時不呼叫任何雲端模型（比賽規則 4） |
| 地圖底圖 | `services/web/public/maps/taipei.pmtiles` | OpenStreetMap、Protomaps | ODbL（OpenStreetMap）；地圖右下角有標示 |

若主辦單位認定 AI 生成的圖不能用，就把這 6 張換成開放授權的圖，或團隊自己畫的圖：檔名和尺寸不變，程式不用改。
