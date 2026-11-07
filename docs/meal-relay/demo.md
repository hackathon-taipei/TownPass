# 鄰食轉運站 Demo 劇本與整合驗證（T-121）

> 2026-11-07 22:30～22:50 在已部署的版本（GitHub Pages＋Render）實際操作驗證。合約：[11-meal-relay.md](../system/11-meal-relay.md) v2.2。

## 1. 網址與帳號

| 角色 | 網址（`?as=` 會存在裝置上） |
|---|---|
| 一般市民 | https://hackathon-taipei.github.io/TownPass/#/f/meal-relay?as=u-cit-1 |
| 志工（`st-1`） | https://hackathon-taipei.github.io/TownPass/#/f/meal-relay/volunteer?as=u-vol-1 |
| 志工（`st-1`，第二位） | `?as=u-vol-2` |
| 提供者 | https://hackathon-taipei.github.io/TownPass/#/f/meal-relay/supplier?as=u-sup-1 |
| 據點（`st-1`） | https://hackathon-taipei.github.io/TownPass/#/f/meal-relay/station?as=u-st-1 |
| 管理員 | https://hackathon-taipei.github.io/TownPass/#/f/meal-relay/admin?as=u-admin-1 |
| 後端 API 文件 | https://townpass-backend-dmk2.onrender.com/docs |

## 2. 錄影前準備（每次都要做）

1. **暖機**：Render 免費方案閒置 15 分鐘會休眠，先開一次 `/health` 或任一頁面，等到有回應再錄。
2. **重置**：管理系統按「重置示範資料」，回到種子狀態（食物到期時間以重置當下換算）。
3. **清瀏覽器快取**：之前開過網站的裝置可能還顯示舊版頁面，重新整理或清除網站資料後再錄（見 §6 問題 3）。

## 3. 劇本（建議影片 3 分鐘內，左右分割畫面）

| 步驟 | 畫面 | 要讓評審看到的 |
|---|---|---|
| 1 | 一般市民首頁 | 長者不用操作 App；需要服務請洽里長或社區關懷據點（實體管道）；據點是開放資料的真實名稱 |
| 2 | 提供者頁「我的庫存」 | 每批食物的剩餘、派出中、已送達 |
| 3 | 據點頁 | QR 每 30 秒自動更新、倒數（拍照帶走也不能遠端報到） |
| 4 | 志工頁掃 QR 報到（App 內直接掃；瀏覽器貼上 QR 文字） | 「派給你 3 件任務」，熟面孔（主要志工）優先 |
| 5 | 我的任務 → 取餐 → 回報「見到本人」 | 回報後任務從手機上消失（志工看不到長者名冊） |
| 6 | 切到提供者頁 | 同一批食物變成「派出中 2、已送達 1」 |
| 7 | 管理系統看板 | 今天報到 1、今天送達 1、今天見到 1 即時更新 |
| 8 | （防呆）用 1 分鐘前的 QR 報到 | 「QR code 已過期，請掃據點畫面上最新的 QR code」 |
| 9 | （過敏）管理系統長者名冊把王阿嬤（對花生過敏）的「下次送餐」設成過去 → 志工報到 | 王阿嬤不會被派到花生奶油麵包 |
| 10 | （斷網）App 開飛航模式 | 畫面顯示上次的資料與更新時間，送出鍵停用 |

## 4. 實際操作結果（2026-11-07，已部署版本）

| 步驟 | 結果 |
|---|---|
| 後端版本 | ✅ `GET /me`（`u-cit-1`）回 `role: citizen`；QR 為 `meal-relay:checkin:<code>:<token>`；志工 `GET /elders` → 403 `FORBIDDEN_ROLE`（V19） |
| 重置後的資料 | ✅ 據點換成開放資料（社團法人台北市艾馨公益慈善會、主愛社會關懷協會）；舊的 `u-eld-1` 不再是匯入帳號，視為一般市民（V2） |
| 首頁 | ✅ 一般市民顯示「我要提供食物」；志工顯示「進入志工頁」；有據點清單、志工來源說明與連結；沒有選角色按鈕、沒有管理系統連結 |
| 提供者頁 | ✅ 剩餘／派出中／已送達、修改、下架、無人認領提醒、資料來源 |
| 據點頁 | ✅ QR 與 30 秒倒數、今天報到 |
| 志工報到（u-vol-1 貼上據點 QR） | ✅ 派到陳阿公、黃阿嬤、許阿公（都是 u-vol-1 為主要志工的警示長者，V13） |
| 取餐 → 回報「見到本人」 | ✅ 陳阿公的任務消失（V20）；第 1／3 步 → 第 2／3 步 → 完成 |
| 提供者看到去向 | ✅ 素食便當：剩 0、派出中 2、已送達 1、狀態 `claimed`（V21 的數字一致） |
| 看板 | ✅ 今天報到 1、今天送達 1、今天見到 1、警示長者 6 |
| 過期 QR | ✅ 409 `QR_EXPIRED`（V18） |
| 別的據點的 QR | ✅ 403 `WRONG_STATION`（V12） |
| 第二位志工 u-vol-2 報到 | ✅ 派到吳阿公、李阿公、張阿嬤，沒有 u-vol-1 的長者（V14）；重複報到回傳同一批任務（V15） |
| 斷網 | ⏳ 瀏覽器無法模擬，需在模擬器或手機開飛航模式確認（邏輯已有 Vitest） |
| App 內掃描 | ⏳ 需在模擬器用台北通 App 掃（`qr_code_scan`，可選相簿圖片） |

## 5. 驗收清單 V1～V21 對照（CI 測試）

| 編號 | 測試 |
|---|---|
| V1 | `test_meal_account.py`、`test_meal_relay_data.py` 等 |
| V2 | `test_meal_relay_data.py::test_v2_unknown_account_is_citizen`、`test_meal_account.py`、`meal-relay-home.test.ts` |
| V3、V4 | `test_meal_food.py`、`meal-relay-supplier.test.ts` |
| V5、V6 | `test_meal_dispatch.py::test_v5_*`、`test_v6_*`；V6 的 `for_elder` 在 `test_meal_food.py` |
| V7 | `test_meal_claim.py`、`meal-relay-volunteer.test.ts` |
| V8、V9 | `test_meal_food.py`、`test_meal_relay_data.py` |
| V10、V11 | `test_meal_elder.py::test_v10_*`、`test_v11_*`、`meal-relay-volunteer.test.ts` |
| V12～V16 | `test_meal_dispatch.py::test_v12_*`～`test_v16_*` |
| V17 | `test_meal_account.py` |
| V18 | `test_meal_dispatch.py::test_v18_*`、`test_meal_relay_data.py::test_m15_*` |
| V19、V20 | `test_meal_elder.py::test_v19_*`、`test_v20_*`、`test_meal_relay_data.py::test_m13_*` |
| V21 | `test_meal_food.py`、`test_meal_relay_data.py::test_v21_*`、`meal-relay-supplier.test.ts` |

main 的 CI（ruff、pytest：SQLite 與 Postgres、vue-tsc、Vitest、架構與文件檢查）全部通過。

## 6. 發現的問題

| # | 問題 | 狀態 |
|---|---|---|
| 1 | 部署後線上資料庫還是舊種子，看板 `GET /board` 出錯 | ✅ 管理員重置後正常 |
| 2 | Render 沒設 `MEAL_RELAY_QR_SECRET`：線上 QR 用 repo 內公開的 Demo 金鑰簽，看得到 repo 的人能算出有效 QR | ❌ 需有 Render 權限的人設定（隨機字串），設定後重新部署 |
| 3 | 之前開過網站的瀏覽器顯示舊版頁面（service worker 快取 `townpass-app-v1`），清除後正常 | ⚠️ 錄影與評審前先重新整理；原因待查 |
| 4 | T-109 的修改食物用自己的 `MealFoodUpdate`、`_calc_used_qty`，沒用共用的 `ensure_food_update()` | ⚠️ 功能正確，Demo 後整理 |

## 7. 比賽規則檢查

| 規則 | 狀態 |
|---|---|
| 執行時沒有雲端 LLM | ✅ 鄰食轉運站不呼叫任何模型；企鵝圖只在設計階段用 Gemini 生成（`ui-kit.md`） |
| 只用開源軟體、沒有商用 SDK（沒有 Google Maps） | ✅ 地圖用 Leaflet＋OpenStreetMap／Protomaps；QR 用 `qrcode`（MIT） |
| 核心資料是開放資料並註明來源 | ✅ 3 個資料集登記在 `data/SOURCES.md`、`index.ts` 的 `sources`，頁面有資料來源說明 |
| 沒有真實個資 | ✅ 長者、食物、帳號都是模擬資料；長者只有代號、座標、過敏原（ADR-024） |
| 程式 AGPL-3.0 | ✅ |
| 評審可能斷網測試 | ⏳ 見 §4 斷網 |
