# 鄰食轉運站 介面元件與動畫（MR-C07～MR-C23）

地圖、按鈕、清單與所有動畫的共用元件，給 MR-P01～P08 的頁面直接組合。對齊合約 [11-meal-relay.md](../system/11-meal-relay.md) **v2.2**（ADR-026：長者不使用 App、沒有手動申請、志工只看得到派給自己的長者）與[字詞表](../system/03-glossary.md)。
元件都**不呼叫 API**，只吃資料；頁面用 `data/` 取資料後傳進來。ui/ 不能直接匯入 `data/`（check-arch W1），型別從 `logic/mealLabels.ts` 匯入。

## 1. 元件

| 編號 | 元件 | 用途 | 傳入 | 對應的端點 |
|---|---|---|---|---|
| MR-C07 | `MapView` | 地圖：據點、長者、食物點的定位針（icon＋三色，T-126）、「我的位置」企鵝；選點；拖曳、滾輪、雙指縮放。已結束的定位針不畫。**長者定位針只用在管理員登記長者與志工自己的任務（M13）**，志工畫面不能出現長者清單；合約沒有志工位置，「我」只來自裝置定位、不送後端 | `markers`、`center?`、`on-pick?`、`picked?`、`zoomPosition?`（預設 `bottomright`，管理看板用 `bottomleft` 避開右側圖例） | `listMyAssignments`＋`listStations`（志工任務卡）、`listPoints`、`listElders`（管理員選點參考）；選點後 `createElder`（管理員）、`createPoint`、`applySupplier` |
| MR-C08 | `TabBar` | 分頁列 | `v-model`、`tabs` | — |
| MR-C09 | `BottomSheet` | 底部面板 | `v-model`、`title`、可選 `#header-action`（回報用於右上關閉按鈕） | 拜訪回報 `reportVisit` |
| MR-C10 | `SubmitButton` | 送出按鈕：送出中停用，超過 300ms 才轉圈 | `loading`、`disabled` | 所有寫入 |
| MR-C11 | `QtyInput` | 份數輸入框：只收 `min`～`max` 的整數；低於下限顯示「不能少於已派出＋已送達的 N 份」 | `v-model`、`min?`（預設 1；改份數時傳 `dispatched_qty + delivered_qty`，M14）、`max?`（預設 999）、`server-error?` | `createFood`、`updateFood`（`QTY_BELOW_USED`） |
| MR-C12 | `ToastHost` | 提示訊息（`toast('…')`、`toast(message, 'error')`） | — | 所有寫入的成功與錯誤 |
| MR-C13 | `StatCard` | 統計卡 | `label`、`value`、`tone?` | `getBoard` 的 `stats` |
| MR-C14 | `FoodRow` | 食物列：剩餘、派出中、已送達三個數字（M1）平滑變化；有照片（`image_url`）時左側顯示 48px 縮圖（MR-C55，`rounded-lg`），沒照片維持原本版面（T-127） | `food`、`now`（頁面每秒更新一次） | `listFoods` |
| MR-C15 | `ClaimRow` | 申請列（志工只看得到自己的 `claimed`、`delivering`，M13） | `claim` | `listMyClaims` |
| MR-C16 | `AllergenWarning` | 過敏原衝突警告 | 食物與長者的 `allergens`、名稱、`v-model:conflict` | `pickupClaim` 前檢查 |
| MR-C17 | `VisitResultPicker` | 拜訪結果三選一＋放門口拍照 | `v-model`、`kind`、`category`、`photo-url`、`@photo` | `uploadImage` → `reportVisit` |
| MR-C18 | `SupplierGate` | 提供者申請 → 審核中 → 提供者頁；申請人是一般市民（`citizen`） | `supplier`、`#apply` 插槽、預設插槽 | `applySupplier`、`getMySupplier` |
| MR-C19 | `ReviewList` | 審核清單；項目有 `photo` 時左側放店面照片縮圖（MR-C57，ADR-029） | `items`（`{id, name, detail?, photo?}`）、`on-decide` | `reviewSupplier`、`listSuppliers` |
| MR-C20 | `AllergenChips` | 過敏原晶片勾選（11 類） | `v-model` | `createElder`、`updateElder`（管理員）、`createFood` |
| MR-C21 | `PageTransition` | 載入骨架、換頁、重置後淡出淡入 | `loading`、`page-key`、`variant` | `getMe`、`resetDemo` |
| MR-C22 | `ResetDemoButton` | 重置示範資料 | `on-reset`、`@done` | `resetDemo` |
| MR-C58 | `MapLegend` | 地圖圖例：定位針的 icon＋文字（據點、長者、我），跟著地圖上真的有的定位針（`legendOf`） | `items` | — |
| MR-C59 | `EndedGroup` | 已結束的項目收合成一行「已結束 N 批」，點了才展開（T-126） | `count`、`unit?`（預設「批」）、預設插槽 | `listFoods`（提供者庫存）、`getBoard`（看板食物去向） |
| MR-C23 | `VolunteerAvatar` | 志工的企鵝頭像：依志工 id 固定分到 6 隻之一，可輕輕搖擺 | `id`、`name?`、`size?`（預設 40）、`idle?`（預設 true） | 據點頁今天報到（`getMyStation` 的 `checkins`）、志工頁 |
| MR-C55 | `FoodThumb` | 食物照片縮圖（T-127）：有照片才畫，替代文字用食物名稱；沒照片什麼都不畫 | `food`（`image_url`、`name`）、`size?`（`md` 48px，預設；`lg` 64px） | 照片網址來自 `listFoods`、`listMyAssignments` 的 `image_url`，用 `imageSrc()` 轉換 |
| MR-C56 | `CategoryIcon` | 分類 icon＋中文（T-130）：食物類別、提供者類型、食物點種類；單色 `currentColor`、18px、線寬 2，icon `aria-hidden` | `kind`（`food`／`org`／`point`）、`value`、`label?`（預設 true，顯示中文） | 上架表單類別選擇（`createFood`）、提供者申請類型選擇（`applySupplier`） |
| MR-C57 | `PlacePhoto` | 地點照片縮圖（入口、店面）：點一下用 MR-C09 底部面板放大；圖片讀不到就整個隱藏（T-128，ADR-028；T-129，ADR-029） | `photo`（`logic/placePhoto.ts` 的 `PlacePhoto`：`src`、`alt`、`title`）、`size?`（`sm` 48px 方形，預設；`md` 滿版寬、高 128px） | 志工任務卡的取餐地點（`Food.point_image_url`）、首頁據點清單（`Station.image_url`）、審核清單與提供者頁頁首（`Supplier.image_url`） |

邏輯層：`logic/motion.ts`（`MOTION`、`useMotionNumber`、`diffById`、`replayClass`、`reducedMotion`）、`logic/toast.ts`、`logic/mapMarker.ts`（定位針型別、`pinColorOf`、`isEndedMarker`／`visibleMarkers`、`taskMarkers`、`legendOf`、`useMyLocation`、中文）、`logic/shared.ts`（`isEnded`、`splitEnded`）、`logic/foodQty.ts`（`qtyHint`、`qtyRangeText`、`FOOD_QTY_FIELDS`、`foodQtyCounts`）、`logic/volunteerAvatar.ts`（`penguinOf`、`idlePhaseOf`、`penguinSrc`）、`logic/mealLabels.ts`（合約 §4 的中文、`allergenConflicts`、`claimProgress`、`timeLeftText`）。動畫的 class 在 `ui/motion.css`，每個元件都已匯入。

### 分類 icon（T-130）

對照表在 `logic/mealLabels.ts`（`FOOD_CATEGORY_ICON`、`ORG_TYPE_ICON`、`POINT_KIND_ICON`，經 `logic/shared.ts` 轉出），元件只讀表、不寫死。icon 全部來自已安裝的 `lucide-vue-next`（MIT）。

| 分類 | 值 → icon |
|---|---|
| 食物類別 `FoodCategory` | `meal_box` 熟食便當 → `Utensils`、`bakery` 麵包點心 → `Croissant`、`produce` 生鮮蔬果 → `Carrot`、`dry_goods` 乾貨罐頭 → `Package`、`drink` 飲品 → `Milk`、`other` 其他 → `Ellipsis` |
| 提供者類型 `OrgType` | `person` 個人 → `User`、`school` 學校 → `School`、`agency` 機關 → `Landmark`、`shop` 店家 → `Store`、`other` 其他 → `Building2` |
| 食物點種類 `PointKind` | `station` 關懷據點 → `HeartHandshake`、`village_office` 里辦公處 → `House`、`school` 學校 → `School`、`custom` 自訂 → `MapPin` |

只用在**選擇分類的地方**：MR-C38 上架表單的類別選擇、MR-C35 提供者申請的類型選擇。清單與晶片（MR-C14 FoodRow、MR-C19 ReviewList、MR-C51 ReviewPanel）不加；`POINT_KIND_ICON` 給 #80 的地圖定位針共用。測試 `tests/meal-relay-shared.test.ts` 會抓合約 §4 的值有沒有遺漏。

## 1.1 設計 v2 共用元件（T-132，MR-C60～C68）

對應設計圖與畫面規格 [design-v2/README.md](design-v2/README.md) §1。元件都**只收 props、發 emit，不呼叫 API**，顏色只用 `style.css` 的 token，按鈕與可點的列高度至少 48px。C69 保留。素材與小函數在 `logic/brand.ts`（`brandSrc()`、`BRAND_FILES`、`useTabQuery()`、`stepStateOf()`、`clampInt()`、`parseIntInput()`、群組收合的 `openedInGroup()` 等）。

| 編號 | 元件 | props | emit／插槽 | 對應設計圖 |
|---|---|---|---|---|
| MR-C60 | `BrandHeader` 品牌頁首 | `title`；`variant?`（`wordmark` 預設／`banner`） | 插槽 `#actions`（字標版標題右側，例如「重置示範資料」） | 03 三個畫面頁首、02 管理系統頁首（字標版）；04 左、中、右頁首（banner 版：淺青底、企鵝在左、標題置中、右邊房子與光芒） |
| MR-C61 | `BrandHero` 首頁主視覺 | `lines?`（標語，預設「把多出來的食物，」「送到需要的人手上」） | — | 01 左最上面的標誌與標語（淺青底圓角塊） |
| MR-C62 | `MascotBadge` 企鵝圓形頭像 | `size?`（預設 64）、`glow?`（右上光芒）、`done?`（右下角 lucide `CircleCheck`）、`alt?`（沒傳視為裝飾圖） | — | 01 中志工問候的頭像（`glow`）、04 右完成畫面（`size=160 glow done`，見下方「完成插圖」） |
| MR-C63 | `StepIndicator` 步驟列 | `steps`（`{label, icon?}[]`）、`current`（從 0 起算） | — | 01 中「報到 → 取餐 → 回報」（每步都有 `icon` 時為圖示版）、03 右「① 拍照 → ② 填寫資訊 → ③ 上架」（沒有 `icon` 時為數字圓圈版）。已完成打勾、目前步驟加粗加底色並標 `aria-current="step"`、還沒到的變灰 |
| MR-C64 | `InfoNote` 淺黃提醒卡 | `text?`、`detail?`（第二行小字）、`icon?`（預設 lucide `Info`） | 預設插槽（取代 `text`） | 01 左「長者不用操作 App」、03 左「審核通過後，就能上架食物」、03 中「還有食物等待派送」、03 右「上架後仍可修改份數與時間」 |
| MR-C65 | `Accordion` 收合列 | `title`、`group?`（同名的列一次只展開一個）、`name?`（在群組裡的名字，預設自動編號）、`icon?`；`v-model` 綁開關（不綁就自己管） | 插槽：預設＝展開內容、`#title`＝自訂標題文字、`#chip`＝標題列右側晶片、`#icon`＝左側圖示 | 01 左「想成為志工？」、01 右任務卡與「查看位置」、03 中「已結束的食物（N）」。展開與收合有高度動畫，`prefers-reduced-motion` 時沒有動畫；收合時內容 `inert` |
| MR-C66 | `SegmentedTabs` 分段切換 | `v-model`、`tabs`（`{value, label, badge?}[]`）、`label?`（無障礙名稱） | — | 03 中「我的庫存｜上架食物」、02 管理系統「待審核 ②｜服務看板｜長者名冊」。與網址 `?tab=` 同步用 `useTabQuery('tab', ['inventory', 'publish'] as const)`，回傳可寫的 computed 直接 `v-model`；寫入用 router push，App 返回鍵可退回上一個分頁 |
| MR-C67 | `ConfirmDialog` 確認視窗 | `v-model`（開關）、`title`、`message?`、`confirmText?`（預設「確認」）、`cancelText?`（預設「取消」）、`danger?` | `confirm`、`cancel`（兩者都會把 `v-model` 設回 false） | 下架、取消這份餐、重置示範資料、不通過（設計圖沒有，樣式依規格）。`danger` 時確認鍵是紅色（`warn` token）；開啟時焦點在「取消」；Esc、點遮罩＝取消；Tab 只在兩顆按鈕間循環；關閉後焦點回到開啟前的元素 |
| MR-C68 | `NumberStepper` −／數字／+ | `v-model`（數字）、`min?`（預設 1）、`max?`（預設 999）、`step?`（預設 1）、`label?`（預設「數量」，給螢幕閱讀器） | — | 03 右「份數」。到下限 − 停用、到上限 + 停用；中間可直接輸入（只收數字，全形也行；輸入中不超出範圍才先收進去，離開欄位或按 Enter 才收進上下限；空白或非數字還原）。與 MR-C11 `QtyInput`（純輸入框＋錯誤提示）不同 |

另外 MR-C13 `StatCard` 新增選用 `icon`（lucide 元件）：有傳時圖示在左、文字在右（02 管理系統看板的統計卡）；沒傳時版面與原本一樣。

**完成插圖**：04 右的大企鵝沒有原圖，先用 `MascotBadge`（企鵝頭像＋蜂蜜罐）加 lucide `CircleCheck` 疊在右下角，由元件畫，不另外放圖檔。**後續**：請設計者（郭畇呈）提供去背 PNG（完整標誌、站姿企鵝、完成插圖）後再換。

**素材去背**：`logo.webp`、`mascot.webp`、`wordmark.webp` 由 `design-v2/05-logo.webp`（白底）用 Python Pillow ＋ numpy 去背：從圖的四邊把近白色（RGB 皆 ≥ 238）連通區域設成透明，邊緣 2px 依亮度給半透明，被深綠線條圍住的白色（帽子、房子牆面）保留。標誌為去背，但邊緣是反鋸齒後的簡單處理，放在深色底可能看到淺邊；元件都放在白色或淺青底上。`mascot.webp` 只取企鵝＋蜂蜜罐的方形範圍，蜂蜜流往右下被圓形頭像裁掉，所以只能放在圓形裡（`MascotBadge`）。

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

### 狀態顏色：只剩三種（T-126，全部用官方 token）
| 意義 | token | 晶片 | 條與定位針 | 用在 |
|---|---|---|---|---|
| **進行中／可用** | `primary` | `bg-primary-50 text-primary-700` | `primary-500` | 食物可派送、申請已派送／配送中、提供者已通過、長者正常、要做的事（送餐、關懷）、送餐進度條（含完成） |
| **需要處理** | `warn` | `bg-warn-100/15 text-warn-200` | `warn-200` | 長者需要送餐／需要關懷／從未見到、食物還沒被派出（M5）、提供者未通過、錯誤、倒數剩不到 25% |
| **結束／背景** | `grey` | `bg-grey-50 text-grey-500` | `grey-400` | 完成、已全數派出、已過期、已下架、取消、審核中、離線提示（StaleBanner `bg-grey-100 text-grey-700`） |

不再用 `secondary`（黃）、`mango`、`success`（綠）表示狀態，也不再用「藍 vs 主色」區分狀態。

### 地圖定位針（icon＋顏色，不只靠顏色）
| 定位針 | 圓頭裡的 icon（白色 14px） | 顏色 |
|---|---|---|
| 據點 | `lucide-vue-next` `HeartHandshake` | 深灰 `grey-700`（是「地點」不是狀態，`pinColorOf(undefined) = 'station'`） |
| 長者 | `lucide-vue-next` `User` | 有任何警示標籤（需要送餐、需要關懷、從未見到）→ `warn`；正常 → `primary` |
| 食物點（只在選點時當參考） | 餐盒小圖示 | `open` → `primary`、`unclaimed` → `warn`；已全數派出、已過期、已下架**不畫** |
| 我的位置 | 圓形企鵝頭像（MR-C23 的圖，`penguinSrc`），白底主色細邊 | 不上狀態色；沒有滑行、跳躍動畫 |

圖例（MR-C58）用同樣的 icon＋文字，只列地圖上真的有的定位針，不再列六種顏色的說明。

### 各角色的地圖內容（T-126）
| 角色 | 地圖上有什麼 | 什麼時候出現 |
|---|---|---|
| 志工（任務卡 MR-C40） | 任務的據點（`station_id`）＋這張任務的長者（M13）＋我（企鵝） | 只在任務卡裡；拒絕定位時只有據點和長者 |
| 提供者（MR-P06） | 只有選位置的 LocationPicker | 新增食物點（MR-C37）、提供者申請時；庫存頁、上架的食物點清單都不放地圖 |
| 管理員（MR-P08） | 看板沒有總覽地圖，改用統計卡與清單 | 只在登記或修改長者位置時（MR-C53 的 LocationPicker） |
| 據點（MR-P07） | 不需要地圖 | — |

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
| 3 | ~~地圖顏色：等待中黃、處理中藍、完成綠、警示紅、結束灰~~ → 改成三色原則（決策 16） | T-126 取代 |
| 4 | 食物列倒數到 `expires_at` | 合約沒有申請期限；最晚食用時間對志工與提供者最有用 |
| 5 | 申請列進度 3 步 | 合約 v2.2 只有 `claimed → delivering → done`（ADR-025、ADR-026） |
| 6 | 過敏原警告停用取餐鈕 | M4 有交集就不能送；派送已排除，這是長者之後改過敏原時的保險 |
| 7 | 新元件的按鈕與選項高 40–44px、字 16px | 長輩與志工用手指點得到、看得清楚 |
| 8 | `useMotionNumber` 不用 `@vueuse/core` | repo 沒有這個套件；效果相同 |
| 9 | 列舉中文暫放 `logic/mealLabels.ts` | 共用的 `logic/shared.ts` 建立後改從那裡匯入、刪掉這個檔案 |
| 10 | AllergenChips（MR-C20）與 AllergenChecklist（MR-C01）用途相同 | 二選一，或讓 MR-C01 直接包 MR-C20 |
| 11 | 志工的頭像是 6 隻企鵝之一（MR-C23），依 id 固定分配；不畫其他志工的位置 | 合約 v2.2 沒有志工位置的 API；志工自己的「我的位置」見決策 19 |
| 12 | 頭像待機搖擺是「不搖晃」原則的例外 | 頭像需要有生命感；幅度小（±5°、2px）、每位錯開、可用 `idle=false` 關掉，減少動態時停止 |
| 13 | QtyInput 用 `min`／`max` 取代 `remaining` | v2.2 沒有手動申請；份數只給上架與改份數，改份數的下限是已派出＋已送達（M14） |
| 14 | 地圖與食物狀態的中文改成「可派送」「已全數派出」 | 照 v2.2 §4 `FoodStatus` |
| 15 | 新元件編號 MR-C23 | MR-C24～C29 沒有被預定；第 2 波頁面從 MR-C30 開始（11-meal-relay.md），不會撞號 |
| 16 | 上架表單先拍照（T-127）：MR-C38 第一步只有「拍照」與「略過」，拍完或略過才展開其他欄位 | 志工到取餐地點看照片就知道拿哪一批，也比較看得出過敏原；漸進式揭示讓提供者先做這一步 |
| 17 | 照片仍是選填（T-127） | 合約 M19 沒有規定必填；略過時提示一次「有照片，志工比較好找」（同一個頁面只提示一次），不擋上架 |
| 18 | 食物照片沒有就不顯示（T-127） | 志工任務卡（MR-C41）、食物列（MR-C14）都不放空框或佔位圖；有照片時任務卡的縮圖點了用 MR-C09 BottomSheet 放大 |
| 19 | 拍照按鈕沿用 MR-C06 ImageInput，不加相機 icon | 工單允許拍照這一步的主要按鈕加 icon，但按鈕在 MR-C06 裡面，不在 T-127 範圍；之後要加再開工單 |
| 20 | 分類 icon 統一用 `lucide-vue-next`，不自繪、不用 emoji 或圖片檔（T-130） | 專案已安裝、開源（MIT）、單色跟著文字顏色，不新增顏色；icon 一律搭配中文，不單獨出現 |
| 21 | 分類 icon 只放在選擇分類的地方（T-130 範圍縮小） | 和 #80 的美術方向一致：清單、晶片不加 icon，避免畫面太花 |
| 22 | 入口照片（T-128）：有照片才放縮圖，沒有就不顯示、不放佔位圖；點縮圖用 MR-C09 放大 | 合約 v2.3（ADR-028）照片選填；空框會讓志工以為照片沒載入。顯示判斷集中在 `logic/placePhoto.ts`（`placePhotoOf`、`pickupPhotoOf`、`stationPhotoOf`、`pointPhotoOf`），網址一律用 `imageSrc()` |
| 23 | 新增食物點（MR-C37）的入口照片欄位下方固定顯示拍攝規定 | 「只拍入口或建築外觀，不要拍到人臉、車牌、門牌號碼」（`ENTRANCE_PHOTO_RULE`）；系統無法自動檢查照片內容，只能靠提示 |
| 24 | 店面照片（T-129）：申請表（MR-C35）選了類型、而且不是「個人」才顯示照片欄位；改選「個人」時已拍的照片不上傳 | ADR-029：避免個人提供者拍到自家住址；後端也會忽略。判斷在 `showsStorefrontPhoto()`、`supplierPhotoOf()`，拍攝規定 `STOREFRONT_PHOTO_RULE` |
| 25 | 狀態色只剩三種：primary 進行中／可用、warn 需要處理、grey 結束／背景；據點定位針深灰 `grey-700` | T-126 美術方向（漸進式揭示、情境式引導）：顏色越少，越能一眼看出「要不要處理」 |
| 26 | 結束的東西預設收合：清單的已過期、已下架、已取消收成一行「已結束 N 批」（MR-C59，`splitEnded`）；地圖不畫已全數派出、已過期、已下架的食物點與完成、取消（`isEndedMarker`） | 不以淡色佔位，需要時點一下展開。已全數派出還有份數在配送、提供者還能修改或下架，所以清單上保留（灰色晶片），只有地圖不畫 |
| 27 | 各角色只在需要的時刻看到地圖（上表）；拿掉看板總覽地圖，也拿掉上架頁的食物點總覽地圖（MR-C36 改成只有清單） | 地圖只回答「這一步要去哪裡／選哪裡」；看板用統計卡與清單就夠 |
| 28 | 「我的位置」用 `navigator.geolocation`（`useMyLocation`），只在裝置上畫，不送後端、不存；拒絕或取不到就不畫、不跳錯誤 | 隱私（AGENTS.md 第 5 條）：位置不離開裝置；合約沒有志工位置的 API，也不需要 |
| 29 | 定位針用 icon＋顏色（據點 HeartHandshake、長者 User、我＝企鵝），圖例也是 icon＋文字 | 不只靠顏色區分；這是地圖定位針，不違反「清單、晶片不加 icon」 |
| 30 | icon 只放在當下這一步的主要動作按鈕；拿掉首頁說明的 IconBadge、據點清單列的 MapPin、志工資訊外部連結按鈕的 ExternalLink、據點 QR 斷網提示的 WifiOff | T-126 第 4 點；EmptyState（M05）的 icon 是共用元件內建，`ui/**` 不在本工單範圍，保留 |
| 31 | 任務卡要畫據點，所以 `useMyTasks` 另外讀一次公開的 `listStations`（志工頁本來就會讀），`TaskView` 多一個 `station` | 合約的 `Assignment` 只有 `station_id`、沒有位置；讀不到就不畫據點，不影響任務 |

## 5. 素材來源與授權

| 素材 | 檔案 | 來源 | 授權 |
|---|---|---|---|
| 志工企鵝頭像 6 張 | `services/web/public/meal-relay/penguins/penguin-1～6.png`（160×160 去背 PNG） | 團隊成員郭畇呈於 2026-11-07 用 Google Gemini 以文字描述生成一張 2×3 的貼圖，再由團隊用自己的程式切割、去背。是原創的戴帽 T、綠色太陽眼鏡企鵝，**不是**既有角色（不是 Tux、Pingu 等） | 隨本 repo 以 AGPL-3.0 釋出。Google 的生成式 AI 使用條款不主張輸出內容的所有權。生成工具只在設計階段使用，執行時不呼叫任何雲端模型（比賽規則 4） |
| 鄰食蜂標誌（完整版、企鵝頭像、字標） | `services/web/public/meal-relay/brand/logo.webp`、`mascot.webp`、`wordmark.webp`（去背 WebP） | 設計者提供的標誌原圖 `docs/meal-relay/design-v2/05-logo.webp`（白底），T-132 用 Python Pillow 去背、裁切、縮小 | 隨本 repo 以 AGPL-3.0 釋出；原圖的製作方式與授權請設計者確認後補在這裡（換圖時檔名與尺寸不變，程式不用改） |
| 任務完成企鵝 | `services/web/public/meal-relay/brand/mascot-done.webp` | `docs/meal-relay/design-v2/04-station-report-done.webp` 右欄的企鵝與勾號，裁切去背 | 鄰食蜂設計素材 |
| 鄰食蜂展示標題字型 | `services/web/src/features/meal-relay/ui/meal-relay-display.woff2` | [justfont jf open 粉圓 v2.1](https://github.com/justfont/open-huninn-font/releases/tag/v2.1)，重新命名並保留設計標題與數字所需字元 | SIL OFL 1.1，授權全文見 `services/web/public/meal-relay/brand/OFL-Huninn.txt` |
| 地圖底圖 | `services/web/public/maps/taipei.pmtiles` | OpenStreetMap、Protomaps | ODbL（OpenStreetMap）；地圖右下角有標示 |

若主辦單位認定 AI 生成的圖不能用，就把這 6 張換成開放授權的圖，或團隊自己畫的圖：檔名和尺寸不變，程式不用改。

## 6. 設計 v2 畫面細節

- 大標題或統計數字可套 `mr-display`。字型跟著建置資產由 Service Worker 預先快取。子集缺少的字元會使用系統字，內文和表單也使用系統字。
- MR-C06 `ImageInput` 的 `layout="inline"` 可在已有照片時把預覽、重拍和移除並排。可用 `hint` 與 `retakeLabel` 調整提示及按鈕文字。
- 志工任務的待取餐與配送中使用蜂蜜黃色狀態標籤。送餐加關懷、純關懷使用淺青色任務類型標籤，過敏原仍以紅色標示。
- 提供者的上架表單用單欄標籤配對輸入欄位。頁首「返回我的庫存」保留分頁操作，店面照片放在申請表的選填收合區。
- 管理看板、審核和長者名冊各自顯示於對應分頁。桌面看板保留可操作的 OpenStreetMap 地圖，長者名冊與編輯表單左右並排，手機編輯則用底部面板。
