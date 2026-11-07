"""T-110 志工的送餐申請（meal_claim）：GET /claims/mine、POST /claims/{id}/pickup、/cancel。

合約 docs/system/11-meal-relay.md v2.2：M1、M6、M7、M8、M13、§7、§8，驗收 V7、V20（申請的部分）。
申請只由報到派送建立（M7），所以測試直接用 meal_relay.repo 建立「派送的結果」（任務＋claimed 申請）。
"""

from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import models as m
from townpass_backend.features.meal_relay import repo

VOL1 = {"X-Demo-User": "u-vol-1"}
VOL2 = {"X-Demo-User": "u-vol-2"}


@pytest.fixture
def session(client: TestClient) -> Iterator[Session]:  # client → 已跑過 sync_schema 與 seed
    with Session(engine) as s:
        mr.reset_demo(s, mr.now())
        yield s


def __dispatch(
    session: Session,
    elder_id: str,
    food_id: str = "f-6",
    *,
    volunteer_id: str = "u-vol-1",
    status: str = "claimed",
) -> tuple[m.MealAssignment, m.MealClaim]:
    """模擬 M17 自動派送的結果：一個 assigned 任務＋一筆 claimed 的送餐申請。"""
    t = mr.now()
    a = repo.create_assignment(session, m.MealAssignment(
        id=mr.new_id("as"), checkin_id="ck-t", volunteer_id=volunteer_id, elder_id=elder_id, station_id="st-1",
        needs_meal=True, needs_care=True, assigned_at=t, expires_at=t + timedelta(minutes=30),
    ))  # fmt: skip
    c = repo.create_claim(session, m.MealClaim(
        id=mr.new_id("c"), food_id=food_id, elder_id=elder_id, qty=1, method="delivery", status=status,
        requested_by=volunteer_id, volunteer_id=volunteer_id, assignment_id=a.id, created_at=t, claimed_at=t,
    ))  # fmt: skip
    repo.update_assignment(session, a, claim_id=c.id)
    return a, c


def __remaining(session: Session, food_id: str) -> int:
    session.expire_all()
    food = repo.get_food(session, food_id)
    assert food
    return mr.food_remaining(session, food)


def __code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["detail"]["code"]


# ---------------------------------------------------------------- M7：沒有建立申請的端點


def test_m7_no_endpoint_creates_claims(client: TestClient, session: Session) -> None:
    # 從 OpenAPI 看全部已掛上的端點（FastAPI 新版的 include_router 不會把路由攤平到 app.routes）
    paths = client.get("/openapi.json").json()["paths"]
    claim_ops = {(p, method.upper()) for p, ops in paths.items() if "/claims" in p for method in ops}
    assert claim_ops == {
        ("/meal-relay/claims/mine", "GET"),
        ("/meal-relay/claims/{claim_id}/pickup", "POST"),
        ("/meal-relay/claims/{claim_id}/cancel", "POST"),
    }
    r = client.post("/meal-relay/claims", headers=VOL1, json={"food_id": "f-6", "elder_id": "e-2"})
    assert r.status_code in (404, 405)
    assert repo.list_claims(session) == []


# ---------------------------------------------------------------- 身分與角色（§7）


def test_requires_header_and_volunteer_role(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2")
    r = client.get("/meal-relay/claims/mine")  # V1
    assert r.status_code == 401 and __code(r) == "UNAUTHENTICATED"
    for who in ("u-sup-1", "u-admin-1", "u-cit-1", "u-st-1", "tp-unknown"):
        h = {"X-Demo-User": who}
        for r in (
            client.get("/meal-relay/claims/mine", headers=h),
            client.post(f"/meal-relay/claims/{c.id}/pickup", headers=h),
            client.post(f"/meal-relay/claims/{c.id}/cancel", headers=h),
        ):
            assert r.status_code == 403 and __code(r) == "FORBIDDEN_ROLE", who
    session.expire_all()
    c2 = repo.get_claim(session, c.id)
    assert c2 and c2.status == "claimed"  # 都被擋下，沒有改到


def test_unknown_claim_is_not_found(client: TestClient, session: Session) -> None:
    for action in ("pickup", "cancel"):
        r = client.post(f"/meal-relay/claims/c-nope/{action}", headers=VOL1)
        assert r.status_code == 404 and __code(r) == "NOT_FOUND"


# ---------------------------------------------------------------- M13：GET /claims/mine 的可見範圍


def test_m13_mine_lists_only_own_claimed_and_delivering(client: TestClient, session: Session) -> None:
    _, claimed = __dispatch(session, "e-2")
    _, delivering = __dispatch(session, "e-4", status="delivering")
    _, done = __dispatch(session, "e-5", status="done")
    _, cancelled = __dispatch(session, "e-6", status="cancelled")
    _, others = __dispatch(session, "e-7", volunteer_id="u-vol-2")

    r = client.get("/meal-relay/claims/mine", headers=VOL1)
    assert r.status_code == 200
    body = r.json()
    assert [x["id"] for x in body] == [claimed.id, delivering.id]  # done、cancelled、別人的都不回傳
    assert not {done.id, cancelled.id, others.id} & {x["id"] for x in body}
    assert {x["status"] for x in body} == {"claimed", "delivering"}
    first = body[0]
    assert first["volunteer_id"] == "u-vol-1" and first["method"] == "delivery"
    assert first["food"]["id"] == "f-6" and first["elder"] == {
        "id": "e-2", "alias": "李阿公", "location": {"lat": 25.0355, "lng": 121.5021},
    }  # fmt: skip
    assert first["created_at"].endswith("+08:00")

    r = client.get("/meal-relay/claims/mine", headers=VOL2)
    assert [x["id"] for x in r.json()] == [others.id]
    assert client.get("/meal-relay/claims/mine", headers={"X-Demo-User": "u-vol-3"}).json() == []


def test_m13_done_claim_disappears_from_mine(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2", status="delivering")
    assert [x["id"] for x in client.get("/meal-relay/claims/mine", headers=VOL1).json()] == [c.id]
    repo.update_claim(session, c, status="done", done_at=mr.now())  # M9 回報後（T-111）
    assert client.get("/meal-relay/claims/mine", headers=VOL1).json() == []


# ---------------------------------------------------------------- M8：取餐


def test_m8_pickup_moves_claimed_to_delivering(client: TestClient, session: Session) -> None:
    a, c = __dispatch(session, "e-2")
    before = __remaining(session, "f-6")
    r = client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == c.id and body["status"] == "delivering"
    assert body["picked_up_at"] and body["picked_up_at"].endswith("+08:00")
    assert body["food"]["dispatched_qty"] >= 1
    session.expire_all()
    c2, a2 = repo.get_claim(session, c.id), repo.get_assignment(session, a.id)
    assert c2 and c2.status == "delivering" and c2.picked_up_at is not None
    assert a2 and a2.status == "assigned"
    assert __remaining(session, "f-6") == before  # 取餐不改份數（仍算派出中，M1）
    assert [x["status"] for x in client.get("/meal-relay/claims/mine", headers=VOL1).json()] == ["delivering"]

    r = client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1)  # 已取餐再取一次
    assert r.status_code == 409 and __code(r) == "INVALID_STATE"


def test_pickup_others_claim_is_not_owner(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2", volunteer_id="u-vol-2")
    for action in ("pickup", "cancel"):
        r = client.post(f"/meal-relay/claims/{c.id}/{action}", headers=VOL1)
        assert r.status_code == 403 and __code(r) == "NOT_OWNER"
    session.expire_all()
    c2 = repo.get_claim(session, c.id)
    assert c2 and c2.status == "claimed" and c2.picked_up_at is None


def test_not_owner_is_checked_before_state(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2", volunteer_id="u-vol-2", status="done")
    r = client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1)
    assert r.status_code == 403 and __code(r) == "NOT_OWNER"  # 不透露別人申請的狀態


@pytest.mark.parametrize("status", ["delivering", "done", "cancelled"])
def test_pickup_wrong_state_is_invalid_state(client: TestClient, session: Session, status: str) -> None:
    _, c = __dispatch(session, "e-2", status=status)
    r = client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1)
    assert r.status_code == 409 and __code(r) == "INVALID_STATE"


def test_cancelled_then_pickup_is_invalid_state(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2")
    assert client.post(f"/meal-relay/claims/{c.id}/cancel", headers=VOL1).status_code == 200
    r = client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1)
    assert r.status_code == 409 and __code(r) == "INVALID_STATE"
    r = client.post(f"/meal-relay/claims/{c.id}/cancel", headers=VOL1)  # 已取消再取消
    assert r.status_code == 409 and __code(r) == "INVALID_STATE"


def test_m6_expired_food_claim_cannot_be_picked_up(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2", food_id="f-1")
    f1 = repo.get_food(session, "f-1")
    assert f1
    repo.update_food(session, f1, expires_at=mr.now() - timedelta(minutes=1))
    r = client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1)  # refresh 先取消（M6、M20）
    assert r.status_code == 409 and __code(r) == "INVALID_STATE"
    session.expire_all()
    c2 = repo.get_claim(session, c.id)
    assert c2 and c2.status == "cancelled" and c2.cancel_reason == "expired"
    assert client.get("/meal-relay/claims/mine", headers=VOL1).json() == []


# ---------------------------------------------------------------- M8：取消（V7）


def test_v7_cancel_returns_stock_and_keeps_assignment(client: TestClient, session: Session) -> None:
    before = __remaining(session, "f-6")
    a, c = __dispatch(session, "e-2")
    assert __remaining(session, "f-6") == before - 1  # 派送時預扣（M2）

    r = client.post(f"/meal-relay/claims/{c.id}/cancel", headers=VOL1, json={"reason": "長者今天不在家"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "cancelled" and body["cancel_reason"] == "長者今天不在家"
    assert body["food"]["remaining"] == before and body["food"]["dispatched_qty"] == 0
    assert __remaining(session, "f-6") == before  # 份數加回（M1）
    a2 = repo.get_assignment(session, a.id)
    assert a2 and a2.status == "assigned" and a2.needs_care  # 任務仍在，可以只做關懷（M8）
    assert client.get("/meal-relay/claims/mine", headers=VOL1).json() == []


def test_cancel_delivering_also_returns_stock(client: TestClient, session: Session) -> None:
    before = __remaining(session, "f-6")
    a, c = __dispatch(session, "e-2")
    assert client.post(f"/meal-relay/claims/{c.id}/pickup", headers=VOL1).status_code == 200
    r = client.post(f"/meal-relay/claims/{c.id}/cancel", headers=VOL1)  # body 可省略
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["cancel_reason"] is None
    assert __remaining(session, "f-6") == before
    a2 = repo.get_assignment(session, a.id)
    assert a2 and a2.status == "assigned"


def test_cancel_body_is_optional_and_strict(client: TestClient, session: Session) -> None:
    _, c1 = __dispatch(session, "e-2")
    r = client.post(f"/meal-relay/claims/{c1.id}/cancel", headers=VOL1, json={})
    assert r.status_code == 200 and r.json()["cancel_reason"] is None
    _, c2 = __dispatch(session, "e-4")
    r = client.post(f"/meal-relay/claims/{c2.id}/cancel", headers=VOL1, json={"reason": "   "})
    assert r.status_code == 200 and r.json()["cancel_reason"] is None  # 空白視為沒填

    _, c3 = __dispatch(session, "e-5")
    r = client.post(f"/meal-relay/claims/{c3.id}/cancel", headers=VOL1, json={"reason": "x", "qty": 1})
    assert r.status_code == 422 and __code(r) == "VALIDATION_ERROR"  # 多送欄位
    r = client.post(f"/meal-relay/claims/{c3.id}/cancel", headers=VOL1, json={"reason": "長" * 101})
    assert r.status_code == 422 and __code(r) == "VALIDATION_ERROR"  # 超過 100 字
    session.expire_all()
    c3b = repo.get_claim(session, c3.id)
    assert c3b and c3b.status == "claimed"


def test_cancel_done_claim_is_invalid_state(client: TestClient, session: Session) -> None:
    _, c = __dispatch(session, "e-2", status="done")
    r = client.post(f"/meal-relay/claims/{c.id}/cancel", headers=VOL1)
    assert r.status_code == 409 and __code(r) == "INVALID_STATE"
