# 資料來源 Data sources

競賽規則：核心資料必須使用公開且合法的開放資料，並註明來源；非必要資料可用模擬資料。
**每用到一個資料集就在下面加一列**，demo 時評審可能會問。App 內也要有頁面顯示這些來源。

| 資料集 | 提供機關 | 網址 | 授權 | 用途 | 真實/模擬 |
|---|---|---|---|---|---|
| （範例）YouBike 2.0 即時資訊 | 臺北市交通局 | https://data.taipei/ | 政府資料開放授權條款 1.0 | 地圖顯示站點 | 真實 |
| 臺北市銀髮族服務_社區照顧關懷據點（resource `11930dc6-4092-4bde-a42c-7722e0416462`） | 臺北市政府社會局 | https://data.gov.tw/dataset/121285 | 政府資料開放授權條款 1.0 | 鄰食轉運站的據點 `st-1`、`st-2` 與食物點 `p-1`～`p-3`（名稱、地址）；2026-11-07 下載，見 [T-115](../docs/meal-relay/T-115.md) | 真實 |
| 臺北市各級學校分布圖(含國小.國中.高中職.特教學校.市立大專院校)（resource `28c5792b-3af6-4bff-8ad8-f5b5e53d4062`） | 臺北市政府教育局 | https://data.gov.tw/dataset/121225 | 政府資料開放授權條款 1.0 | 鄰食轉運站的學校食物點 `p-4`（名稱、地址）；2026-11-07 下載 | 真實 |
| 臺北市固定里民活動場所資料（resource `bf098ea3-c42e-4a41-b058-bc17b3d3ed46`） | 臺北市政府民政局 | https://data.gov.tw/dataset/121174 | 政府資料開放授權條款 1.0 | 鄰食轉運站的自訂食物點 `p-5`、`p-6`（地址、座標）；2026-11-07 下載 | 真實 |
| 臺北市門牌位置數值資料（resource `ce76ca0c-7f94-4935-ab47-1d2a41ca2abb`） | 臺北市政府民政局 | https://data.gov.tw/dataset/155472 | 政府資料開放授權條款 1.0 | 把上面資料集的地址換成座標（TWD97 轉 WGS84），用於 `st-1`、`st-2`、`p-1`～`p-4`；2026-11-07 下載 | 真實 |
| 鄰食轉運站的長者、食物、申請 | 本團隊產生 | — | — | Demo 用，畫面標示模擬 | 模擬 |
| 鄰食轉運站示範食物的照片（`services/backend/src/townpass_backend/features/meal_relay/seed/images/img-seed-f-1.svg`～`f-6.svg`） | 本團隊繪製 | — | AGPL-3.0（同本倉庫） | 種子食物 `f-1`～`f-6` 的縮圖示意圖，不是實拍 | 模擬 |
| 鄰食轉運站的入口照片（食物點、據點，ADR-028）與提供者店面照片（ADR-029） | 使用者上傳（提供者新增食物點、一般市民申請提供者時拍攝；個人提供者不收） | — | — | 存在後端資料庫 `meal_image`，倉庫不提交圖片檔、種子沒有照片。只拍入口或建築外觀，不能有人臉、車牌、門牌號碼。之後若放示範照片，只能用團隊自己拍的或開放授權的圖，並在這裡逐張登記來源與授權 | 使用者內容 |
| OpenStreetMap 地圖（線上圖磚、隨附的大臺北底圖 `maps/taipei.pmtiles`，由 Protomaps 建置） | OpenStreetMap contributors | https://www.openstreetmap.org/copyright | ODbL 1.0 | 地圖底圖 | 真實 |

可用平台：
- 臺北資料大平台 https://data.taipei/ — API：`https://data.taipei/api/v1/dataset/<resource_id>?scope=resourceAquire`
- 政府資料開放平臺 https://data.gov.tw/
- 城市通 https://townpass.taipei/
- 臺北市資訊局 GitHub https://github.com/taipei-doit

## 裝置端模型

完整清單與授權見 [10-architecture.md](../docs/system/10-architecture.md) §2。Gemma is provided under and subject to the Gemma Terms of Use found at https://ai.google.dev/gemma/terms

`services/web/eval/` 的測試文件全部是虛構資料，只用於評測，不會隨網站提供給使用者。
