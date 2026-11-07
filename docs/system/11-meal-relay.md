# 鄰食轉運站（meal-relay）系統規格與合約

> 版本 v2.0｜2026-11-07｜整合者 `n753951f` 定案。取代隊長版 `GLOSSARY.md`／`ARCHITECTURE.md` v1.1 的認領模式，沿用其中的拜訪結果、`refresh`、相對時間種子、錯誤代碼與驗收清單。
> **這份是合約：** 欄位、列舉值、端點、錯誤代碼、規則編號（M1～M20）以本文件為準。要改合約先停下來在工單留言（`townpass-ticket` D 節）。實作規則時在程式註解標規則編號，例如 `# M7`。

## 1. 目標

提供者（店家、學校、機關）把多出來的食物上架到地圖上的食物點；長者自己找食物自取，或請志工送。志工到據點掃 QR code 報到，系統自動把該據點還沒送餐、還沒關懷的長者派給他，並盡量讓同一位長者由同一位志工服務。

**不做：** 真實登入、推播、導航與路線規劃、慢性病或飲食需求、AI 聊天、多語。

## 2. 角色

一個帳號只有一個角色。帳號與角色**只由種子 JSON 匯入**，前端沒有選角色的畫面。

| 角色 | 代碼 | 在哪裡用 | 身分怎麼來 | 做什麼 |
|---|---|---|---|---|
| 長者 | `elder` | 台北通 App | 沒有匯入或沒有角色的帳號一律是長者 | 勾過敏、點位置、找食物、申請自取或送餐 |
| 志工 | `volunteer` | 台北通 App | 匯入，綁一個據點 | 掃據點 QR 報到、接自動派送的任務、送餐與關懷、新增長者 |
| 提供者 | `supplier` | 台北通 App | 長者帳號送出申請，管理員通過後變成提供者 | 選或新增食物點、上架食物、確認自取 |
| 據點 | `station` | 據點的手機或平板開台北通 App | 匯入，綁一個據點 | 顯示據點 QR code、看今天報到的志工 |
| 管理員 | `admin` | 管理系統（獨立網頁，不在 App 裡） | 匯入 | 審核提供者、看板與統計、管理長者與合併重複、重置 Demo |

**身分識別：** 前端每個請求帶 `X-Demo-User: <account id>`。App 內的 account id 是台北通 `userinfo` 的 `id`；網址帶 `?as=<account id>` 時改用該值並存在裝置上（測試與管理系統登入用，不是畫面上的選項）。後端只看角色判斷權限（不是安全機制，評審問到時說明正式版要接台北通登入）。

## 3. 資料表

全部在後端 `features/meal_relay/models.py`。表名前綴 `meal_`。位置存 `lat`、`lng` 兩欄，API 一律輸出 `{lat, lng}` 物件（`Location`）。時間存 UTC，API 輸出 ISO 8601 含 `+08:00`。ID 由後端產生，格式 `<前綴>-<8 碼隨機>`；種子資料用固定 ID。

| 表 | 欄位 | 說明 |
|---|---|---|
| `meal_account` 帳號 | `id` PK（前綴 `u`；或台北通 id）、`role`、`name`、`station_id`?、`supplier_id`?、`elder_id`?、`created_at` | `station_id`：志工與據點帳號必填 |
| `meal_station` 據點 | `id` PK（`st`）、`name`、`lat`、`lng`、`checkin_code`（QR 內容用，見 M15）、`source`（開放資料名稱或「模擬」） | 社區照顧關懷據點 |
| `meal_supplier` 提供者 | `id` PK（`s`）、`account_id`、`name`、`org_type`、`lat`、`lng`、`status`、`created_at`、`reviewed_at`? | 申請時填單位名稱、類型、位置 |
| `meal_point` 食物點 | `id` PK（`p`）、`name`、`kind`、`lat`、`lng`、`source`、`created_by`? | 多位提供者共用；開放資料預先載入 |
| `meal_food` 食物 | `id` PK（`f`）、`point_id`、`supplier_id`、`name`、`category`、`allergens`（JSON）、`qty`、`expires_at`、`image_id`?、`source_note`、`closed`（下架，預設 false）、`created_at` | `remaining`、`status`、`unclaimed` 不存，回應時計算 |
| `meal_image` 圖片 | `id` PK（`img`）、`mime`、`data`（bytes）、`size`、`uploaded_by`、`created_at` | 食物圖片與放門口照片（M19） |
| `meal_elder` 長者 | `id` PK（`e`）、`alias`、`account_id`?（自己用 App 的長者）、`station_id`、`lat`、`lng`、`allergens`（JSON）、`created_by`、`created_at`、`last_seen_at`?、`last_meal_at`?、`next_care_at`?、`next_meal_at`?、`primary_volunteer_id`?、`merged_into`? | 全部是模擬資料；不存姓名、身分證、電話、地址文字 |
| `meal_claim` 申請 | `id` PK（`c`）、`food_id`、`elder_id`、`qty`、`method`、`status`、`requested_by`、`volunteer_id`?、`assignment_id`?、`created_at`、`claimed_at`?、`picked_up_at`?、`done_at`?、`cancel_reason`? | 每筆綁一位長者 |
| `meal_visit` 拜訪 | `id` PK（`vi`）、`elder_id`、`volunteer_id`、`kind`、`claim_id`?、`assignment_id`?、`result`、`photo_image_id`?、`visited_at` | |
| `meal_checkin` 報到 | `id` PK（`ck`）、`volunteer_id`（帳號 id）、`station_id`、`checked_in_at` | |
| `meal_assignment` 派送任務 | `id` PK（`as`）、`checkin_id`、`volunteer_id`、`elder_id`、`station_id`、`needs_meal`、`needs_care`、`claim_id`?、`status`、`assigned_at`、`expires_at`、`done_at`? | 自動派送的結果 |

`volunteer_id` 一律是志工的**帳號 id**（不另建志工表）。

## 4. 列舉值

| 型別 | 值（中文） |
|---|---|
| `Role` | `elder` 長者、`volunteer` 志工、`supplier` 提供者、`station` 據點、`admin` 管理員 |
| `Allergen`（衛福部公告 11 類） | `crustacean` 甲殼類、`mango` 芒果、`peanut` 花生、`milk` 牛奶羊奶、`egg` 蛋、`nut` 堅果類、`sesame` 芝麻、`gluten` 含麩質穀物、`soy` 大豆、`fish` 魚類、`sulfite` 亞硫酸鹽 |
| `FoodCategory` | `meal_box` 熟食便當、`bakery` 麵包點心、`produce` 生鮮蔬果、`dry_goods` 乾貨罐頭、`drink` 飲品、`other` 其他 |
| `OrgType` | `person` 個人、`school` 學校、`agency` 機關、`shop` 店家、`other` 其他 |
| `SupplierStatus` | `pending` 審核中、`approved` 已通過、`rejected` 未通過 |
| `PointKind` | `station` 關懷據點、`village_office` 里辦公處、`school` 學校、`custom` 自訂 |
| `FoodStatus`（計算） | `open` 可申請、`claimed` 已全數申請、`expired` 已過期、`closed` 已下架 |
| `ClaimMethod` | `pickup` 自取、`delivery` 送餐 |
| `ClaimStatus` | `requested` 待接單、`ready_for_pickup` 待領取、`claimed` 已接單、`delivering` 配送中、`done` 完成、`cancelled` 取消 |
| `VisitKind` | `meal` 送餐、`care` 純關懷 |
| `VisitResult` | `seen` 見到本人、`left_at_door` 放門口（附照片）、`returned` 未見到，帶回 |
| `AssignmentStatus` | `assigned` 進行中、`done` 完成、`released` 釋出 |

## 5. 設定值（`MEAL_RELAY_MODE=demo|prod`，預設 `demo`）

| 名稱 | demo | prod | 用途 |
|---|---|---|---|
| `CLAIM_WINDOW_SEC` | 20 | 600 | 上架超過這段時間仍有剩餘 → `unclaimed` 提醒（M5） |
| `CARE_ALERT_DAYS` | 1 | 3 | 沒設下次關懷時間時的關懷警示天數（M10） |
| `MEAL_ALERT_DAYS` | 1 | 3 | 沒設下次送餐時間時的送餐警示天數（M10） |
| `DISPATCH_LIMIT` | 3 | 5 | 一次報到最多派幾位長者（M16） |
| `ASSIGNMENT_TTL_MIN` | 30 | 240 | 派送任務多久沒完成就釋出（M18） |
| `MAX_QTY_PER_CLAIM` | 2 | 2 | 一筆申請最多份數（M3） |
| `DUPLICATE_RADIUS_M` | 30 | 30 | 新增長者時的重複提示距離（M12） |
| `IMAGE_MAX_BYTES` | 200000 | 200000 | 圖片上限，前端先壓到長邊 800px（M19） |

## 6. 業務規則

| 編號 | 規則 |
|---|---|
| M1 | `remaining = qty − Σ 未取消申請的 qty`。`remaining = 0` → `status = claimed`；`closed` → `closed`；超過 `expires_at` → `expired`。優先序：`closed` > `expired` > `claimed` > `open`。 |
| M2 | 申請時預扣份數：只有 `status = open` 的食物可以申請；`qty > remaining` → `QTY_EXCEEDED`。 |
| M3 | 每筆申請綁一位長者，`qty` 為 1～`MAX_QTY_PER_CLAIM`。 |
| M4 | 過敏原：食物的 `allergens` 與長者的 `allergens` 有交集就不能申請 → `ALLERGEN_CONFLICT`。查詢食物時傳 `for_elder` 會直接篩掉衝突的食物。 |
| M5 | `unclaimed = status = open 且 now > created_at + CLAIM_WINDOW_SEC`。只是提醒，仍可申請。 |
| M6 | 過期：`expires_at` 已過，未完成的申請（`requested`、`ready_for_pickup`、`claimed`、`delivering`）一律 `cancelled`（`cancel_reason = expired`）。 |
| M7 | 申請的初始狀態：自取 → `ready_for_pickup`；長者申請送餐 → `requested`；志工替長者申請送餐 → `claimed`（`volunteer_id = 自己`）。只有長者本人或志工能申請。 |
| M8 | 狀態轉換：`requested →(志工接單) claimed →(取餐) delivering →(回報) done`；`ready_for_pickup →(提供者確認領取) done`；`requested`、`ready_for_pickup`、`claimed`、`delivering` 都可 `cancelled`。取消就退回份數（M1 自然成立）。 |
| M9 | 拜訪回報：`seen` → 更新 `last_seen_at`，清空 `next_care_at`；`kind = meal` 的 `seen` 或 `left_at_door` → 申請 `done`、更新 `last_meal_at`、清空 `next_meal_at`；`returned` → 申請 `cancelled`（`cancel_reason = returned`）。`seen`、`left_at_door` 會把 `primary_volunteer_id` 設成這位志工。 |
| M10 | 長者警示：`care_due = next_care_at 有值 ? now ≥ next_care_at : (last_seen_at 為空 或 超過 CARE_ALERT_DAYS)`；`meal_due` 同理用 `next_meal_at`、`last_meal_at`、`MEAL_ALERT_DAYS`；另外有 `requested` 申請的長者 `meal_due = true`。`alert = care_due 或 meal_due`。 |
| M11 | `left_at_door` 必須 `kind = meal`、必須附 `photo_image_id`，生鮮蔬果（`produce`）不能放門口 → `FRESH_CANNOT_LEAVE`。 |
| M12 | 新增長者時，`DUPLICATE_RADIUS_M` 公尺內已有長者 → 回應附 `nearby`，前端提示；不阻擋。自己用 App 的長者以 `account_id` 唯一。 |
| M13 | 志工只能看、改自己據點的長者與申請；管理員全部。合併長者：被合併的設 `merged_into`，不再出現在清單、不再被派送。 |
| M14 | 提供者只有 `approved` 才能新增食物點、上架、確認自取；只能改自己的食物。 |
| M15 | 據點 QR 內容固定為 `meal-relay:checkin:<checkin_code>`。`checkin_code` 由種子產生，不等於據點 id。 |
| M16 | 自動派送（志工報到時）：候選 = 該據點 `alert = true`、未合併、且沒有被別的志工以 `assigned` 任務持有的長者。排序：①`primary_volunteer_id` 是自己 ②沒有主要志工 ③主要志工今天沒報到；同組內依 有 `requested` 申請 > `last_seen_at` 為空 > 逾期天數多 > 離據點近。取前 `DISPATCH_LIMIT` 位。主要志工今天已報到的長者留給他。 |
| M17 | 派送任務內容：長者有 `requested` 申請 → 把該申請改成 `claimed` 給這位志工並掛上任務；否則 `meal_due` → 自動挑食物（`open`、`remaining ≥ 1`、無過敏衝突，依離據點近、到期早排序）建立 `claimed` 的送餐申請；找不到合適食物 → `claim_id` 為空，任務仍保留關懷。自動建立的申請 `requested_by` 必須是志工帳號 id、`assignment_id` 是任務 id（M18 靠這兩欄分辨，見 `meal_relay.is_auto_claim`）。同一位志工重複報到時回傳既有的進行中任務，不重複派送。 |
| M18 | 任務完成：該長者有一筆拜訪回報就 `done`。任務超過 `expires_at` 未完成 → `released`：自動建立且還沒取餐的申請取消；原本是長者 `requested` 的申請退回 `requested`；已在 `delivering` 的不動。 |
| M19 | 圖片：前端壓縮後以 base64 上傳，後端檢查 mime 為 `image/jpeg`、`image/png`、`image/webp` 且大小 ≤ `IMAGE_MAX_BYTES`。 |
| M20 | `refresh(now)`：每個請求在業務邏輯前執行，處理 M6、M18（寫回資料庫）；M1、M5、M10 在組裝回應時計算。不用背景排程。 |

## 7. 錯誤格式

```json
{ "detail": { "code": "QTY_EXCEEDED", "message": "申請份數超過剩餘份數" } }
```

| 代碼 | HTTP | 條件 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 沒帶 `X-Demo-User`（未匯入的 id 不算錯，視為長者） |
| `FORBIDDEN_ROLE` | 403 | 角色不能呼叫這個端點 |
| `NOT_OWNER` | 403 | 不是自己的資料（提供者的食物、志工的申請或任務） |
| `WRONG_STATION` | 403 | 志工操作其他據點的長者，或掃了其他據點的 QR |
| `SUPPLIER_NOT_APPROVED` | 403 | 未通過的提供者上架 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `VALIDATION_ERROR` | 422 | 欄位缺漏、格式錯誤、多送欄位 |
| `QTY_EXCEEDED` | 409 | M2 |
| `FOOD_NOT_OPEN` | 409 | 食物不是 `open` |
| `ALLERGEN_CONFLICT` | 409 | M4 |
| `INVALID_STATE` | 409 | 狀態不允許這個操作 |
| `ALREADY_APPLIED` | 409 | 已申請過提供者 |
| `ELDER_PROFILE_REQUIRED` | 409 | 長者還沒建立自己的資料（位置必填）就申請 |
| `FRESH_CANNOT_LEAVE` | 409 | M11 |
| `PHOTO_REQUIRED` | 422 | M11 |
| `IMAGE_TOO_LARGE` | 413 | M19 |
| `OFFLINE` | 0（只在前端） | 連不上後端；讀取改用裝置上的資料，寫入直接失敗 |

## 8. 端點（前綴 `/meal-relay`，全部要帶 `X-Demo-User`）

| 動作 | 方法與路徑 | 角色 | 後端套件 |
|---|---|---|---|
| `getMe` | `GET /me` | 全部 | `meal_account` |
| `resetDemo` | `POST /demo/reset` | admin | `meal_account` |
| `applySupplier` | `POST /suppliers` | elder | `meal_account` |
| `getMySupplier` | `GET /suppliers/mine` | elder、supplier | `meal_account` |
| `listSuppliers` | `GET /suppliers?status=` | admin | `meal_account` |
| `reviewSupplier` | `POST /suppliers/{id}/approve`、`/reject` | admin | `meal_account` |
| `listPoints` | `GET /points?category=&for_elder=` | 全部 | `meal_food` |
| `createPoint` | `POST /points` | supplier | `meal_food` |
| `listFoods` | `GET /foods?point_id=&category=&for_elder=&mine=1` | 全部（`mine` 限 supplier） | `meal_food` |
| `getFood` | `GET /foods/{id}` | 全部 | `meal_food` |
| `createFood` | `POST /foods` | supplier | `meal_food` |
| `updateFood` | `PATCH /foods/{id}`（`qty`、`closed`） | supplier（自己的） | `meal_food` |
| `uploadImage` | `POST /images` | supplier、volunteer | `meal_food` |
| `getImage` | `GET /images/{id}`（回傳圖片本身，不需 header） | 全部 | `meal_food` |
| `createClaim` | `POST /claims` | elder（自己）、volunteer（自己據點的長者） | `meal_claim` |
| `listMyClaims` | `GET /claims/mine` | elder、volunteer | `meal_claim` |
| `listStationClaims` | `GET /claims?status=requested` | volunteer（自己據點） | `meal_claim` |
| `listPickupClaims` | `GET /claims/pickup` | supplier（自己的食物、`ready_for_pickup`） | `meal_claim` |
| `acceptClaim` | `POST /claims/{id}/accept` | volunteer | `meal_claim` |
| `pickupClaim` | `POST /claims/{id}/pickup` | volunteer（自己的） | `meal_claim` |
| `confirmPickup` | `POST /claims/{id}/confirm-pickup` | supplier（自己的食物） | `meal_claim` |
| `cancelClaim` | `POST /claims/{id}/cancel` | 申請人、該志工、該提供者 | `meal_claim` |
| `getMyElder` | `GET /elders/me` | elder | `meal_elder` |
| `upsertMyElder` | `PUT /elders/me`（`location`、`allergens`、`alias`?） | elder | `meal_elder` |
| `listElders` | `GET /elders` | volunteer（自己據點）、admin | `meal_elder` |
| `createElder` | `POST /elders` | volunteer（自己據點）、admin | `meal_elder` |
| `updateElder` | `PATCH /elders/{id}` | volunteer（自己據點）、admin | `meal_elder` |
| `findNearbyElders` | `GET /elders/nearby?lat=&lng=` | volunteer、admin | `meal_elder` |
| `mergeElder` | `POST /elders/{id}/merge`（`{into}`） | admin | `meal_elder` |
| `reportVisit` | `POST /visits` | volunteer | `meal_elder` |
| `listStations` | `GET /stations` | 全部 | `meal_dispatch` |
| `getMyStation` | `GET /stations/mine`（含 `qr_text`、今天的報到） | station | `meal_dispatch` |
| `checkIn` | `POST /checkins`（`{qr_text}`） | volunteer | `meal_dispatch` |
| `listMyAssignments` | `GET /assignments/mine` | volunteer | `meal_dispatch` |
| `getBoard` | `GET /board` | admin | `meal_board` |

請求與回應的欄位以 `features/meal_relay/schemas.py` 與前端 `features/meal-relay/data/types.ts` 為準（兩邊型別必須一致，由 T-107 建立）。重點：

- `Me`：`{id, role, name, station_id, supplier: Supplier|null, elder: Elder|null}`
- `Food`：資料表欄位 ＋ `location`（食物點位置）、`point_name`、`supplier_name`、`remaining`、`status`、`unclaimed`、`image_url`
- `Elder`：資料表欄位 ＋ `location`、`care_due`、`meal_due`、`alert`、`days_since_seen`、`days_since_meal`、`pending_request`（有沒有 `requested` 申請）
- `Claim`：資料表欄位 ＋ `food`（`Food`）、`elder`（`{id, alias, location}`）
- `Assignment`：資料表欄位 ＋ `elder`（`Elder`）、`claim`（`Claim|null`）
- `CheckInResult`：`{checkin, station, assignments: Assignment[]}`
- `Board`：`{stations, points, foods, elders, claims（不含 cancelled）, stats: {foods_open, delivered_today, seen_today, alerts, checkins_today}}`；「今天」以 `+08:00` 判斷

## 9. 程式位置

### 後端（每個套件一張工單，彼此不改對方的檔案）
| 套件 | 內容 | 誰做 |
|---|---|---|
| `features/meal_relay/` | 資料層（`models.py`、`repo.py`、`schemas.py`）、共用規則（`service.py`：`refresh`、M1、M4、M5、M10 計算、轉成回應型別、種子匯入與重置）、身分（`deps.py`：`CurrentAccount`、`require_roles`、錯誤）、種子 `seed/*.json`。**沒有路由** | T-107 |
| `features/meal_account/` | 帳號、提供者申請與審核、重置 | T-108 |
| `features/meal_food/` | 食物點、食物、圖片 | T-109 |
| `features/meal_claim/` | 申請 | T-110 |
| `features/meal_elder/` | 長者、拜訪回報 | T-111 |
| `features/meal_dispatch/` | 據點、報到、自動派送、任務釋出 | T-112 |
| `features/meal_board/` | 看板 | T-113 |

其他套件只從 `townpass_backend.features.meal_relay`（套件根）使用共用的東西（B5）。各套件的路由一律用 `meal_router("<tag>")` 建立（前綴 `/meal-relay`，錯誤自動轉成 §7 格式，422 也是），身分用 `CurrentAccount`、`require_roles(...)`，業務錯誤丟 `MealError`。不要直接查 `meal_` 表，用 `meal_relay.repo` 與轉換函數 `to_food`、`to_elder`…。

回應的空值約定：`GET /elders/me`、`GET /suppliers/mine` 沒有資料時回 `null`；`mergeElder` 回傳保留下來的長者；`Station` 不含 `checkin_code`，只有據點自己的 `GET /stations/mine` 給 `qr_text`。

### 前端（`services/web/src/features/meal-relay/`，功能代碼 `MR`）
| 路由 | 頁面 | 檔案 | 誰做 |
|---|---|---|---|
| `/#/f/meal-relay` | MR-P01 首頁：注意事項、進入、切換為志工、我要提供食物、管理系統連結 | `ui/HomePage.vue`、`logic/home.ts` | T-116 |
| `elder` | MR-P02 長者頁：過敏與位置 → 種類 → 地圖 | `ui/ElderPage.vue`、`logic/elder.ts` | T-116 |
| `food/:id` | MR-P03 食物資訊與申請 | `ui/FoodDetailPage.vue`（邏輯在 `logic/elder.ts`） | T-116 |
| `volunteer` | MR-P04 志工頁：據點長者地圖、掃描報到、待接單、新增長者 | `ui/VolunteerPage.vue`、`logic/volunteer.ts` | T-118 |
| `volunteer/tasks` | MR-P05 我的任務與拜訪回報 | `ui/TaskPage.vue`（邏輯在 `logic/volunteer.ts`） | T-118 |
| `supplier` | MR-P06 提供者頁：申請與狀態、食物點地圖、上架、待領取 | `ui/SupplierPage.vue`、`logic/supplier.ts` | T-117 |
| `station` | MR-P07 據點頁：QR code、今天報到 | `ui/StationPage.vue`、`logic/station.ts` | T-119 |
| `admin` | MR-P08 管理系統：登入、審核、看板、長者 | `ui/AdminPage.vue`、`logic/admin.ts` | T-120 |

- `data/*.ts`、`index.ts`（含全部路由與佔位頁面）由 T-107 建立；之後各工單只改自己的 `ui`、`logic` 檔案。邏輯層從 `../data` 取用（`data/index.ts` 統一匯出），圖片網址用 `imageSrc()` 接上後端位址。
- `?as=<id>` 會存在裝置上，之後都用這個帳號；`setAccountId(null)` 清掉後回到台北通帳號。
- 共用的功能元件 `MR-C01`～`MR-C06`（`ui/` 下）與 `logic/shared.ts` 由 T-114 建立。
- 首頁的「進入」依角色導向：elder → `elder`、volunteer → `volunteer`、supplier → `supplier`、station → `station`；admin 只用管理系統網址 `/#/f/meal-relay/admin`。
- 掃描：志工頁按「掃描報到」→ bridge `qr_code_scan`（App 已有，可相機或相簿圖片）；瀏覽器沒有 App 時改成貼上 QR 文字。
- 斷網（ADR-024）：讀取成功時把回應存在裝置上，失敗時回傳上次的資料並標 `stale_at`；寫入在斷網時直接失敗，畫面停用送出鍵。

## 10. 種子資料（`features/meal_relay/seed/`）

| 檔案 | 內容 | 最少筆數 |
|---|---|---|
| `accounts.json` | 帳號與角色 | admin 1、volunteer 3（`u-vol-1`、`u-vol-2` 同據點）、supplier 2（已通過）、elder 帳號 2（1 位已建資料）、station 2、待審核提供者 1 |
| `stations.json` | 據點 | 2，同一行政區 |
| `suppliers.json` | 提供者 | 3（2 通過、1 審核中） |
| `points.json` | 食物點 | 6，含據點、里辦、學校、自訂 |
| `foods.json` | 食物 | 6，含便當、生鮮、有過敏原的、快過期的 |
| `elders.json` | 長者（模擬） | 12：從未見到 2、逾期 3、最近才見過 3、有下次時間 2、有過敏 2；`u-vol-1` 是其中 4 位的主要志工 |
| `claims.json` | 申請 | `requested` 1、`ready_for_pickup` 1 |

時間可寫相對值：`"now"`、`"now+90m"`、`"now-2d"`，匯入時換算。座標用開放資料的真實位置；長者座標放在路上或公共空間，不對應任何住家。`POST /demo/reset` 清空 `meal_` 開頭的表並重新匯入。

## 11. 驗收清單（各工單挑自己相關的寫成測試）

| 編號 | 情境 | 預期 |
|---|---|---|
| V1 | 不帶 `X-Demo-User` | 401 `UNAUTHENTICATED` |
| V2 | 未匯入的 id 呼叫 `GET /me` | `role = elder`、`elder = null` |
| V3 | 志工呼叫 `POST /foods` | 403 `FORBIDDEN_ROLE` |
| V4 | 審核中的提供者上架 | 403 `SUPPLIER_NOT_APPROVED` |
| V5 | 剩 1 份時申請 2 份 | 409 `QTY_EXCEEDED` |
| V6 | 對花生過敏的長者申請含花生的食物 | 409 `ALLERGEN_CONFLICT`；`GET /foods?for_elder=` 不含該食物 |
| V7 | 取消申請 | `remaining` 加回 |
| V8 | 上架後超過 `CLAIM_WINDOW_SEC` | `unclaimed = true`，仍可申請 |
| V9 | 把 `expires_at` 設成過去再呼叫任一 API | 食物 `expired`，未完成申請 `cancelled` |
| V10 | 回報 `seen` | `last_seen_at` 更新、`alert` 依 M10 重算、`primary_volunteer_id` 是該志工 |
| V11 | 生鮮回報 `left_at_door` | 409 `FRESH_CANNOT_LEAVE` |
| V12 | 掃其他據點的 QR | 403 `WRONG_STATION` |
| V13 | `u-vol-1` 報到 | 先拿到自己是主要志工的警示長者，最多 `DISPATCH_LIMIT` 位 |
| V14 | `u-vol-1` 已報到後 `u-vol-2` 報到 | 不會拿到 `u-vol-1` 持有或主要服務的長者 |
| V15 | 同一志工重複報到 | 回傳同一批任務 |
| V16 | 任務過了 `expires_at` | `released`，自動建立的申請取消、份數退回 |
| V17 | 重置 Demo | 回到種子狀態 |

## 12. 工單與平行開發波次

同一波的工單擁有不重疊的檔案，可以交給不同的人或 AI 同時做。下一波要等它依賴的工單合併。

| 波次 | 工單 | 開工條件 |
|---|---|---|
| 0 | T-107（#24） 合約、資料層與骨架 | 無 |
| 1 | T-108（#25） 帳號與審核、T-109（#26） 食物與圖片、T-110（#27） 申請、T-111（#28） 長者與回報、T-112（#29） 報到與派送、T-113（#30） 看板、T-114（#31） 前端共用元件、T-115（#32） 開放資料 | T-107（#24） 合併 |
| 2 | T-116（#33） 首頁與長者頁、T-117（#34） 提供者頁、T-118（#35） 志工頁與掃描、T-119（#36） 據點頁、T-120（#37） 管理系統 | T-114（#31） 合併；實機操作要等對應的後端工單合併（各工單的「依賴」） |
| 3 | T-121（#38） 整合與 Demo 準備 | 全部合併 |

- 後端第 1 波的 6 張彼此獨立：共用的規則（`refresh`、剩餘份數、過敏衝突、警示計算、轉換函數）都在 `meal_relay`。
- 前端第 2 波的 5 張彼此獨立：每張只改自己的頁面檔與 `logic/<角色>.ts`；`data/`、`index.ts` 與共用元件已在前兩波完成。
- 各工單的文件寫在自己的 `README.md` 或 `docs/meal-relay/T-1xx.md`，不改共用的系統文件，避免合併衝突；T-121 統一整理。
- `components.md` 是自動產生的，合併衝突時 rebase 後重跑 `node tools/check-arch.mjs --catalog`。
