"""LOGIC LAYER - 帳號、提供者申請與審核、重置 Demo（合約 §2、§3、§8）。

資料與共用規則都用 `meal_relay` 套件根（B5）：`repo` 讀寫、`to_me()`／`to_supplier()` 轉回應、
`reset_demo()` 重置。不直接查 `meal_` 表，也不 import FastAPI 的 HTTP 類別；錯誤一律丟 `MealError`。
"""

from sqlmodel import Session

from townpass_backend.features.meal_relay import (
    MealError,
    models,
    new_id,
    now,
    repo,
    reset_demo,
    schemas,
    supplier_image_id,
    to_me,
    to_supplier,
)

MealAccount = models.MealAccount
MealSupplier = models.MealSupplier
DemoResetResult = schemas.DemoResetResult
Me = schemas.Me
Supplier = schemas.Supplier
SupplierApply = schemas.SupplierApply
SupplierStatus = schemas.SupplierStatus

# ---------------------------------------------------------------- 帳號


def get_me(session: Session, account: MealAccount) -> Me:
    """GET /me。沒匯入的 id 由 `CurrentAccount` 給一般市民 citizen（V2）；沒有 elder 欄位（ADR-026）。"""
    return to_me(session, account)


def reset(session: Session) -> DemoResetResult:
    """POST /demo/reset：清空 meal_ 表並重新匯入種子（V17）。"""
    return DemoResetResult(imported=reset_demo(session, now()))


# ---------------------------------------------------------------- 提供者申請


def get_my_supplier(session: Session, account: MealAccount) -> Supplier | None:
    """GET /suppliers/mine：自己的提供者申請（任何狀態），沒有 → None（回應 null）。"""
    return to_me(session, account).supplier


def apply_supplier(session: Session, account: MealAccount, body: SupplierApply) -> Supplier:
    """POST /suppliers：一般市民申請成為提供者，建立 pending 的申請。

    已有申請（任何狀態，含 rejected）→ ALREADY_APPLIED。帳號會記下 `supplier_id`（同種子的 u-sup-3）；
    沒匯入的一般市民在這時寫進 meal_account（role 仍是 citizen），審核通過時才有帳號可改。
    店面照片 `image_id` 選填；個人提供者（`person`）忽略、存 null（ADR-029）。
    """
    if get_my_supplier(session, account) is not None:
        raise MealError("ALREADY_APPLIED", "這個帳號已經申請過提供者")
    supplier = MealSupplier(
        id=new_id("s"),
        account_id=account.id,
        name=body.name.strip(),
        org_type=body.org_type,
        lat=body.location.lat,
        lng=body.location.lng,
        status="pending",
        created_at=now(),
        image_id=supplier_image_id(body.org_type, body.image_id),
    )
    repo.create_supplier(session, supplier, commit=False)
    __save_account(session, account.id, commit=False, supplier_id=supplier.id)
    repo.commit(session)
    return to_supplier(supplier)


# ---------------------------------------------------------------- 審核（管理員）


def list_suppliers(session: Session, status: SupplierStatus | None = None) -> list[Supplier]:
    """GET /suppliers?status=：全部申請，依申請時間排序；`status` 有值時只列該狀態。"""
    return [to_supplier(s) for s in repo.list_suppliers(session, status)]


def approve_supplier(session: Session, supplier_id: str) -> Supplier:
    """通過：申請 → approved、寫 reviewed_at；申請人帳號 role → supplier、寫 supplier_id。"""
    supplier = __pending_supplier(session, supplier_id)
    repo.update_supplier(session, supplier, commit=False, status="approved", reviewed_at=now())
    __save_account(session, supplier.account_id, commit=False, role="supplier", supplier_id=supplier.id)
    repo.commit(session)
    return to_supplier(supplier)


def reject_supplier(session: Session, supplier_id: str) -> Supplier:
    """不通過：申請 → rejected、寫 reviewed_at；申請人帳號維持 citizen。"""
    supplier = __pending_supplier(session, supplier_id)
    repo.update_supplier(session, supplier, status="rejected", reviewed_at=now())
    return to_supplier(supplier)


# ---------------------------------------------------------------- 私有


def __pending_supplier(session: Session, supplier_id: str) -> MealSupplier:
    """找不到 → NOT_FOUND；不是 pending → INVALID_STATE（只能審核一次）。"""
    supplier = repo.get_supplier(session, supplier_id)
    if supplier is None:
        raise MealError("NOT_FOUND", "找不到這筆提供者申請")
    if supplier.status != "pending":
        raise MealError("INVALID_STATE", "這筆申請已經審核過")
    return supplier


def __save_account(session: Session, account_id: str, *, commit: bool, **changes: str) -> MealAccount:
    """更新帳號欄位；帳號沒匯入過（預設的一般市民）就先建立 role = citizen 的帳號再更新。"""
    account = repo.get_account(session, account_id)
    if account is None:
        account = repo.create_account(
            session, MealAccount(id=account_id, role="citizen", name="", created_at=now()), commit=False
        )
    return repo.update_account(session, account, commit=commit, **changes)
