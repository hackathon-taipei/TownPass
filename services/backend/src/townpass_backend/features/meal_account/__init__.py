"""meal_account - 鄰食轉運站的帳號、提供者申請與審核、重置 Demo（T-108，合約 docs/system/11-meal-relay.md v2.2 §8）。

端點（前綴 `/meal-relay`，全部要帶 `X-Demo-User`）：

| 方法與路徑 | 角色 |
|---|---|
| `GET /me` | 全部（沒匯入的 id 是一般市民 citizen，V2） |
| `POST /demo/reset` | admin（V17） |
| `POST /suppliers` | citizen |
| `GET /suppliers/mine` | citizen、supplier（沒有申請回傳 null） |
| `GET /suppliers?status=` | admin |
| `POST /suppliers/{id}/approve`、`/reject` | admin（只能審 pending） |
| `GET /volunteers?station_id=` | admin（v2.7：選長者的指定志工，ADR-032） |

資料與共用規則都在 `meal_relay`（只從它的套件根 import，B5）。這個套件沒有自己的資料表與種子。
"""

from .api import router

__all__ = ["router"]
