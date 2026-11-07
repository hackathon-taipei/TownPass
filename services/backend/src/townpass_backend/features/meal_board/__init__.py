"""meal_board - 鄰食轉運站的管理員看板（合約 docs/system/11-meal-relay.md v2.2 §8 `getBoard`，T-113）。

`GET /meal-relay/board`（admin）→ `Board{stations, points, foods, elders, claims, stats}`。
共用的資料與規則都從 `townpass_backend.features.meal_relay`（套件根）取用，這裡不建資料表。
"""

from .api import router
from .service import get_board

__all__ = ["get_board", "router"]
