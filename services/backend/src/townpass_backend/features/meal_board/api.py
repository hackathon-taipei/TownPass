"""PRESENTATION (HTTP) - 管理員看板 `GET /meal-relay/board`（合約 v2.2 §8 `getBoard`，T-113）。

只呼叫 service；身分與錯誤格式（§7）用 meal_relay 的 `require_roles`、`meal_router`。
"""

from typing import Annotated

from fastapi import Depends

from townpass_backend.db import SessionDep
from townpass_backend.features.meal_relay import meal_router, models, require_roles, schemas

from . import service

router = meal_router("meal_board")

AdminAccount = Annotated[models.MealAccount, Depends(require_roles("admin"))]


@router.get("/board")
def get_board(account: AdminAccount, session: SessionDep) -> schemas.Board:
    """據點、食物點、食物、長者、申請（不含 cancelled）與今天的統計。非 admin → 403 FORBIDDEN_ROLE。"""
    return service.get_board(session)
