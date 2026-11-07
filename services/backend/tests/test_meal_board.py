"""管理員看板 meal_board（T-113）：GET /meal-relay/board 的回應型別、stats、權限（合約 v2.2 §8）。"""

from collections.abc import Iterator
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_board
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import models as m
from townpass_backend.features.meal_relay import repo, schemas

T0 = mr.now().replace(microsecond=0)
TODAY = mr.local_day_start(T0)  # 台北時間今天 0 點（UTC）
YESTERDAY = TODAY - timedelta(minutes=1)  # 台北時間昨天 23:59
ADMIN = {"X-Demo-User": "u-admin-1"}
# 種子在 T0：6 份食物都 open；警示 = 從未見到 e-2、e-3，逾期 e-4、e-5、e-6、e-11，下次送餐時間已到 e-10
SEED_FOODS_OPEN = 6
SEED_ALERTS = 7


@pytest.fixture
def session(client: TestClient) -> Iterator[Session]:  # client → 已跑過 sync_schema 與 seed
    with Session(engine) as s:
        mr.reset_demo(s, T0)
        yield s


def __claim(session: Session, claim_id: str, food_id: str, elder_id: str, status: str, **kw: object) -> None:
    row = m.MealClaim(id=claim_id, food_id=food_id, elder_id=elder_id, qty=1, method="delivery", status=status,
                      requested_by="u-vol-1", volunteer_id="u-vol-1", created_at=T0 - timedelta(hours=2),
                      **kw)  # fmt: skip
    repo.create_claim(session, row)


def __visit(session: Session, visit_id: str, elder_id: str, result: str, at: datetime) -> None:
    row = m.MealVisit(id=visit_id, elder_id=elder_id, volunteer_id="u-vol-1", kind="care", result=result,
                      visited_at=at)  # fmt: skip
    repo.create_visit(session, row)


def __checkin(session: Session, checkin_id: str, volunteer_id: str, at: datetime) -> None:
    repo.create_checkin(
        session, m.MealCheckin(id=checkin_id, volunteer_id=volunteer_id, station_id="st-1", checked_in_at=at)
    )


# ---------------------------------------------------------------- 種子資料


def test_board_seed_stats(session: Session) -> None:
    board = meal_board.get_board(session, T0)
    assert board.stats == schemas.BoardStats(
        foods_open=SEED_FOODS_OPEN, delivered_today=0, seen_today=0, alerts=SEED_ALERTS, checkins_today=0
    )
    # 與共用規則一致（M1、M10），沒有自己重算
    assert board.stats.alerts == sum(mr.to_elder(session, e, T0).alert for e in repo.list_elders(session))
    assert board.stats.foods_open == sum(
        mr.to_food(session, f, T0).status == "open" for f in repo.list_foods(session)
    )
    assert len(board.stations) == 2 and len(board.points) == 6 and len(board.foods) == 6
    assert len(board.elders) == 12 and board.claims == []  # ADR-025：種子沒有申請
    # 食物點的 open_food_count = 這個點 status = open 的食物數
    counts = {p.id: p.open_food_count for p in board.points}
    assert counts["p-1"] == 2 and counts["p-4"] == 2 and sum(counts.values()) == SEED_FOODS_OPEN


# ---------------------------------------------------------------- 今天的統計


def test_board_stats_count_today_done_and_seen(session: Session) -> None:
    __claim(session, "c-done", "f-6", "e-4", "done", done_at=T0)  # 今天送達 → 算
    __claim(session, "c-old", "f-6", "e-5", "done", done_at=YESTERDAY)  # 昨天送達 → 不算
    __claim(session, "c-run", "f-6", "e-6", "delivering")  # 還在送 → 不算
    __visit(session, "vi-1", "e-4", "seen", T0)  # 今天見到 → 算
    __visit(session, "vi-2", "e-4", "seen", T0)  # 同一位長者再見一次 → 仍是 1 位
    __visit(session, "vi-3", "e-5", "left_at_door", T0)  # 沒見到本人 → 不算
    __visit(session, "vi-4", "e-6", "returned", T0)  # 帶回 → 不算
    __visit(session, "vi-5", "e-2", "seen", YESTERDAY)  # 昨天 → 不算

    stats = meal_board.get_board(session, T0).stats
    assert stats.delivered_today == 1
    assert stats.seen_today == 1
    assert stats.foods_open == SEED_FOODS_OPEN  # f-6 還有剩（10 − 3）
    assert stats.alerts == SEED_ALERTS  # 只寫了拜訪，沒改長者欄位（M9 由 meal_elder 負責）


def test_board_stats_follow_elder_alert(session: Session) -> None:  # M9 之後 M10 重算
    e4 = repo.get_elder(session, "e-4")
    assert e4
    repo.update_elder(session, e4, last_seen_at=T0, last_meal_at=T0)
    assert meal_board.get_board(session, T0).stats.alerts == SEED_ALERTS - 1


def test_board_stats_foods_open_follows_m1(session: Session) -> None:
    f5, f2 = repo.get_food(session, "f-5"), repo.get_food(session, "f-2")
    assert f5 and f2 and f5.qty == 2
    __claim(session, "c-a", "f-5", "e-2", "claimed")
    __claim(session, "c-b", "f-5", "e-3", "done", done_at=T0)  # 全數派出 → claimed，不算 open
    repo.update_food(session, f2, closed=True)  # 下架 → closed
    board = meal_board.get_board(session, T0)
    assert board.stats.foods_open == SEED_FOODS_OPEN - 2
    assert {f.id: f.status for f in board.foods}["f-5"] == "claimed"
    assert {p.id: p.open_food_count for p in board.points}["p-1"] == 1


def test_board_stats_checkins_today_counts_volunteers(session: Session) -> None:
    __checkin(session, "ck-1", "u-vol-1", T0)
    __checkin(session, "ck-2", "u-vol-1", T0)  # 同一位志工重複報到 → 1 位
    __checkin(session, "ck-3", "u-vol-3", T0)
    __checkin(session, "ck-4", "u-vol-2", YESTERDAY)  # 昨天 → 不算
    assert meal_board.get_board(session, T0).stats.checkins_today == 2


def test_today_is_taipei_time() -> None:
    local = mr.to_local(TODAY)
    assert local and (local.hour, local.minute) == (0, 0) and local.utcoffset() == timedelta(hours=8)


# ---------------------------------------------------------------- 清單


def test_board_claims_exclude_cancelled(session: Session) -> None:
    __claim(session, "c-1", "f-6", "e-4", "claimed")
    __claim(session, "c-2", "f-6", "e-5", "delivering")
    __claim(session, "c-3", "f-6", "e-6", "done", done_at=T0)
    __claim(session, "c-4", "f-6", "e-2", "cancelled", cancel_reason="returned")
    claims = meal_board.get_board(session, T0).claims
    assert [c.id for c in claims] == ["c-1", "c-2", "c-3"]
    assert claims[0].food.id == "f-6" and claims[0].elder.alias


def test_board_elders_exclude_merged(session: Session) -> None:
    e3 = repo.get_elder(session, "e-3")
    assert e3
    repo.update_elder(session, e3, merged_into="e-2")  # 舊資料（v2.2 起不再合併）
    board = meal_board.get_board(session, T0)
    assert "e-3" not in {e.id for e in board.elders} and len(board.elders) == 11
    assert board.stats.alerts == SEED_ALERTS - 1  # e-3 從未見到，但已合併 → 不算


# ---------------------------------------------------------------- HTTP


def test_get_board_as_admin_matches_board_type(session: Session, client: TestClient) -> None:
    __claim(session, "c-done", "f-6", "e-4", "done", done_at=mr.now())
    __visit(session, "vi-1", "e-4", "seen", mr.now())
    __checkin(session, "ck-1", "u-vol-1", mr.now())
    r = client.get("/meal-relay/board", headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    board = schemas.Board.model_validate(body)  # 回應符合 Board 型別
    assert set(body) == {"stations", "points", "foods", "elders", "claims", "stats"}
    assert set(body["stats"]) == {"foods_open", "delivered_today", "seen_today", "alerts", "checkins_today"}
    assert (
        board.stats.delivered_today == 1 and board.stats.seen_today == 1 and board.stats.checkins_today == 1
    )
    assert [c.id for c in board.claims] == ["c-done"]
    assert body["foods"][0]["expires_at"].endswith("+08:00")
    assert "checkin_code" not in body["stations"][0]  # Station 不含 checkin_code（M15）
    assert {"remaining", "dispatched_qty", "delivered_qty", "status", "unclaimed"} <= set(body["foods"][0])
    assert {"care_due", "meal_due", "alert", "location"} <= set(body["elders"][0])


@pytest.mark.parametrize("account", ["u-vol-1", "u-sup-1", "u-st-1", "u-cit-1", "tp-unknown"])
def test_get_board_non_admin_is_forbidden(session: Session, client: TestClient, account: str) -> None:
    r = client.get("/meal-relay/board", headers={"X-Demo-User": account})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "FORBIDDEN_ROLE"


def test_get_board_without_header_is_unauthenticated(session: Session, client: TestClient) -> None:  # V1
    r = client.get("/meal-relay/board")
    assert r.status_code == 401 and r.json()["detail"]["code"] == "UNAUTHENTICATED"
