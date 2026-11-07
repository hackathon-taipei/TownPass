# 鄰食轉運站 介面元件與動畫（MR-C07～MR-C22）

地圖、按鈕、清單與所有動畫的共用元件，給 MR-P01～P08 的頁面直接組合。對齊合約 [11-meal-relay.md](../system/11-meal-relay.md) v2.1 與[字詞表](../system/03-glossary.md)。
元件都**不呼叫 API**，只吃資料；頁面用 `data/` 取資料後傳進來。ui/ 不能直接匯入 `data/`（check-arch W1），型別從 `logic/mealLabels.ts` 匯入。

## 1. 元件

| 編號 | 元件 | 用途 | 傳入 | 對應的端點 |
|---|---|---|---|---|
| MR-C07 | `MapView` | 地圖：食物點、長者、據點的定位針，志工畫成企鵝；選點；拖曳、滾輪、雙指縮放 | `markers`、`center?`、`on-pick?`、`picked?` | `listPoints`、`listElders`、`getBoard`；選點後 `upsertMyElder`、`createElder`、`createPoint`、`applySupplier` |
| MR-C08 | `TabBar` | 分頁列 | `v-model`、`tabs` | — |
| MR-C09 | `BottomSheet` | 底部面板 | `v-model`、`title` | 拜訪回報 `reportVisit` |
| MR-C10 | `SubmitButton` | 送出按鈕：送出中停用，超過 300ms 才轉圈 | `loading`、`disabled` | 所有寫入 |
| MR-C11 | `QtyInput` | 份數輸入框：只收 1～上限的整數 | `v-model`、`remaining`（上限） | `createFood`、`updateFood` |
| MR-C12 | `ToastHost` | 提示訊息（`toast('…')`、`toast(message, 'error')`） | — | 所有寫入的成功與錯誤 |
| MR-C13 | `StatCard` | 統計卡 | `label`、`value`、`tone?` | `getBoard` 的 `stats` |
| MR-C14 | `FoodRow` | 食物列 | `food`、`now`（頁面每秒更新一次） | `listFoods` |
| MR-C15 | `ClaimRow` | 申請列 | `claim` | `listMyClaims` |
| MR-C16 | `AllergenWarning` | 過敏原衝突警告 | 食物與長者的 `allergens`、名稱、`v-model:conflict` | `pickupClaim` 前檢查 |
| MR-C17 | `VisitResultPicker` | 拜訪結果三選一＋放門口拍照 | `v-model`、`kind`、`category`、`photo-url`、`@photo` | `uploadImage` → `reportVisit` |
| MR-C18 | `SupplierGate` | 提供者申請 → 審核中 → 提供者頁 | `supplier`、`#apply` 插槽、預設插槽 | `applySupplier`、`getMySupplier` |
| MR-C19 | `ReviewList` | 審核清單 | `items`、`on-decide` | `reviewSupplier` |
| MR-C20 | `AllergenChips` | 過敏原晶片勾選（11 類） | `v-model` | `upsertMyElder`、`createElder`、`createFood` |
| MR-C21 | `PageTransition` | 載入骨架、換頁、重置後淡出淡入 | `loading`、`page-key`、`variant` | `getMe`、`resetDemo` |
| MR-C22 | `ResetDemoButton` | 重置示範資料 | `on-reset`、`@done` | `resetDemo` |

邏輯層：`logic/motion.ts`（`MOTION`、`useMotionNumber`、`diffById`、`replayClass`、`reducedMotion`）、`logic/toast.ts`、`logic/mapMarker.ts`（定位針型別、顏色、中文）、`logic/mealLabels.ts`（合約 §4 的中文、`allergenConflicts`、`claimProgress`、`timeLeftText`）。動畫的 class 在 `ui/motion.css`，每個元件都已匯入。

## 2. 動畫對照字詞表

「用語」照[字詞表](../system/03-glossary.md)；「程式名稱」是合約的欄位、列舉值、規則或端點。

| 編號 | 動畫 | 用語 | 程式名稱 | 什麼時候播 | 元件／class |
|---|---|---|---|---|---|
| A1 | 定位針落下 | 食物點、長者、據點 | `Point`、`Elder`、`Station` | 地圖上出現新的點（第一次載入全部一起落下；輪詢只有新的落下） | MapView／`tp-map__pin--enter` |
| A2 | 換色＋脈衝環一次 | 食物、警示 | `FoodStatus` `open → claimed`（M1）、`Elder.alert`（M10） | 食物點的食物全被派出；長者被見到後警示解除 | MapView／`tp-map__pin--changed` |
| A3 | 淡出縮小 | 食物點、長者 | `Food.closed`、`Elder.merged_into`（M13） | 點從地圖上移除 | MapView／`tp-map__pin--leave` |
| A4 | 企鵝待機搖擺 | 志工 | `Marker.kind = 'volunteer'` | 一直播；每位志工起始時間錯開 | MapView／`tp-map__penguin-img` |
| A5 | 企鵝跳一下＋陰影脈衝 | 志工、派送任務 | `ClaimStatus` `delivering` | 志工開始或結束配送 | MapView／`tp-map__pin--changed` |
| A6 | 企鵝滑行到新位置 | 志工 | `Location` | 志工位置更新（0.9 秒） | MapView／`tp-map__pin--moving` |
| B1 | 選點定位針 | 長者、食物點、提供者 | `Location` | 第一次填長者位置、新增長者、新增食物點、提供者申請 | MapView `on-pick`／`tp-map__pin--picked` |
| B2 | 數字平滑變化 | 食物 | `Food.remaining`（M1）、`BoardStats` | 剩餘份數、看板統計改變 | `useMotionNumber`、StatCard、FoodRow |
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
| D7 | 錯誤輸入框變紅（不搖晃） | 食物 | `Food.qty`、`VALIDATION_ERROR`、`QTY_EXCEEDED` | 份數不合法或後端回錯誤 | QtyInput |
| D8 | 過敏原晶片勾選 | 過敏原 | `Allergen`（衛福部 11 類） | 長者填資料、新增長者、上架 | AllergenChips |
| E1 | 骨架 → 依角色進入頁面 | 長者、志工、提供者、據點、管理員 | `Role`、`getMe` | 開啟 App | PageTransition `loading` |
| E2 | 舊頁淡出 → 新頁淡入上移 | 志工 | `Role` | 首頁「切換為志工」、Demo 換身分 | PageTransition `page-key` |
| E3 | 內容淡出再淡入＋提示 | 種子資料 | `resetDemo` | 管理系統重置示範資料 | PageTransition `variant="refresh"`＋ResetDemoButton |

### 地圖顏色（合約沒寫，暫定）
| 定位針 | 狀態 | 顏色 |
|---|---|---|
| 食物點 | 有可申請的食物（`open`） | 黃 |
| 食物點 | 食物全被派出（`claimed`） | 藍 |
| 食物點 | 還沒被派出（`Food.unclaimed`，M5） | 紅 |
| 食物點 | 已過期、已下架 | 灰 |
| 長者 | 警示（`alert = true`，M10） | 紅 |
| 長者 | 近期已見到本人（`alert = false`） | 綠 |
| 據點、提供者 | — | 深灰 |
| 志工（企鵝腳下陰影） | 配送中（`delivering`） | 藍 |
| 志工（企鵝腳下陰影） | 其他 | 灰 |

志工圖示：`services/web/public/meal-relay/penguins/penguin-1～6.png`（160×160 去背），`logic/mapMarker.ts` 的 `penguinOf(id)` 依志工 id 固定分到其中一隻（同一人永遠同一隻，不用 `Math.random`）。

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
系統開了「減少動態」時：沒有位移、縮放、脈衝，顏色與數字直接變成新狀態（企鵝也停止搖擺、直接跳到新位置）。

## 4. 決策
| # | 決定 | 原因 |
|---|---|---|
| 1 | 鄰食轉運站的地圖一律用 MR-C07 MapView | 已有選點、狀態顏色、輪詢差異更新與動畫；不需要在 O02 OsmMap 加選點 |
| 2 | 元件編號從 MR-C07 開始 | MR-C01～C06 保留給共用元件（AllergenChecklist、LocationPicker、FoodCard、ElderStatusTag、StaleBanner、ImageInput） |
| 3 | 地圖顏色如上表 | 合約沒寫；照「等待中黃、處理中藍、完成綠、警示紅、結束灰」 |
| 4 | 食物列倒數到 `expires_at` | 合約沒有申請期限；最晚食用時間對志工與提供者最有用 |
| 5 | 申請列進度 3 步 | 合約 v2.1 只剩 `claimed → delivering → done`（ADR-025） |
| 6 | 過敏原警告停用取餐鈕 | M4 有交集就不能送；派送已排除，這是長者之後改過敏原時的保險 |
| 7 | 新元件的按鈕與選項高 40–44px、字 16px | 長輩與志工用手指點得到、看得清楚 |
| 8 | `useMotionNumber` 不用 `@vueuse/core` | repo 沒有這個套件；效果相同 |
| 9 | 列舉中文暫放 `logic/mealLabels.ts` | 共用的 `logic/shared.ts` 建立後改從那裡匯入、刪掉這個檔案 |
| 10 | AllergenChips（MR-C20）與 AllergenChecklist（MR-C01）用途相同 | 二選一，或讓 MR-C01 直接包 MR-C20 |
| 11 | 志工在地圖上畫成 6 隻企鵝之一，依 id 固定分配 | 一眼分得出志工和其他定位針；固定分配讓輪詢與重新整理時不會換圖 |
| 12 | 企鵝待機搖擺是「不搖晃」原則的例外 | 角色圖示需要有生命感；幅度小（±5°、2px）、每隻錯開，且減少動態時停止 |
