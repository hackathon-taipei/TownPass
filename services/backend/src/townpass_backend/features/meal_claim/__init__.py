"""meal_claim - 志工自己的送餐申請：列出、取餐、取消（合約 docs/system/11-meal-relay.md v2.2 §8，T-110）。

端點（前綴 /meal-relay，只有 volunteer）：
- `GET /claims/mine`：派給自己、狀態 claimed／delivering 的申請（M13）
- `POST /claims/{id}/pickup`：claimed → delivering，寫 picked_up_at（M8）
- `POST /claims/{id}/cancel`：claimed／delivering → cancelled，份數退回（M1）、任務保留（M8）

**沒有建立申請的端點**：申請只由報到派送建立（M7、M17，meal_dispatch）。
共用的資料層與規則只從 `townpass_backend.features.meal_relay`（套件根）使用（B5）。
"""

from .api import router
from .service import cancel_claim, list_my_claims, pickup_claim

__all__ = ["cancel_claim", "list_my_claims", "pickup_claim", "router"]
