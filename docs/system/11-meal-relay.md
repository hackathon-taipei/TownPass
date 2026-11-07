# 鄰食轉運站（meal-relay）系統規格與合約

> 版本 v2.5｜2026-11-08｜v2.5：地址：`meal_station.address`、`meal_point.address`、`meal_supplier.address`（文字，空字串代表沒填）；`Food` 多計算欄位 `point_address`（取餐地點的地址）；`applySupplier`、`createPoint` 可帶選填的 `address`（最長 120 字）。據點與食物點用 T-115 的開放資料機構地址；提供者是模擬地址（標「（模擬）」）；個人提供者（`org_type = person`）後端存空字串，不存住家地址（ADR-030，T-133）。v2.4：提供者店面照片：`meal_supplier.image_id`（選填），`applySupplier` 可帶 `image_id`，`Supplier` 回應多 `image_url`；個人提供者（`org_type = person`）不顯示照片欄位、後端忽略並存 `null`；一般市民可以 `uploadImage`（申請前上傳店面照片）；照片只拍招牌或店門口，不能有人臉、車牌、個人資料（ADR-029，T-129）。v2.3：食物點與據點的入口照片：`meal_point.image_id`、`meal_station.image_id`（選填），`PointCreate` 可帶 `image_id`，`Point`、`Station` 回應多 `image_url`，`Food` 多 `point_image_url`（取餐地點的入口照片）；照片只拍入口或建築外觀，不能有人臉、車牌、門牌號碼（ADR-028，T-128）。v2.2 之後的補充：長者地址 `meal_elder.address`（模擬資料，ADR-027，T-125）。v2.2：長者不使用 App、志工只看得到派給自己的長者、據點 QR 定時更新、提供者看得到庫存去向（ADR-026，T-123）。v2.1：長者不訂餐，餐點一律由系統在志工報到時派發（ADR-025）。整合者 `n753951f` 定案。取代隊長版 `GLOSSARY.md`／`ARCHITECTURE.md` v1.1 的認領模式，沿用其中的拜訪結果、`refresh`、相對時間種子、錯誤代碼與驗收清單。
> **這份是合約：** 欄位、列舉值、端點、錯誤代碼、規則編號（M1～M20）以本文件為準。要改合約先停下來在工單留言（`townpass-ticket` D 節）。實作規則時在程式註解標規則編號，例如 `# M7`。

## 1. 目標

提供者（店家、學校、機關）把多出來的食物上架到地圖上的食物點。**長者不使用 App**：題組「拿不到」的對象本來就沒有手機或不會用，所以由志工代他們拿到餐點與關懷。志工到據點掃 QR code 報到，系統自動把該據點該送餐、該關懷的長者派給他，並自動挑好沒有過敏衝突的餐，盡量讓同一位長者由同一位志工服務。**志工只看得到派給自己的長者，送完就從手機上消失。** 長者名冊由管理員（代表社福單位與里長）在管理系統維護。

**不做：** 真實登入、推播、導航與路線規劃、慢性病或飲食需求、AI 聊天、多語、長者自己操作、志工申請與審核。

**志工從哪裡來（正式版，不在本作品實作）：** 據點依「臺北市政府所屬各機關志願服務管理及運用原則」透過臺北市志工管理整合平臺招募，志工在臺北 E 大完成志願服務基礎訓練（6 小時）與據點的特殊訓練後加入據點。本作品假設匯入的志工帳號都已完成這些程序（2026-11-07 諮詢攤位建議：引用市府現有流程即可，不另做志工申請）。
- [臺北市政府所屬各機關志願服務管理及運用原則](https://laws.gov.taipei/law/LawSearch/LawExport/FL101070?type=0)
- [臺北市志工管理整合平臺](https://newcv101.gov.taipei/)
- [臺北 E 大](https://elearning.taipei/mpage/)（會員資料存在台北通）

## 2. 角色

一個帳號只有一個角色。帳號與角色**只由種子 JSON 匯入**（提供者例外：一般市民申請、管理員通過後變成提供者），前端沒有選角色的畫面。

| 角色 | 代碼 | 在哪裡用 | 身分怎麼來 | 做什麼 |
|---|---|---|---|---|
| 一般市民 | `citizen` | 台北通 App | 沒有匯入的帳號一律是一般市民 | 看說明（長者不用操作、需要送餐請洽里長或據點）、申請成為提供者 |
| 志工 | `volunteer` | 台北通 App | 匯入，綁一個據點（正式版來自市府志工資料，見 §1） | 掃據點 QR 報到、接自動派送的任務、取餐、送餐與關懷、回報。**看不到據點的長者名冊**（M13） |
| 提供者 | `supplier` | 台北通 App | 一般市民送出申請，管理員通過後變成提供者 | 選或新增食物點、上架、改份數與最晚食用時間、下架、看每批食物的去向（剩餘、派出中、已送達）；把食物交給來取餐的志工 |
| 據點 | `station` | 據點的手機或平板開台北通 App | 匯入，綁一個據點 | 顯示會定時更新的報到 QR code（M15）、看今天報到的志工 |
| 管理員 | `admin` | 管理系統（獨立網頁，不在 App 裡） | 匯入 | 審核提供者、看板與統計、維護長者名冊、重置 Demo |
| 長者 | （不是帳號） | **不使用 App** | 由管理員登記在長者名冊（只有代號、座標、過敏） | 開門拿餐。需要服務時找里長或社區關懷據點（實體管道） |

**身分識別：** 前端每個請求帶 `X-Demo-User: <account id>`。App 內的 account id 是台北通 `userinfo` 的 `id`；網址帶 `?as=<account id>` 時改用該值並存在裝置上（測試與管理系統登入用，不是畫面上的選項）。後端只看角色判斷權限（不是安全機制，評審問到時說明正式版要接台北通登入）。

## 3. 資料表

全部在後端 `features/meal_relay/models.py`。表名前綴 `meal_`。位置存 `lat`、`lng` 兩欄，API 一律輸出 `{lat, lng}` 物件（`Location`）。時間存 UTC，API 輸出 ISO 8601 含 `+08:00`。ID 由後端產生，格式 `<前綴>-<8 碼隨機>`；種子資料用固定 ID。資料表只增不減：v2.2 不再使用的欄位保留，一律為空。

| 表 | 欄位 | 說明 |
|---|---|---|
| `meal_account` 帳號 | `id` PK（前綴 `u`；或台北通 id）、`role`（預設 `citizen`）、`name`、`station_id`?、`supplier_id`?、`elder_id`?、`created_at` | `station_id`：志工與據點帳號必填。`elder_id` 保留不用（ADR-026） |
| `meal_station` 據點 | `id` PK（`st`）、`name`、`lat`、`lng`、`checkin_code`（QR 內容用，見 M15）、`source`（開放資料名稱或「模擬」）、`image_id`?（入口照片，v2.3）、`address`（據點地址，v2.5） | 社區照顧關懷據點。入口照片由管理員或種子資料提供（目前種子沒有照片），規定見 M19。`address` 是開放資料的機構地址，空字串代表沒填（ADR-030） |
| `meal_supplier` 提供者 | `id` PK（`s`）、`account_id`、`name`、`org_type`、`lat`、`lng`、`status`、`created_at`、`reviewed_at`?、`image_id`?（店面照片，v2.4）、`address`（單位地址，v2.5） | 申請時填單位名稱、類型、位置，可附店面照片（M19）與單位地址（選填，最長 120 字）；個人提供者一律不存照片，也不存地址（ADR-029、ADR-030）。`address` 只存機構或店面地址，不存住家 |
| `meal_point` 食物點 | `id` PK（`p`）、`name`、`kind`、`lat`、`lng`、`source`、`created_by`?、`image_id`?（入口照片，v2.3）、`address`（食物點地址，v2.5） | 多位提供者共用；開放資料預先載入。提供者新增食物點時可附入口照片（M19）與地址（選填）。`address` 是取餐地點的公開地址，空字串代表沒填（ADR-030） |
| `meal_food` 食物 | `id` PK（`f`）、`point_id`、`supplier_id`、`name`、`category`、`allergens`（JSON）、`qty`、`expires_at`、`image_id`?、`source_note`、`closed`（下架，預設 false）、`created_at` | `remaining`、`dispatched_qty`、`delivered_qty`、`status`、`unclaimed` 不存，回應時計算（M1、M5） |
| `meal_image` 圖片 | `id` PK（`img`）、`mime`、`data`（bytes）、`size`、`uploaded_by`、`created_at` | 食物圖片、放門口照片、食物點與據點的入口照片、提供者店面照片（M19） |
| `meal_elder` 長者 | `id` PK（`e`）、`alias`、`account_id`?、`station_id`、`lat`、`lng`、`address`（文字，可空，ADR-027）、`allergens`（JSON）、`created_by`（管理員帳號 id）、`created_at`、`last_seen_at`?、`last_meal_at`?、`next_care_at`?、`next_meal_at`?、`primary_volunteer_id`?、`merged_into`? | 全部是模擬資料；不存姓名、身分證、電話。`address` 只能是模擬地址（門牌不存在、標「（模擬）」），只有管理員與被派到這位長者的志工看得到（M13、ADR-027）。`account_id`、`merged_into` 保留不用（ADR-026） |
| `meal_claim` 申請（送餐） | `id` PK（`c`）、`food_id`、`elder_id`、`qty`、`method`、`status`、`requested_by`、`volunteer_id`?、`assignment_id`?、`created_at`、`claimed_at`?、`picked_up_at`?、`done_at`?、`cancel_reason`? | 只由自動派送建立（M17），每筆綁一位長者；`method` 一律 `delivery`、`requested_by` 一律是志工帳號 id（欄位保留，資料表只增不減） |
| `meal_visit` 拜訪 | `id` PK（`vi`）、`elder_id`、`volunteer_id`、`kind`、`claim_id`?、`assignment_id`?、`result`、`photo_image_id`?、`visited_at` | |
| `meal_checkin` 報到 | `id` PK（`ck`）、`volunteer_id`（帳號 id）、`station_id`、`checked_in_at` | |
| `meal_assignment` 派送任務 | `id` PK（`as`）、`checkin_id`、`volunteer_id`、`elder_id`、`station_id`、`needs_meal`、`needs_care`、`claim_id`?、`status`、`assigned_at`、`expires_at`、`done_at`? | 自動派送的結果 |

`volunteer_id` 一律是志工的**帳號 id**（不另建志工表）。

## 4. 列舉值

| 型別 | 值（中文） |
|---|---|
| `Role` | `citizen` 一般市民、`volunteer` 志工、`supplier` 提供者、`station` 據點、`admin` 管理員（`elder` 已取消：長者不是帳號，ADR-026） |
| `Allergen`（衛福部公告 11 類） | `crustacean` 甲殼類、`mango` 芒果、`peanut` 花生、`milk` 牛奶羊奶、`egg` 蛋、`nut` 堅果類、`sesame` 芝麻、`gluten` 含麩質穀物、`soy` 大豆、`fish` 魚類、`sulfite` 亞硫酸鹽 |
| `FoodCategory` | `meal_box` 熟食便當、`bakery` 麵包點心、`produce` 生鮮蔬果、`dry_goods` 乾貨罐頭、`drink` 飲品、`other` 其他 |
| `OrgType` | `person` 個人、`school` 學校、`agency` 機關、`shop` 店家、`other` 其他 |
| `SupplierStatus` | `pending` 審核中、`approved` 已通過、`rejected` 未通過 |
| `PointKind` | `station` 關懷據點、`village_office` 里辦公處、`school` 學校、`custom` 自訂 |
| `FoodStatus`（計算） | `open` 可派送、`claimed` 已全數派出、`expired` 已過期、`closed` 已下架 |
| `ClaimMethod` | `delivery` 送餐（只剩這一種；`pickup` 已取消，ADR-025） |
| `ClaimStatus` | `claimed` 已派送、`delivering` 配送中、`done` 完成、`cancelled` 取消（`requested`、`ready_for_pickup` 已取消，ADR-025） |
| `VisitKind` | `meal` 送餐、`care` 純關懷 |
| `VisitResult` | `seen` 見到本人、`left_at_door` 放門口（附照片）、`returned` 未見到，帶回 |
| `AssignmentStatus` | `assigned` 進行中、`done` 完成、`released` 釋出 |

**v2.5 新增的欄位型別**（都是 `string`，沒填 → `""`，ADR-030）：`Station.address`、`Point.address`、`Supplier.address`、`Food.point_address`（計算欄位，由 `point_id` 查出食物點的地址）。請求 `SupplierApply.address`、`PointCreate.address` 是選填的 `string | null`，最長 120 字，前後空白由後端去掉；`extra="forbid"` 不變。

## 5. 設定值（`MEAL_RELAY_MODE=demo|prod`，預設 `demo`）

| 名稱 | demo | prod | 用途 |
|---|---|---|---|
| `CLAIM_WINDOW_SEC` | 20 | 600 | 上架超過這段時間仍有剩餘 → `unclaimed` 提醒（M5） |
| `CARE_ALERT_DAYS` | 1 | 3 | 沒設下次關懷時間時的關懷警示天數（M10） |
| `MEAL_ALERT_DAYS` | 1 | 3 | 沒設下次送餐時間時的送餐警示天數（M10） |
| `DISPATCH_LIMIT` | 3 | 5 | 一次報到最多派幾位長者（M16） |
| `ASSIGNMENT_TTL_MIN` | 30 | 240 | 派送任務多久沒完成就釋出（M18） |
| `MAX_QTY_PER_CLAIM` | 2 | 2 | 一筆申請最多份數（M3） |
| `QR_ROTATE_SEC` | 30 | 1800 | 據點 QR 多久換一次（M15） |
| `IMAGE_MAX_BYTES` | 200000 | 200000 | 圖片上限，前端先壓到長邊 800px（M19） |

`DUPLICATE_RADIUS_M` 已取消（M12，ADR-026）。QR 簽章用的金鑰讀環境變數 `MEAL_RELAY_QR_SECRET`；沒設定時用固定的 Demo 金鑰，正式版必須在 Render 設定（M15）。

## 6. 業務規則

| 編號 | 規則 |
|---|---|
| M1 | `dispatched_qty = Σ 狀態為 claimed、delivering 的申請 qty`（派出中）；`delivered_qty = Σ 狀態為 done 的申請 qty`（已送達）；`remaining = qty − dispatched_qty − delivered_qty`（即 qty − Σ 未取消申請的 qty，不小於 0）。`remaining = 0` → `status = claimed`；`closed` → `closed`；超過 `expires_at` → `expired`。優先序：`closed` > `expired` > `claimed` > `open`。 |
| M2 | 預扣份數：派送建立申請時就扣（M17），只挑 `status = open` 且 `remaining ≥ qty` 的食物。 |
| M3 | 每筆申請綁一位長者，`qty` 固定為 1（`MAX_QTY_PER_CLAIM` 保留給之後調整）。 |
| M4 | 過敏原：派送挑食物時排除與長者 `allergens` 有交集的食物；後端任何建立申請的地方都要再檢查一次，有衝突就 `ALLERGEN_CONFLICT`。查詢食物時傳 `for_elder` 會篩掉衝突的食物（給管理系統與測試用）。 |
| M5 | `unclaimed = status = open 且 now > created_at + CLAIM_WINDOW_SEC`。只是提醒（這份食物還沒被派出去），仍可被派送。 |
| M6 | 過期：`expires_at` 已過，未完成的申請（`claimed`、`delivering`）一律 `cancelled`（`cancel_reason = expired`）。 |
| M7 | **只有自動派送會建立申請**（M17）：初始狀態 `claimed`、`volunteer_id = 報到的志工`、`assignment_id = 任務`。一般市民、志工、提供者都沒有手動申請的入口，也沒有自取。 |
| M8 | 狀態轉換：`claimed →(志工取餐) delivering →(回報) done`；`claimed`、`delivering` 可由該志工取消 → `cancelled`，份數退回（M1 自然成立），任務仍保留，可以只做關懷。 |
| M9 | 拜訪回報：`seen` → 更新 `last_seen_at`，清空 `next_care_at`；`kind = meal` 的 `seen` 或 `left_at_door` → 申請 `done`、更新 `last_meal_at`、清空 `next_meal_at`；`returned` → 申請 `cancelled`（`cancel_reason = returned`）。`seen`、`left_at_door` 會把 `primary_volunteer_id` 設成這位志工。 |
| M10 | 長者警示：`care_due = next_care_at 有值 ? now ≥ next_care_at : (last_seen_at 為空 或 超過 CARE_ALERT_DAYS)`；`meal_due` 同理用 `next_meal_at`、`last_meal_at`、`MEAL_ALERT_DAYS`。`alert = care_due 或 meal_due`。 |
| M11 | `left_at_door` 必須 `kind = meal`、必須附 `photo_image_id`，生鮮蔬果（`produce`）不能放門口 → `FRESH_CANNOT_LEAVE`。 |
| M12 | ~~新增長者時的附近重複提示~~：**取消**（ADR-026）。長者只由管理員建立，`POST /elders` 直接回傳建立的長者。 |
| M13 | 長者的可見範圍：**志工沒有任何列出長者的端點**，只看得到自己 `assigned` 任務上的長者：`listMyAssignments` 只回傳 `assigned` 的任務，`listMyClaims` 只回傳 `claimed`、`delivering` 的申請；任務 `done` 或 `released` 後就不再回傳，長者位置從志工手機上消失。志工回報拜訪只能針對自己 `assigned` 任務上的長者，否則 `NOT_OWNER`。長者名冊（列出、新增、修改）只有管理員。合併長者已取消；`merged_into` 有值的長者一樣不出現、不派送。 |
| M14 | 提供者只有 `approved` 才能新增食物點、上架、修改、下架；只能改自己的食物。修改可改 `qty`、`expires_at`、`closed`：`qty` 不能小於 `dispatched_qty + delivered_qty` → `QTY_BELOW_USED`；`expires_at` 不能早於現在 → `VALIDATION_ERROR`。 |
| M15 | 據點 QR 定時更新：內容為 `meal-relay:checkin:<checkin_code>:<token>`；`window = floor(Unix 秒數 / QR_ROTATE_SEC)`，`token = HMAC-SHA256(MEAL_RELAY_QR_SECRET, "<checkin_code>:<window>")` 的前 10 個十六進位字元。報到時接受目前與前一個時間窗的 token；更舊或對不上 → `QR_EXPIRED`；格式不對或 `checkin_code` 找不到 → `NOT_FOUND`；是別的據點 → `WRONG_STATION`。`checkin_code` 由種子產生、不等於據點 id，只出現在 QR 裡。`GET /stations/mine` 回傳 `qr_text` 與 `qr_expires_at`（目前時間窗結束的時間），據點頁到期前重新取得。 |
| M16 | 自動派送（志工報到時）：候選 = 該據點 `alert = true`、未合併、且沒有被別的志工以 `assigned` 任務持有的長者。排序：①`primary_volunteer_id` 是自己 ②沒有主要志工 ③主要志工今天沒報到；同組內依 `last_seen_at` 為空 > 逾期天數多 > 離據點近。取前 `DISPATCH_LIMIT` 位。主要志工今天已報到的長者留給他。 |
| M17 | 派送任務內容：`meal_due` → 自動挑食物（`open`、`remaining ≥ 1`、無過敏衝突，依離據點近、到期早排序）建立 `claimed` 的送餐申請；找不到合適食物 → `claim_id` 為空，任務仍保留關懷。自動建立的申請 `requested_by` 是志工帳號 id、`assignment_id` 是任務 id。同一位志工重複報到時回傳既有的進行中任務，不重複派送。 |
| M18 | 任務完成：該長者有一筆拜訪回報就 `done`。任務超過 `expires_at` 未完成 → `released`：還沒取餐（`claimed`）的申請取消、份數退回；已在 `delivering` 的不動。 |
| M19 | 圖片：前端壓縮後以 base64 上傳，後端檢查 mime 為 `image/jpeg`、`image/png`、`image/webp` 且大小 ≤ `IMAGE_MAX_BYTES`。**入口照片**（`meal_point`、`meal_station` 的 `image_id`，v2.3）：只拍入口或建築外觀，不能拍到人臉、車牌、門牌號碼；示範資料只用團隊自己拍的或開放授權的照片，並登記來源（ADR-028）。**店面照片**（`meal_supplier.image_id`，v2.4）：只拍招牌或店門口，不能拍到人臉、車牌，也不能出現個人資料；`org_type = person` 時前端不顯示照片欄位，後端忽略送來的 `image_id`、存 `null`，回應的 `image_url` 一律 `null`（避免拍到自家住址，ADR-029）。回應的 `image_url` 是 `/meal-relay/images/{image_id}`，沒有照片 → `null`，畫面有照片才顯示、不留空框。 |
| M20 | `refresh(now)`：每個請求在業務邏輯前執行，處理 M6、M18（寫回資料庫）；M1、M5、M10 在組裝回應時計算。不用背景排程。 |

## 7. 錯誤格式

```json
{ "detail": { "code": "QTY_EXCEEDED", "message": "申請份數超過剩餘份數" } }
```

| 代碼 | HTTP | 條件 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 沒帶 `X-Demo-User`（未匯入的 id 不算錯，視為一般市民） |
| `FORBIDDEN_ROLE` | 403 | 角色不能呼叫這個端點 |
| `NOT_OWNER` | 403 | 不是自己的資料（提供者的食物、志工的申請、任務或任務上的長者，M13） |
| `WRONG_STATION` | 403 | 掃了其他據點的 QR |
| `SUPPLIER_NOT_APPROVED` | 403 | 未通過的提供者上架或修改 |
| `NOT_FOUND` | 404 | 資源不存在；QR 格式不對或找不到據點（M15） |
| `VALIDATION_ERROR` | 422 | 欄位缺漏、格式錯誤、多送欄位 |
| `QTY_EXCEEDED` | 409 | M2 |
| `QTY_BELOW_USED` | 409 | M14：改的份數小於已派出加已送達的份數 |
| `FOOD_NOT_OPEN` | 409 | 食物不是 `open` |
| `ALLERGEN_CONFLICT` | 409 | M4 |
| `INVALID_STATE` | 409 | 狀態不允許這個操作 |
| `ALREADY_APPLIED` | 409 | 已申請過提供者 |
| `QR_EXPIRED` | 409 | M15：QR 已過期或 token 對不上 |
| `FRESH_CANNOT_LEAVE` | 409 | M11 |
| `PHOTO_REQUIRED` | 422 | M11 |
| `IMAGE_TOO_LARGE` | 413 | M19 |
| `OFFLINE` | 0（只在前端） | 連不上後端；讀取改用裝置上的資料，寫入直接失敗 |

## 8. 端點（前綴 `/meal-relay`，全部要帶 `X-Demo-User`）

| 動作 | 方法與路徑 | 角色 | 後端套件 |
|---|---|---|---|
| `getMe` | `GET /me` | 全部 | `meal_account` |
| `resetDemo` | `POST /demo/reset` | admin | `meal_account` |
| `applySupplier` | `POST /suppliers`（可帶店面照片 `image_id`，先 `uploadImage`，個人提供者忽略；可帶單位地址 `address`，選填，v2.5，個人提供者存空字串） | citizen | `meal_account` |
| `getMySupplier` | `GET /suppliers/mine` | citizen、supplier | `meal_account` |
| `listSuppliers` | `GET /suppliers?status=` | admin | `meal_account` |
| `reviewSupplier` | `POST /suppliers/{id}/approve`、`/reject` | admin | `meal_account` |
| `listPoints` | `GET /points?category=&for_elder=` | supplier、admin | `meal_food` |
| `createPoint` | `POST /points`（可帶入口照片 `image_id`，先 `uploadImage`；可帶食物點地址 `address`，選填，v2.5） | supplier | `meal_food` |
| `listFoods` | `GET /foods?point_id=&category=&for_elder=&mine=1` | supplier（`mine=1` 只看自己的）、admin | `meal_food` |
| `getFood` | `GET /foods/{id}` | supplier、volunteer、admin | `meal_food` |
| `createFood` | `POST /foods` | supplier | `meal_food` |
| `updateFood` | `PATCH /foods/{id}`（`qty`、`expires_at`、`closed`，M14） | supplier（自己的） | `meal_food` |
| `uploadImage` | `POST /images` | citizen（申請提供者的店面照片，v2.4）、supplier、volunteer | `meal_food` |
| `getImage` | `GET /images/{id}`（回傳圖片本身，不需 header） | 全部 | `meal_food` |
| `listMyClaims` | `GET /claims/mine`（只回傳 `claimed`、`delivering`，M13） | volunteer | `meal_claim` |
| `pickupClaim` | `POST /claims/{id}/pickup` | volunteer（自己的） | `meal_claim` |
| `cancelClaim` | `POST /claims/{id}/cancel` | volunteer（自己的） | `meal_claim` |
| `listElders` | `GET /elders` | admin | `meal_elder` |
| `createElder` | `POST /elders`（回傳 `Elder`） | admin | `meal_elder` |
| `updateElder` | `PATCH /elders/{id}` | admin | `meal_elder` |
| `reportVisit` | `POST /visits`（只限自己 `assigned` 任務上的長者，M13） | volunteer | `meal_elder` |
| `listStations` | `GET /stations` | 全部 | `meal_dispatch` |
| `getMyStation` | `GET /stations/mine`（含 `qr_text`、`qr_expires_at`、今天的報到，M15） | station | `meal_dispatch` |
| `checkIn` | `POST /checkins`（`{qr_text}`） | volunteer | `meal_dispatch` |
| `listMyAssignments` | `GET /assignments/mine`（只回傳 `assigned`，M13） | volunteer | `meal_dispatch` |
| `getBoard` | `GET /board` | admin | `meal_board` |

**已取消的端點（ADR-026）：** `getMyElder`（`GET /elders/me`）、`listMyElderVisits`（`GET /elders/me/visits`）、`upsertMyElder`（`PUT /elders/me`）、`findNearbyElders`（`GET /elders/nearby`）、`mergeElder`（`POST /elders/{id}/merge`）。

請求與回應的欄位以 `features/meal_relay/schemas.py` 與前端 `features/meal-relay/data/types.ts` 為準（兩邊型別必須一致）。重點：

- `Me`：`{id, role, name, station_id, supplier: Supplier|null}`（`elder` 已移除，ADR-026）
- `Food`：資料表欄位 ＋ `location`（食物點位置）、`point_name`、`supplier_name`、`remaining`、`dispatched_qty`、`delivered_qty`、`status`、`unclaimed`、`image_url`、`point_image_url`（食物點的入口照片，v2.3；志工任務卡的取餐地點用）
- `Supplier`：資料表欄位（不含 `image_id`）＋ `image_url`（店面照片，沒有或個人提供者 → `null`，v2.4）
- `SupplierApply`：`{name, org_type, location, image_id?}`（`image_id` 選填；`org_type = person` 時後端忽略，v2.4）
- `Station`：`{id, name, location, source, image_url}`（不含 `checkin_code`；`image_url` 是入口照片，沒有 → `null`，v2.3）
- `Point`：`{id, name, kind, location, source, created_by, open_food_count, image_url}`（`image_url` 同上，v2.3）
- `PointCreate`：`{name, kind?, location, image_id?}`（`image_id` 選填，v2.3）
- `Elder`：資料表欄位（含 `address`）＋ `location`、`care_due`、`meal_due`、`alert`、`days_since_seen`、`days_since_meal`（`pending_request` 欄位保留但一律 `false`，ADR-025；`account_id`、`merged_into` 一律 `null`，ADR-026）
- `Claim`：資料表欄位 ＋ `food`（`Food`）、`elder`（`{id, alias, location}`）
- `Assignment`：資料表欄位 ＋ `elder`（`Elder`）、`claim`（`Claim|null`）
- `CheckInResult`：`{checkin, station, assignments: Assignment[]}`
- `MyStation`：`{station, qr_text, qr_expires_at, checkins}`
- `Board`：`{stations, points, foods, elders, claims（不含 cancelled）, stats: {foods_open, delivered_today, seen_today, alerts, checkins_today}}`；「今天」以 `+08:00` 判斷

## 9. 程式位置

### 後端（每個套件一張工單，彼此不改對方的檔案）
| 套件 | 內容 | 誰做 |
|---|---|---|
| `features/meal_relay/` | 資料層（`models.py`、`repo.py`、`schemas.py`）、共用規則（`service.py`：`refresh`、M1、M4、M5、M10 計算、M13 的 `ensure_assigned_elder`、M14 的 `ensure_food_update`、M15 的 `station_qr_text`／`verify_qr_text`／`qr_expires_at`、轉成回應型別、種子匯入與重置）、身分（`deps.py`：`CurrentAccount`、`require_roles`、錯誤）、種子 `seed/*.json`。**沒有路由** | T-107、T-122、T-123 |
| `features/meal_account/` | 帳號、提供者申請與審核、重置 | T-108 |
| `features/meal_food/` | 食物點、食物（含 M14 修改）、圖片 | T-109 |
| `features/meal_claim/` | 志工自己的申請：取餐、取消 | T-110 |
| `features/meal_elder/` | 長者名冊（管理員）、拜訪回報 | T-111 |
| `features/meal_dispatch/` | 據點、QR 驗證、報到、自動派送、任務釋出 | T-112 |
| `features/meal_board/` | 看板 | T-113 |

其他套件只從 `townpass_backend.features.meal_relay`（套件根）使用共用的東西（B5）。各套件的路由一律用 `meal_router("<tag>")` 建立（前綴 `/meal-relay`，錯誤自動轉成 §7 格式，422 也是），身分用 `CurrentAccount`、`require_roles(...)`，業務錯誤丟 `MealError`。不要直接查 `meal_` 表，用 `meal_relay.repo` 與轉換函數 `to_food`、`to_elder`…。

回應的空值約定：`GET /suppliers/mine` 沒有資料時回 `null`；`Station` 不含 `checkin_code`，只有據點自己的 `GET /stations/mine` 給 `qr_text`。

### 前端（`services/web/src/features/meal-relay/`，功能代碼 `MR`）
| 路由 | 頁面 | 檔案 | 誰做 |
|---|---|---|---|
| `/#/f/meal-relay` | MR-P01 首頁：說明（長者不用操作，需要送餐請洽里長或最近的社區關懷據點）、依角色進入、一般市民可「我要提供食物」 | `ui/HomePage.vue`、`logic/home.ts` | T-116 |
| ~~`elder`~~ | ~~MR-P02 長者頁~~：**取消**（ADR-026），路由與檔案由 T-123 移除，編號不再使用 | — | — |
| ~~`food/:id`~~ | ~~MR-P03 食物資訊~~：**取消**（ADR-025），編號不再使用 | — | — |
| `volunteer` | MR-P04 志工頁：掃描報到、今天的狀態（報到的據點、任務數）、前往我的任務。**沒有長者地圖或清單** | `ui/VolunteerPage.vue`、`logic/volunteer.ts` | T-118 |
| `volunteer/tasks` | MR-P05 我的任務與拜訪回報：只有進行中的任務（長者代號、位置、過敏、要送的餐），回報後消失 | `ui/TaskPage.vue`（邏輯在 `logic/volunteer.ts`） | T-118 |
| `supplier` | MR-P06 提供者頁：申請與狀態、食物點地圖、上架、我的庫存（每批的剩餘、派出中、已送達、無人認領提醒）、改份數與最晚食用時間、下架 | `ui/SupplierPage.vue`、`logic/supplier.ts` | T-117 |
| `station` | MR-P07 據點頁：會定時更新的 QR code（顯示倒數）、今天報到 | `ui/StationPage.vue`、`logic/station.ts` | T-119 |
| `admin` | MR-P08 管理系統：登入、審核、看板、長者名冊（新增、修改） | `ui/AdminPage.vue`、`logic/admin.ts` | T-120 |

- `data/*.ts`、`index.ts`（含全部路由與佔位頁面）由 T-107 建立；之後各工單只改自己的 `ui`、`logic` 檔案。邏輯層從 `../data` 取用（`data/index.ts` 統一匯出），圖片網址用 `imageSrc()` 接上後端位址。
- `?as=<id>` 會存在裝置上，之後都用這個帳號；`setAccountId(null)` 清掉後回到台北通帳號。
- 共用的功能元件 `MR-C01`～`MR-C06`（`ui/` 下）與 `logic/shared.ts` 由 T-114 建立；地圖、按鈕、清單與動畫元件 `MR-C07`～`MR-C22` 是 UI kit（`docs/meal-relay/ui-kit.md`）。第 2 波頁面專用元件的編號區間：T-116 `MR-C30`～`C34`、T-117 `C35`～`C39`、T-118 `C40`～`C44`、T-119 `C45`～`C49`、T-120 `C50`～`C54`（平行開發不撞號）。
- 首頁的「進入」依角色導向：volunteer → `volunteer`、supplier → `supplier`、station → `station`；citizen 留在首頁（說明與「我要提供食物」）；admin 只用管理系統網址 `/#/f/meal-relay/admin`，首頁不放連結。首頁沒有「切換為志工」之類選角色的按鈕。
- 掃描：志工頁按「掃描報到」→ bridge `qr_code_scan`（App 已有，可相機或相簿圖片）；瀏覽器沒有 App 時改成貼上 QR 文字。
- 斷網（ADR-024）：讀取成功時把回應存在裝置上，失敗時回傳上次的資料並標 `stale_at`；寫入在斷網時直接失敗，畫面停用送出鍵。志工的任務完成後，裝置上存的任務也要清掉（M13）。

## 10. 種子資料（`features/meal_relay/seed/`）

| 檔案 | 內容 | 最少筆數 |
|---|---|---|
| `accounts.json` | 帳號與角色 | admin 1、volunteer 3（`u-vol-1`、`u-vol-2` 同據點）、supplier 2（已通過）、citizen 2（1 位已申請、審核中的提供者；1 位什麼都還沒做）、station 2 |
| `stations.json` | 據點 | 2，同一行政區；`address` 用 T-115 的開放資料地址（v2.5） |
| `suppliers.json` | 提供者 | 3（2 通過、1 審核中）；`address` 是模擬地址，標「（模擬）」、門牌用不存在的號碼（v2.5） |
| `points.json` | 食物點 | 6，含據點、里辦、學校、自訂；`address` 同樣用 T-115 的地址（v2.5） |
| `foods.json` | 食物 | 6，含便當、生鮮、有過敏原的、快過期的；每筆的 `image_id` 指向 `images/` 裡的示意圖 |
| `images/<image_id>.svg` | 示範食物的照片（`meal_image`，`mime = image/svg+xml`） | 每筆種子食物 1 張；本團隊繪製的示意圖，不含程式碼 |
| `elders.json` | 長者（模擬，`created_by` 是管理員） | 12：從未見到 2、逾期 3、最近才見過 3、有下次時間 2、有過敏 2；`u-vol-1` 是其中 4 位的主要志工 |
| `claims.json` | 申請 | 0（申請只由派送產生；檔案保留為空陣列） |

時間可寫相對值：`"now"`、`"now+90m"`、`"now-2d"`，匯入時換算。種子的食物點、據點、提供者不放照片（`image_id` 一律空）；示範食物有照片，是 `seed/images/` 裡本團隊繪製的 SVG 示意圖，匯入時寫進 `meal_image`（上傳仍只收 JPEG／PNG／WebP，M19）。已部署的資料庫要管理員執行一次「重置示範資料」才會出現食物照片。之後要放示範用的入口照片，只能用團隊自己拍的或開放授權的圖，並登記在 `data/SOURCES.md`（ADR-028）。座標用開放資料的真實位置；長者座標放在路上或公共空間，不對應任何住家。`POST /demo/reset` 清空 `meal_` 開頭的表並重新匯入。已經有資料的資料庫（例如已部署的 Render）啟動時不重新匯入，只把 v2.1 以前的 `elder` 帳號改成 `citizen`（ADR-026）；要換成 v2.2 的種子，請管理員執行一次重置。v2.5 的地址（據點、食物點、提供者的 `address`）也一樣：已部署的資料庫啟動時只補欄位（值是空字串），種子地址要管理員執行「重置示範資料」後才會出現（ADR-030）。

## 11. 驗收清單（各工單挑自己相關的寫成測試）

| 編號 | 情境 | 預期 |
|---|---|---|
| V1 | 不帶 `X-Demo-User` | 401 `UNAUTHENTICATED` |
| V2 | 未匯入的 id 呼叫 `GET /me` | `role = citizen`、`supplier = null`，沒有 `elder` 欄位 |
| V3 | 志工呼叫 `POST /foods` | 403 `FORBIDDEN_ROLE` |
| V4 | 審核中的提供者上架 | 403 `SUPPLIER_NOT_APPROVED` |
| V5 | 只剩 0 份的食物 | 派送不會挑它 |
| V6 | 對花生過敏的長者被派送 | 不會挑含花生的食物；`GET /foods?for_elder=` 不含該食物 |
| V7 | 志工取消申請 | `remaining` 加回，任務仍在 |
| V8 | 上架後超過 `CLAIM_WINDOW_SEC` | `unclaimed = true`，仍可被派送 |
| V9 | 把 `expires_at` 設成過去再呼叫任一 API | 食物 `expired`，未完成申請 `cancelled` |
| V10 | 回報 `seen` | `last_seen_at` 更新、`alert` 依 M10 重算、`primary_volunteer_id` 是該志工 |
| V11 | 生鮮回報 `left_at_door` | 409 `FRESH_CANNOT_LEAVE` |
| V12 | 掃其他據點的 QR | 403 `WRONG_STATION` |
| V13 | `u-vol-1` 報到 | 先拿到自己是主要志工的警示長者，最多 `DISPATCH_LIMIT` 位 |
| V14 | `u-vol-1` 已報到後 `u-vol-2` 報到 | 不會拿到 `u-vol-1` 持有或主要服務的長者 |
| V15 | 同一志工重複報到 | 回傳同一批任務 |
| V16 | 任務過了 `expires_at` | `released`，還沒取餐的申請取消、份數退回 |
| V17 | 重置 Demo | 回到種子狀態 |
| V18 | 用兩個時間窗以前的 QR 報到，或改過 token | 409 `QR_EXPIRED`；前一個時間窗的 QR 仍可報到 |
| V19 | 志工呼叫 `GET /elders` | 403 `FORBIDDEN_ROLE` |
| V20 | 志工回報後再呼叫 `GET /assignments/mine` | 不再回傳那個任務；回報不屬於自己任務的長者 → 403 `NOT_OWNER` |
| V21 | 提供者把份數改成小於已派出加已送達 | 409 `QTY_BELOW_USED`；`Food` 的 `dispatched_qty`、`delivered_qty` 與申請狀態一致 |

## 12. 工單與平行開發波次

同一波的工單擁有不重疊的檔案，可以交給不同的人或 AI 同時做。下一波要等它依賴的工單合併。工單已依本版開立：第 1 波 T-108～T-115 = #44～#51；第 2 波 T-116～T-120 = #57～#61、第 3 波 T-121 = #62（先標 `blocked`，依賴合併後換成 `status:ready`）。v2.1 時開的 #25～#38 已刪除。

| 波次 | 工單 | 開工條件 |
|---|---|---|
| 0 | T-107 合約、資料層與骨架（已合併） | 無 |
| 0.5 | T-122 長者不訂餐、只由派送建立申請（合約 v2.1，已合併） | 無 |
| 0.6 | T-123 長者零操作、志工只看派給自己的長者、QR 定時更新、提供者庫存去向（合約 v2.2） | 無；第 1 波等它合併 |
| 1 | T-108 帳號與審核、T-109 食物與圖片、T-110 申請、T-111 長者名冊與回報、T-112 報到與派送、T-113 看板、T-114 前端共用元件、T-115 開放資料 | T-123 合併 |
| 2 | T-116 首頁、T-117 提供者頁、T-118 志工頁與掃描、T-119 據點頁、T-120 管理系統 | T-114 合併；實機操作要等對應的後端工單合併（各工單的「依賴」） |
| 3 | T-121 整合與 Demo 準備 | 全部合併 |

- 後端第 1 波的 6 張彼此獨立：共用的規則（`refresh`、剩餘與派出份數、過敏衝突、警示計算、QR 驗證、志工可見範圍、轉換函數）都在 `meal_relay`。
- 前端第 2 波的 5 張彼此獨立：每張只改自己的頁面檔與 `logic/<角色>.ts`；`data/`、`index.ts` 與共用元件已在前兩波完成。
- 各工單的文件寫在自己的 `README.md` 或 `docs/meal-relay/T-1xx.md`，不改共用的系統文件，避免合併衝突；T-121 統一整理。
- `components.md` 是自動產生的，合併衝突時 rebase 後重跑 `node tools/check-arch.mjs --catalog`。
