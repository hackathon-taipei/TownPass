"""PRESENTATION (HTTP) - 志工的送餐申請端點（合約 §8：listMyClaims、pickupClaim、cancelClaim）。

只呼叫 service；業務錯誤（MealError）由 meal_router 的 MealRoute 自動轉成 §7 格式。
**沒有建立申請的端點**（M7：申請只由報到派送建立）。
"""

from typing import Annotated

from fastapi import Depends

from townpass_backend.db import SessionDep
from townpass_backend.features.meal_relay import meal_router, models, require_roles, schemas

from . import service

router = meal_router("meal_claim")

Volunteer = Annotated[models.MealAccount, Depends(require_roles("volunteer"))]


@router.get("/claims/mine")
def list_my_claims(account: Volunteer, session: SessionDep) -> list[schemas.Claim]:
    """派給自己的申請，只回傳 claimed、delivering（M13）。"""
    return service.list_my_claims(session, account)


@router.post("/claims/{claim_id}/pickup")
def pickup_claim(claim_id: str, account: Volunteer, session: SessionDep) -> schemas.Claim:
    """已取餐：claimed → delivering（M8）。別人的 → NOT_OWNER；狀態不對 → INVALID_STATE。"""
    return service.pickup_claim(session, account, claim_id)


@router.post("/claims/{claim_id}/cancel")
def cancel_claim(
    claim_id: str, account: Volunteer, session: SessionDep, body: schemas.ClaimCancel | None = None
) -> schemas.Claim:
    """取消：claimed、delivering → cancelled，份數退回（M1），任務保留（M8）。body 可省略。"""
    return service.cancel_claim(session, account, claim_id, body)
