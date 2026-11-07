# 元件目錄（自動產生）

> 由 `node tools/check-arch.mjs --catalog` 從各元件的 `@component` 標頭產生，請勿手動編輯。

| 編號 | 元件 | 說明 | 檔案（services/web/src/） |
|---|---|---|---|
| A01 | BaseButton | 按鈕（primary/secondary/outline/ghost/danger） | `ui/atoms/BaseButton.vue` |
| A02 | BaseTag | 小標籤 | `ui/atoms/BaseTag.vue` |
| A03 | BaseChip | 圓角選項（快捷/篩選） | `ui/atoms/BaseChip.vue` |
| A04 | BaseInput | 文字輸入（單行/多行） | `ui/atoms/BaseInput.vue` |
| A05 | SkeletonBlock | 載入中佔位 | `ui/atoms/SkeletonBlock.vue` |
| A06 | IconBadge | 圓形圖示底 | `ui/atoms/IconBadge.vue` |
| A07 | SourceNote | 資料來源註記（競賽規則要求標示出處） | `ui/atoms/SourceNote.vue` |
| EX-C01 | CategoryFilter | 分類篩選 chips | `features/example/ui/CategoryFilter.vue` |
| EX-P01 | PlaceListPage | 範例：設施列表 | `features/example/ui/PlaceListPage.vue` |
| EX-P02 | PlaceDetailPage | 範例：設施詳細頁 | `features/example/ui/PlaceDetailPage.vue` |
| M01 | BaseCard | 卡片容器 | `ui/molecules/BaseCard.vue` |
| M02 | ListItem | 列表列 | `ui/molecules/ListItem.vue` |
| M03 | SectionTitle | 區塊標題 | `ui/molecules/SectionTitle.vue` |
| M04 | CollapseItem | 可展開列 | `ui/molecules/CollapseItem.vue` |
| M05 | EmptyState | 空狀態 | `ui/molecules/EmptyState.vue` |
| M06 | InfoTable | 標籤/值資訊列 | `ui/molecules/InfoTable.vue` |
| M07 | ResultCard | 搜尋結果卡片（圖示 + 標題 + 副標 + 標籤） | `ui/molecules/ResultCard.vue` |
| M08 | ChatBubble | 對話泡泡（使用者靠右、系統靠左） | `ui/molecules/ChatBubble.vue` |
| M09 | ChipRail | 可橫向捲動的 chips 列（放 BaseChip） | `ui/molecules/ChipRail.vue` |
| M10 | ChatImage | 對話框內的圖片（圖說 + 來源，載入失敗時顯示替代文字） | `ui/molecules/ChatImage.vue` |
| M11 | ChatQuote | 對話框內的原文（逐字顯示、可朗讀） | `ui/molecules/ChatQuote.vue` |
| ML-C01 | DeviceModelCard | 手機硬體、選用模型與理由、模型揭露 | `addons/model/ui/DeviceModelCard.vue` |
| MR-C01 | AllergenChecklist | 過敏原勾選：包 MR-C20 AllergenChips，加上說明與已選摘要 | `features/meal-relay/ui/AllergenChecklist.vue` |
| MR-C02 | LocationPicker | 在地圖上選位置：包 MR-C07 MapView，不用 Google Maps | `features/meal-relay/ui/LocationPicker.vue` |
| MR-C03 | FoodCard | 一批食物：包 MR-C14 FoodRow，加上提供者的修改與下架按鈕 | `features/meal-relay/ui/FoodCard.vue` |
| MR-C04 | ElderStatusTag | 長者警示標籤：需要送餐／需要關懷／從未見到（M10） | `features/meal-relay/ui/ElderStatusTag.vue` |
| MR-C05 | StaleBanner | 斷網時顯示上次更新時間，提醒送出鍵停用（ADR-024） | `features/meal-relay/ui/StaleBanner.vue` |
| MR-C06 | ImageInput | 拍照或選圖，前端壓縮成 base64（M19，≤ IMAGE_MAX_BYTES） | `features/meal-relay/ui/ImageInput.vue` |
| MR-C07 | MapView | 鄰食地圖：定位針依狀態上色、落下／換色脈衝／淡出動畫、可選點 | `features/meal-relay/ui/MapView.vue` |
| MR-C08 | TabBar | 分頁列：底線滑動、內容交叉淡入 | `features/meal-relay/ui/TabBar.vue` |
| MR-C09 | BottomSheet | 底部面板：遮罩淡入、面板由下滑入 | `features/meal-relay/ui/BottomSheet.vue` |
| MR-C10 | SubmitButton | 送出按鈕：送出中停用，超過 300ms 才轉圈 | `features/meal-relay/ui/SubmitButton.vue` |
| MR-C11 | QtyInput | 份數輸入框：只能輸入 min 到 max 的整數 | `features/meal-relay/ui/QtyInput.vue` |
| MR-C12 | ToastHost | 提示訊息：底部上移淡入、4 秒後淡出 | `features/meal-relay/ui/ToastHost.vue` |
| MR-C13 | StatCard | 統計卡：數字平滑變化並底色提示一次 | `features/meal-relay/ui/StatCard.vue` |
| MR-C14 | FoodRow | 食物列：剩餘、派出中、已送達份數平滑變化、狀態晶片換色、到期倒數條、過期變淡 | `features/meal-relay/ui/FoodRow.vue` |
| MR-C15 | ClaimRow | 申請列：狀態晶片換色、送餐進度條（已派送 → 配送中 → 完成） | `features/meal-relay/ui/ClaimRow.vue` |
| MR-C16 | AllergenWarning | 過敏原衝突警告：有交集時展開（C3） | `features/meal-relay/ui/AllergenWarning.vue` |
| MR-C17 | VisitResultPicker | 拜訪結果三選一：選「放門口」時拍照鈕展開（C4） | `features/meal-relay/ui/VisitResultPicker.vue` |
| MR-C18 | SupplierGate | 提供者申請狀態：申請表 → 審核中卡片 → 通過後進入提供者頁（D1、D2） | `features/meal-relay/ui/SupplierGate.vue` |
| MR-C19 | ReviewList | 審核清單：按通過／不通過 → 晶片變色 → 整列收合（D3） | `features/meal-relay/ui/ReviewList.vue` |
| MR-C20 | AllergenChips | 過敏原晶片勾選：11 類，點一下換色（D8） | `features/meal-relay/ui/AllergenChips.vue` |
| MR-C21 | PageTransition | 頁面切換：載入骨架 → 內容淡入上移；身分或資料重置時舊畫面淡出再換新（E1、E2、E3） | `features/meal-relay/ui/PageTransition.vue` |
| MR-C22 | ResetDemoButton | 重置示範資料：送出中轉圈，成功後提示並通知頁面淡出淡入（E3） | `features/meal-relay/ui/ResetDemoButton.vue` |
| MR-C23 | VolunteerAvatar | 志工的企鵝頭像：依志工 id 固定分到 6 隻之一，可輕輕搖擺 | `features/meal-relay/ui/VolunteerAvatar.vue` |
| MR-C30 | HomeIntro | 首頁說明：長者不用操作 App，需要送餐或關懷請洽里長或最近的社區關懷據點（§1、§2） | `features/meal-relay/ui/HomeIntro.vue` |
| MR-C31 | HomeStationList | 首頁的社區關懷據點清單（實體管道，listStations）＋資料來源 | `features/meal-relay/ui/HomeStationList.vue` |
| MR-C32 | HomeVolunteerInfo | 想當志工：正式版由據點經臺北市志工管理整合平臺招募、在臺北 E 大受訓（§1），本作品不做志工申請 | `features/meal-relay/ui/HomeVolunteerInfo.vue` |
| MR-C33 | HomeEntryCard | 首頁依角色的主要按鈕：進入志工／提供者／據點頁，或一般市民的「我要提供食物」（§9） | `features/meal-relay/ui/HomeEntryCard.vue` |
| MR-P01 | HomePage | 鄰食轉運站首頁：說明、社區關懷據點、志工從哪裡來、依角色進入（一般市民「我要提供食物」） | `features/meal-relay/ui/HomePage.vue` |
| MR-P04 | VolunteerPage | 志工頁（佔位） | `features/meal-relay/ui/VolunteerPage.vue` |
| MR-P05 | TaskPage | 我的任務與拜訪回報（佔位） | `features/meal-relay/ui/TaskPage.vue` |
| MR-P06 | SupplierPage | 提供者頁（佔位） | `features/meal-relay/ui/SupplierPage.vue` |
| MR-P07 | StationPage | 據點頁（佔位） | `features/meal-relay/ui/StationPage.vue` |
| MR-P08 | AdminPage | 管理系統（佔位） | `features/meal-relay/ui/AdminPage.vue` |
| O01 | BaseSheet | 底部面板 | `ui/organisms/BaseSheet.vue` |
| O02 | OsmMap | 地圖（隨附臺北向量底圖，縮小時精簡路名；可切換 OSM 圖磚） | `ui/organisms/OsmMap.vue` |
| O03 | NoticeList | 注意事項清單（第一項預設展開） | `ui/organisms/NoticeList.vue` |
| O04 | ChatComposer | 對話輸入列（快捷 chips + 輸入框 + 送出） | `ui/organisms/ChatComposer.vue` |
| O05 | ChatThread | 對話紀錄（泡泡 + 地圖／圖片／原文 + 結果卡片 + 建議） | `ui/organisms/ChatThread.vue` |
| O06 | FeatureGrid | 服務卡片兩欄網格 | `ui/organisms/FeatureGrid.vue` |
| O07 | RecentStrip | 近期使用（橫向 chips） | `ui/organisms/RecentStrip.vue` |
| O08 | ChatMap | 對話框內的地圖（標點，點標點看說明） | `ui/organisms/ChatMap.vue` |
| P01 | HomePage | 首頁（對話框單一入口） | `pages/HomePage.vue` |
| P02 | SourcesPage | 資料來源 | `pages/SourcesPage.vue` |
| P03 | UiGalleryPage | UI 元件總覽（每個元件標示編號） | `pages/UiGalleryPage.vue` |
| RG-C02 | AnswerCard | 模型回答（串流）＋引用來源 | `addons/rag/ui/AnswerCard.vue` |
| RG-P01 | RagLabPage | 裝置端 RAG 實驗頁（硬體檢查、下載模型、提問） | `addons/rag/ui/RagLabPage.vue` |
| T01 | PageContainer | 頁面外框 | `ui/templates/PageContainer.vue` |
| T02 | DetailPage | 詳細頁模板 | `ui/templates/DetailPage.vue` |
| XX-P01 | TemplatePage | 新功能首頁 | `features/_template/ui/TemplatePage.vue` |
