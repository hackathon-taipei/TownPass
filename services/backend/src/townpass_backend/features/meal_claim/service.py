"""LOGIC LAYER - 志工自己的送餐申請（M1、M7、M8、M13）。

只透過 `townpass_backend.features.meal_relay`（套件根）的 repo、規則與轉換函數（B5），
不直接查 meal_ 表、不重寫共用規則。這裡沒有建立申請的函數：申請只由報到派送建立（M7）。
"""

from datetime import datetime

from sqlmodel import Session

from townpass_backend.features.meal_relay import MealError, models, now, repo, schemas, to_claim

MealAccount = models.MealAccount
MealClaim = models.MealClaim

# M13：志工看得到的申請狀態（done、cancelled 不回傳）
VISIBLE_STATUSES = repo.ACTIVE_CLAIM_STATUSES  # ("claimed", "delivering")


def list_my_claims(session: Session, account: MealAccount, at: datetime | None = None) -> list[schemas.Claim]:
    """GET /claims/mine：派給自己（volunteer_id = 帳號 id）且狀態 claimed、delivering 的申請（M13）。"""
    rows = repo.list_claims(session, volunteer_id=account.id, statuses=VISIBLE_STATUSES)
    # repo 遇到空字串會略過 volunteer_id 條件，這裡再比一次，避免變成「列出全部」
    return [to_claim(session, c, at) for c in rows if account.id and c.volunteer_id == account.id]


def __own_claim(session: Session, account: MealAccount, claim_id: str) -> MealClaim:
    """找不到 → NOT_FOUND；不是派給自己的 → NOT_OWNER（先查擁有者，不透露別人申請的狀態）。"""
    claim = repo.get_claim(session, claim_id)
    if claim is None:
        raise MealError("NOT_FOUND", "找不到這筆申請")
    if not account.id or claim.volunteer_id != account.id:
        raise MealError("NOT_OWNER", "這筆申請不是派給你的")
    return claim


def pickup_claim(
    session: Session, account: MealAccount, claim_id: str, at: datetime | None = None
) -> schemas.Claim:
    """POST /claims/{id}/pickup：M8 claimed →(志工取餐) delivering，寫 picked_up_at。"""
    t = at or now()
    claim = __own_claim(session, account, claim_id)
    if claim.status != "claimed":  # M8：只有還沒取餐的可以取餐
        raise MealError("INVALID_STATE", "這筆申請不是待取餐的狀態")
    repo.update_claim(session, claim, status="delivering", picked_up_at=t)
    return to_claim(session, claim, t)


def cancel_claim(
    session: Session,
    account: MealAccount,
    claim_id: str,
    body: schemas.ClaimCancel | None = None,
    at: datetime | None = None,
) -> schemas.Claim:
    """POST /claims/{id}/cancel：M8 claimed、delivering → cancelled。

    份數退回由 M1 自然成立（取消的申請不算進派出中）；任務（meal_assignment）不動，仍可只做關懷。
    `reason` 選填，存進 cancel_reason；沒填就是 null（系統取消的 expired／returned／released 一定有值）。
    """
    t = at or now()
    claim = __own_claim(session, account, claim_id)
    if claim.status not in repo.ACTIVE_CLAIM_STATUSES:  # done、cancelled 不能再取消
        raise MealError("INVALID_STATE", "這筆申請已完成或已取消")
    reason = ((body.reason if body else None) or "").strip() or None
    repo.update_claim(session, claim, status="cancelled", cancel_reason=reason)
    return to_claim(session, claim, t)
