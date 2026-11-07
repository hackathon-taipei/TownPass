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
| MR-C04 | ElderStatusTag | 長者警示標籤：需要送餐／需要關懷／從未見到（M10），只在需要處理時出現 | `features/meal-relay/ui/ElderStatusTag.vue` |
| MR-C05 | StaleBanner | 斷網時顯示上次更新時間，提醒送出鍵停用（ADR-024） | `features/meal-relay/ui/StaleBanner.vue` |
| MR-C06 | ImageInput | 拍照或選圖，前端壓縮成 base64（M19，≤ IMAGE_MAX_BYTES） | `features/meal-relay/ui/ImageInput.vue` |
| MR-C07 | MapView | 鄰食地圖：定位針用 icon＋三色、落下／換色脈衝／淡出動畫、我的位置企鵝、可選點 | `features/meal-relay/ui/MapView.vue` |
| MR-C08 | TabBar | 分頁列：底線滑動、內容交叉淡入 | `features/meal-relay/ui/TabBar.vue` |
| MR-C09 | BottomSheet | 底部面板：遮罩淡入、面板由下滑入 | `features/meal-relay/ui/BottomSheet.vue` |
| MR-C10 | SubmitButton | 送出按鈕：送出中停用，超過 300ms 才轉圈 | `features/meal-relay/ui/SubmitButton.vue` |
| MR-C11 | QtyInput | 份數輸入框：只能輸入 min 到 max 的整數 | `features/meal-relay/ui/QtyInput.vue` |
| MR-C12 | ToastHost | 提示訊息：底部上移淡入、4 秒後淡出 | `features/meal-relay/ui/ToastHost.vue` |
| MR-C13 | StatCard | 統計卡：數字平滑變化並底色提示一次 | `features/meal-relay/ui/StatCard.vue` |
| MR-C14 | FoodRow | 食物列：剩餘、派出中、已送達份數平滑變化、狀態晶片（三色）、到期倒數條、過期變淡、有照片時左側縮圖 | `features/meal-relay/ui/FoodRow.vue` |
| MR-C15 | ClaimRow | 申請列：狀態晶片換色、送餐進度條（已派送 → 配送中 → 完成） | `features/meal-relay/ui/ClaimRow.vue` |
| MR-C16 | AllergenWarning | 過敏原衝突警告：有交集時展開（C3） | `features/meal-relay/ui/AllergenWarning.vue` |
| MR-C17 | VisitResultPicker | 拜訪結果三選一：選「放門口」時拍照鈕展開（C4） | `features/meal-relay/ui/VisitResultPicker.vue` |
| MR-C18 | SupplierGate | 提供者申請狀態：申請表 → 審核中卡片 → 通過後進入提供者頁（D1、D2） | `features/meal-relay/ui/SupplierGate.vue` |
| MR-C19 | ReviewList | 審核清單：店面照片縮圖（選填）、按通過／不通過 → 晶片變色 → 整列收合（D3） | `features/meal-relay/ui/ReviewList.vue` |
| MR-C20 | AllergenChips | 過敏原晶片勾選：11 類，點一下換色（D8） | `features/meal-relay/ui/AllergenChips.vue` |
| MR-C21 | PageTransition | 頁面切換：載入骨架 → 內容淡入上移；身分或資料重置時舊畫面淡出再換新（E1、E2、E3） | `features/meal-relay/ui/PageTransition.vue` |
| MR-C22 | ResetDemoButton | 重置示範資料：送出中轉圈，成功後提示並通知頁面淡出淡入（E3） | `features/meal-relay/ui/ResetDemoButton.vue` |
| MR-C23 | VolunteerAvatar | 志工的企鵝頭像：依志工 id 固定分到 6 隻之一，可輕輕搖擺 | `features/meal-relay/ui/VolunteerAvatar.vue` |
| MR-C30 | HomeIntro | 首頁提醒卡：長者不用操作 App，需要送餐或關懷請洽里長或社區關懷據點（§1、§2） | `features/meal-relay/ui/HomeIntro.vue` |
| MR-C31 | HomeStationList | 首頁「附近關懷據點」：每列定位圖示、據點名稱、地址、右箭頭，點一列開地址與地圖面板 | `features/meal-relay/ui/HomeStationList.vue` |
| MR-C32 | HomeVolunteerInfo | 「想成為志工？」收合列：正式版由據點經臺北市志工管理整合平臺招募、在臺北 E 大受訓（§1），本作品不做志工申請 | `features/meal-relay/ui/HomeVolunteerInfo.vue` |
| MR-C33 | HomeEntryCard | 首頁依角色的主按鈕：圖示＋文字＋右箭頭（我要提供食物／管理我的食物／進入志工頁／打開報到 QR） | `features/meal-relay/ui/HomeEntryCard.vue` |
| MR-C35 | SupplierApplyForm | 申請成為提供者：單位名稱、類型（MR-C92）、位置與地址（MR-C93）、店面照片（MR-C06，選填，個人不顯示）→ applySupplier | `features/meal-relay/ui/SupplierApplyForm.vue` |
| MR-C36 | PointPicker | 食物點清單：選一個食物點上架，或新增食物點（MR-C37） | `features/meal-relay/ui/PointPicker.vue` |
| MR-C37 | PointCreateForm | 新增食物點：名稱、位置（MR-C02）、地址（選填）、入口照片（MR-C06，選填）→ createPoint（kind = custom） | `features/meal-relay/ui/PointCreateForm.vue` |
| MR-C38 | FoodPublishForm | 上架食物：步驟列（MR-C63）、先拍照（MR-C06，可略過），再填名稱、類別（MR-C89）、份數（MR-C68）、最晚食用時間、過敏原（MR-C90）、食物點（#point 插槽） | `features/meal-relay/ui/FoodPublishForm.vue` |
| MR-C39 | FoodEditSheet | 修改一批食物：份數（MR-C68 NumberStepper，下限＝派出中＋已送達，M14、V21）與最晚食用時間，用 MR-C09 BottomSheet | `features/meal-relay/ui/FoodEditSheet.vue` |
| MR-C40 | TaskCard | 派送任務卡：長者代號、地址（可複製）、警示、要做的事、地圖（據點、這位長者、我）、過敏、要送的餐、回報 | `features/meal-relay/ui/TaskCard.vue` |
| MR-C41 | TaskMeal | 任務卡的送餐區：要送的餐（申請列）、食物照片（點了放大）、過敏原警告、取餐與取消這份餐 | `features/meal-relay/ui/TaskMeal.vue` |
| MR-C42 | VisitReportSheet | 拜訪回報底部面板：結果三選一、放門口拍照、送出 | `features/meal-relay/ui/VisitReportSheet.vue` |
| MR-C43 | CheckinPanel | 志工報到：App 掃描據點 QR，沒有 App 時貼上 QR 文字 | `features/meal-relay/ui/CheckinPanel.vue` |
| MR-C44 | TodayStatus | 志工今天的狀態：報到的據點、報到時間、進行中的任務數、前往我的任務 | `features/meal-relay/ui/TodayStatus.vue` |
| MR-C45 | StationQrCode | 據點的報到 QR code：斷網時改顯示「連線中斷，QR 無法更新」 | `features/meal-relay/ui/StationQrCode.vue` |
| MR-C46 | QrCountdown | QR 更新倒數：「N 秒後更新」與倒數條排成一列 | `features/meal-relay/ui/QrCountdown.vue` |
| MR-C47 | CheckinList | 今天報到的志工清單：標題「今天報到・N 位」，新的在上 | `features/meal-relay/ui/CheckinList.vue` |
| MR-C48 | CheckinRow | 今天報到的一位志工：企鵝頭像、名字、報到時間（淺灰圓角列） | `features/meal-relay/ui/CheckinRow.vue` |
| MR-C49 | StationQrCard | 據點名稱膠囊、掃描說明、報到 QR code 與更新倒數 | `features/meal-relay/ui/StationQrCard.vue` |
| MR-C50 | AdminShell | 管理系統外框：鄰食蜂頁首（MR-C60）＋右側動作；寬度 ≥ 1024px 多欄，以下一欄（最寬 7xl） | `features/meal-relay/ui/AdminShell.vue` |
| MR-C51 | ReviewPanel | 待審核表格：單位名稱（店面照片 MR-C57）、類型、位置（地址，沒有就座標）、通過／不通過（先確認 MR-C67）＋剛審核的結果；離線時按鈕停用 | `features/meal-relay/ui/ReviewPanel.vue` |
| MR-C52 | BoardPanel | 服務看板：今天的服務概況（5 張統計卡 MR-C13＋地圖 MR-C07 與圖例 MR-C58）、食物去向（照片、剩餘｜已派送｜已送達），已結束的收合（MR-C59） | `features/meal-relay/ui/BoardPanel.vue` |
| MR-C53 | ElderForm | 長者表單：代號（長者 id，唯讀）、稱呼、所屬據點、模擬地址、過敏原（MR-C01）、下次關懷時間；「更多設定」（MR-C65）裡是下次送餐時間與位置（MR-C02）；「儲存變更」 | `features/meal-relay/ui/ElderForm.vue` |
| MR-C54 | ElderRoster | 長者名冊清單：「新增長者」、每位長者的人像圖示、稱呼、代號與據點、狀態（需要送餐／需要關懷／近期已見到）、右箭頭；點一位發 edit | `features/meal-relay/ui/ElderRoster.vue` |
| MR-C55 | FoodThumb | 食物照片縮圖：有照片才顯示，替代文字用食物名稱（M19） | `features/meal-relay/ui/FoodThumb.vue` |
| MR-C56 | CategoryIcon | 分類 icon＋中文：食物類別、提供者類型、食物點種類（合約 §4，lucide 單色） | `features/meal-relay/ui/CategoryIcon.vue` |
| MR-C57 | PlacePhoto | 地點照片縮圖（入口、店面）：點一下用底部面板（MR-C09）放大；圖片讀不到就整個隱藏 | `features/meal-relay/ui/PlacePhoto.vue` |
| MR-C58 | MapLegend | 地圖圖例：定位針的 icon＋文字（據點、長者、我），跟著地圖上真的有的定位針 | `features/meal-relay/ui/MapLegend.vue` |
| MR-C59 | EndedGroup | 已結束的項目收合成一行「已結束 N 批」，點了才展開 | `features/meal-relay/ui/EndedGroup.vue` |
| MR-C60 | BrandHeader | 品牌頁首：企鵝＋「鄰食蜂」字標＋頁面標題；banner 變體為淺青底、標題置中 | `features/meal-relay/ui/BrandHeader.vue` |
| MR-C61 | BrandHero | 首頁主視覺：完整標誌＋兩行標語 | `features/meal-relay/ui/BrandHero.vue` |
| MR-C62 | MascotBadge | 企鵝圓形頭像：可帶光芒，完成畫面可帶右下角打勾 | `features/meal-relay/ui/MascotBadge.vue` |
| MR-C63 | StepIndicator | 步驟列：圖示（或數字）＋文字＋箭頭，標示目前步驟 | `features/meal-relay/ui/StepIndicator.vue` |
| MR-C64 | InfoNote | 淺黃提醒卡：圖示＋文字，可帶第二行小字 | `features/meal-relay/ui/InfoNote.vue` |
| MR-C65 | Accordion | 收合列：標題、右側晶片、箭頭；群組模式一次只展開一個 | `features/meal-relay/ui/Accordion.vue` |
| MR-C66 | SegmentedTabs | 兩到三格的分段切換：v-model，可與網址 ?tab= 同步，格子可帶數字徽章 | `features/meal-relay/ui/SegmentedTabs.vue` |
| MR-C67 | ConfirmDialog | 確認視窗：標題、說明、確認／取消；危險動作的確認鍵是紅色，開啟時焦點在「取消」，Esc 等於取消 | `features/meal-relay/ui/ConfirmDialog.vue` |
| MR-C68 | NumberStepper | −／數字／+：有上下限，到限制時按鈕停用，中間的數字可以直接輸入 | `features/meal-relay/ui/NumberStepper.vue` |
| MR-C70 | HomeStationSheet | 首頁據點面板：底部面板顯示據點地址，以及只有這個據點的地圖 | `features/meal-relay/ui/HomeStationSheet.vue` |
| MR-C85 | InventoryRow | 庫存的一批食物：照片、名稱、最晚食用時間、剩餘／派出中／已送達、修改與下架 | `features/meal-relay/ui/InventoryRow.vue` |
| MR-C86 | SupplierReviewStatus | 提供者申請的審核中／未通過畫面：企鵝、狀態、說明（未通過時含原因）、重新整理 | `features/meal-relay/ui/SupplierReviewStatus.vue` |
| MR-C87 | InventoryPanel | 「我的庫存」分頁：三欄總計、進行中的食物（修改、下架）、等待派送提醒、已結束收合、上架新食物 | `features/meal-relay/ui/InventoryPanel.vue` |
| MR-C88 | InventoryTotals | 我的庫存的三欄總計：剩餘、派出中、已送達（M1），數字平滑變化 | `features/meal-relay/ui/InventoryTotals.vue` |
| MR-C89 | CategoryPicker | 食物類別晶片：便當、麵包、蔬果、其他；「其他」展開成乾貨、飲料、其他（合約 §4 FoodCategory） | `features/meal-relay/ui/CategoryPicker.vue` |
| MR-C90 | AllergenField | 上架的過敏原欄位：已選的晶片可按 × 移除，「選擇過敏原」開底部面板（MR-C09）裡的 MR-C01 AllergenChecklist | `features/meal-relay/ui/AllergenField.vue` |
| MR-C91 | PointField | 上架的食物點欄位：目前選的食物點＋「變更」，開底部面板（MR-C09）裡的 MR-C36 PointPicker（可新增食物點） | `features/meal-relay/ui/PointField.vue` |
| MR-C92 | OrgTypePicker | 提供者類型 5 格：店家、學校、機關、個人、其他（合約 §4 OrgType），圖示＋文字，選中時有勾 | `features/meal-relay/ui/OrgTypePicker.vue` |
| MR-C93 | ApplyLocationField | 申請表的單位位置：小地圖預覽（MR-C07）、地址文字（選填）、「在地圖上選位置」開底部面板（MR-C09）裡的 MR-C02 LocationPicker | `features/meal-relay/ui/ApplyLocationField.vue` |
| MR-C95 | StationNamePill | 據點報到頁的據點名稱膠囊：淺青底、粗體大字 | `features/meal-relay/ui/StationNamePill.vue` |
| MR-P01 | HomePage | 鄰食蜂首頁：主視覺、依角色的主按鈕、長者不用操作 App、附近關懷據點（點開看位置）、想成為志工？ | `features/meal-relay/ui/HomePage.vue` |
| MR-P04 | VolunteerPage | 志工頁：掃描據點 QR 報到、今天的狀態、前往我的任務（沒有長者清單或地圖） | `features/meal-relay/ui/VolunteerPage.vue` |
| MR-P05 | TaskPage | 我的任務：只有進行中的任務，取餐、取消、拜訪回報，回報後任務消失 | `features/meal-relay/ui/TaskPage.vue` |
| MR-P06 | SupplierPage | 提供者頁（設計 v2）：申請 → 審核中／未通過 → 我的庫存｜上架食物（分頁與網址 ?tab= 同步） | `features/meal-relay/ui/SupplierPage.vue` |
| MR-P07 | StationPage | 據點頁：鄰食蜂頁首、據點名稱、定時更新的報到 QR code 與倒數、今天報到 | `features/meal-relay/ui/StationPage.vue` |
| MR-P08 | AdminPage | 管理系統：待審核（數字徽章）｜服務看板｜長者名冊三個分頁（與網址 ?tab= 同步）、重置示範資料（先確認）；只有 admin 能用 | `features/meal-relay/ui/AdminPage.vue` |
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
