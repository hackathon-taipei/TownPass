"""鄰食轉運站共用資料層與規則（T-107）：資料表、種子、refresh、M1／M4／M5／M6／M10／M18、身分。"""

from collections.abc import Iterator
from datetime import timedelta
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import inspect
from sqlmodel import Session

from townpass_backend.db import SessionDep, engine
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import models as m
from townpass_backend.features.meal_relay import repo, schemas

T0 = mr.now().replace(microsecond=0)


@pytest.fixture
def session(client: TestClient) -> Iterator[Session]:  # client → 已跑過 sync_schema 與 seed
    with Session(engine) as s:
        mr.reset_demo(s, T0)
        yield s


# ---------------------------------------------------------------- 資料表與種子


def test_all_meal_tables_exist(client: TestClient) -> None:
    tables = set(inspect(engine).get_table_names())
    expected = {
        "meal_account", "meal_station", "meal_supplier", "meal_point", "meal_food", "meal_image",
        "meal_elder", "meal_claim", "meal_visit", "meal_checkin", "meal_assignment",
    }  # fmt: skip
    assert expected <= tables


def test_seed_meets_contract_minimums(session: Session) -> None:
    accounts = repo.list_accounts(session)
    roles = [a.role for a in accounts]
    assert roles.count("admin") >= 1 and roles.count("volunteer") >= 3
    assert roles.count("supplier") >= 2 and roles.count("station") >= 2
    vol1, vol2 = repo.get_account(session, "u-vol-1"), repo.get_account(session, "u-vol-2")
    assert vol1 and vol2 and vol1.station_id == vol2.station_id == "st-1"
    assert len(repo.list_stations(session)) >= 2
    sups = repo.list_suppliers(session)
    assert len([s for s in sups if s.status == "approved"]) >= 2 and repo.list_suppliers(session, "pending")
    assert {p.kind for p in repo.list_points(session)} >= {"station", "village_office", "school", "custom"}
    foods = repo.list_foods(session)
    assert len(foods) >= 6 and {"meal_box", "produce"} <= {f.category for f in foods}
    elders = repo.list_elders(session)
    assert len(elders) >= 12
    assert len(repo.list_elders(session, primary_volunteer_id="u-vol-1")) == 4
    assert sum(e.last_seen_at is None for e in elders) >= 2
    assert sum(bool(e.allergens) for e in elders) >= 2
    statuses = [c.status for c in repo.list_claims(session)]
    assert "requested" in statuses and "ready_for_pickup" in statuses
    # 種子相對時間：以 T0 換算
    f1 = repo.get_food(session, "f-1")
    assert f1 and f1.expires_at == T0 + timedelta(hours=3)


def test_seed_is_idempotent(session: Session) -> None:
    before = len(repo.list_accounts(session)), len(repo.list_foods(session))
    mr.seed(session)
    mr.seed(session)
    assert (len(repo.list_accounts(session)), len(repo.list_foods(session))) == before


def test_reset_demo_restores_seed_state(session: Session) -> None:
    f1 = repo.get_food(session, "f-1")
    assert f1
    repo.update_food(session, f1, name="被改掉了")
    repo.create_account(session, m.MealAccount(id="u-tmp", role="admin"))
    mr.reset_demo(session, T0)
    assert repo.get_account(session, "u-tmp") is None
    f1 = repo.get_food(session, "f-1")
    assert f1 and f1.name == "排骨便當（模擬）"


def test_clear_all_empties_every_meal_table(session: Session) -> None:
    repo.clear_all(session)
    assert not repo.has_any_account(session)
    assert not repo.list_foods(session) and not repo.list_elders(session, include_merged=True)
    mr.reset_demo(session, T0)


@pytest.mark.parametrize(
    ("text", "delta"),
    [
        ("now", timedelta()),
        ("now+90m", timedelta(minutes=90)),
        ("now-2d", timedelta(days=-2)),
        ("now+3h", timedelta(hours=3)),
        ("now-30s", timedelta(seconds=-30)),
    ],
)
def test_relative_time_parsing(text: str, delta: timedelta) -> None:
    assert mr.parse_time(text, T0) == T0 + delta


def test_absolute_time_parsing_is_stored_as_utc() -> None:
    parsed = mr.parse_time("2026-11-07T08:00:00+08:00", T0)
    assert parsed is not None and parsed.utcoffset() == timedelta(0) and parsed.hour == 0
    naive = mr.parse_time("2026-11-07T08:00:00", T0)  # 沒時區 → 視為台北時間
    assert naive == parsed
    assert mr.parse_time(None, T0) is None


def test_output_times_are_taipei() -> None:
    out = mr.to_local(T0)
    assert out is not None and out.utcoffset() == timedelta(hours=8)


def test_new_id_format() -> None:
    i = mr.new_id("f")
    assert i.startswith("f-") and len(i) == 10


# ---------------------------------------------------------------- M1 / M4 / M5


def test_m1_remaining_and_status_priority(session: Session) -> None:
    f1 = repo.get_food(session, "f-1")
    assert f1
    food = mr.to_food(session, f1, T0)
    assert food.remaining == 4  # 5 − c-1 的 1 份
    assert food.status == "open" and food.location.lat == pytest.approx(25.0368)
    assert food.point_name and food.supplier_name

    # 全數申請 → claimed
    e2 = repo.get_elder(session, "e-2")
    assert e2
    repo.create_claim(session, m.MealClaim(id="c-t1", food_id="f-1", elder_id="e-2", qty=4, method="pickup",
                                           status="ready_for_pickup", requested_by="x", created_at=T0))  # fmt: skip
    assert mr.to_food(session, f1, T0).status == "claimed"
    # 取消就退回（M1 自然成立，V7）
    c = repo.get_claim(session, "c-t1")
    assert c
    repo.update_claim(session, c, status="cancelled")
    assert mr.to_food(session, f1, T0).remaining == 4
    # 過期優先於 claimed；下架優先於過期
    later = f1.expires_at + timedelta(seconds=1)
    assert mr.food_status(f1, 0, later) == "expired"
    assert mr.food_status(f1, 0, T0) == "claimed"
    repo.update_food(session, f1, closed=True)
    assert mr.food_status(f1, 0, later) == "closed"


def test_m4_allergen_conflict(session: Session) -> None:
    e1, f4, f1 = repo.get_elder(session, "e-1"), repo.get_food(session, "f-4"), repo.get_food(session, "f-1")
    assert e1 and f4 and f1
    assert mr.allergen_conflict(f4, e1) == ["peanut"]
    assert mr.allergen_conflict(f1, e1) == []
    assert mr.allergen_conflict(mr.to_food(session, f4, T0), mr.to_elder(session, e1, T0)) == ["peanut"]


def test_m5_unclaimed_after_claim_window(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    f2 = repo.get_food(session, "f-2")  # created_at = now
    assert f2
    window = mr.settings().CLAIM_WINDOW_SEC
    assert window == 20  # demo
    assert mr.to_food(session, f2, T0 + timedelta(seconds=window)).unclaimed is False
    food = mr.to_food(session, f2, T0 + timedelta(seconds=window + 1))
    assert food.unclaimed is True and food.status == "open"  # 只是提醒，仍可申請
    monkeypatch.setenv("MEAL_RELAY_MODE", "prod")
    assert mr.settings().CLAIM_WINDOW_SEC == 600
    assert mr.to_food(session, f2, T0 + timedelta(seconds=window + 1)).unclaimed is False


# ---------------------------------------------------------------- M10


def __elder(session: Session, **fields: object) -> m.MealElder:
    row = m.MealElder(id=mr.new_id("e"), alias="測試阿嬤", station_id="st-1", lat=25.036, lng=121.5,
                      created_by="test", created_at=T0 - timedelta(days=30), **fields)  # fmt: skip
    return repo.create_elder(session, row)


def test_m10_never_seen_is_due(session: Session) -> None:
    e = mr.to_elder(session, __elder(session), T0)
    assert e.care_due and e.meal_due and e.alert
    assert e.days_since_seen is None and e.days_since_meal is None


def test_m10_recent_is_not_due(session: Session) -> None:
    e = mr.to_elder(session, __elder(session, last_seen_at=T0 - timedelta(hours=2), last_meal_at=T0), T0)
    assert not e.care_due and not e.meal_due and not e.alert
    assert e.days_since_seen == 0


def test_m10_overdue_by_alert_days(session: Session) -> None:
    days = mr.settings().CARE_ALERT_DAYS
    just = __elder(session, last_seen_at=T0 - timedelta(days=days), last_meal_at=T0 - timedelta(days=days))
    assert not mr.to_elder(session, just, T0).alert  # 剛好 = 天數，不算超過
    over = __elder(session, last_seen_at=T0 - timedelta(days=days + 1), last_meal_at=T0)
    e = mr.to_elder(session, over, T0)
    assert e.care_due and not e.meal_due and e.alert and e.days_since_seen == days + 1


def test_m10_next_time_overrides_last_seen(session: Session) -> None:
    old = T0 - timedelta(days=10)
    future = __elder(session, last_seen_at=old, last_meal_at=old,
                     next_care_at=T0 + timedelta(hours=1), next_meal_at=T0 + timedelta(hours=1))  # fmt: skip
    e = mr.to_elder(session, future, T0)
    assert not e.care_due and not e.meal_due and not e.alert
    past = __elder(session, last_seen_at=T0, last_meal_at=T0,
                   next_care_at=T0 - timedelta(minutes=1), next_meal_at=T0)  # fmt: skip
    e = mr.to_elder(session, past, T0)
    assert e.care_due and e.meal_due  # now ≥ next_*_at


def test_m10_pending_request_forces_meal_due(session: Session) -> None:
    e1 = repo.get_elder(session, "e-1")  # 最近才見過，但有 c-1 requested
    assert e1
    e = mr.to_elder(session, e1, T0)
    assert e.pending_request and e.meal_due and not e.care_due and e.alert


def test_seed_alerts_match_scenarios(session: Session) -> None:
    alerts = {e.id: mr.to_elder(session, e, T0).alert for e in repo.list_elders(session)}
    assert alerts["e-2"] and alerts["e-4"] and alerts["e-10"]  # 從未見到、逾期、下次時間已到
    assert not alerts["e-7"] and not alerts["e-9"] and not alerts["e-12"]  # 最近見過、下次時間未到


# ---------------------------------------------------------------- M6 / M18 refresh


def test_m6_refresh_cancels_claims_of_expired_food(session: Session) -> None:  # V9
    f1 = repo.get_food(session, "f-1")
    assert f1
    repo.update_food(session, f1, expires_at=T0 - timedelta(minutes=1))
    result = mr.refresh(session, T0)
    assert result.cancelled_claims == 1
    c1 = repo.get_claim(session, "c-1")
    assert c1 and c1.status == "cancelled" and c1.cancel_reason == "expired"
    assert mr.to_food(session, f1, T0).status == "expired"
    c2 = repo.get_claim(session, "c-2")  # 別的食物不受影響
    assert c2 and c2.status == "ready_for_pickup"
    assert mr.refresh(session, T0).cancelled_claims == 0  # 再跑一次不重複


def __assignment(
    session: Session, elder_id: str, claim_id: str | None, expires_in: timedelta
) -> m.MealAssignment:
    row = m.MealAssignment(id=mr.new_id("as"), checkin_id="ck-x", volunteer_id="u-vol-1", elder_id=elder_id,
                           station_id="st-1", needs_meal=claim_id is not None, needs_care=True, claim_id=claim_id,
                           assigned_at=T0 - timedelta(minutes=5), expires_at=T0 + expires_in)  # fmt: skip
    return repo.create_assignment(session, row)


def test_m18_release_cancels_auto_claim_and_returns_elder_request(session: Session) -> None:  # V16
    f6 = repo.get_food(session, "f-6")
    assert f6
    before = mr.food_remaining(session, f6)
    auto = repo.create_claim(session, m.MealClaim(id="c-auto", food_id="f-6", elder_id="e-4", qty=1,
                                                  method="delivery", status="claimed", requested_by="u-vol-1",
                                                  volunteer_id="u-vol-1", created_at=T0, claimed_at=T0))  # fmt: skip
    a_auto = __assignment(session, "e-4", "c-auto", timedelta(minutes=-1))
    repo.update_claim(session, auto, assignment_id=a_auto.id)
    c1 = repo.get_claim(session, "c-1")
    assert c1
    a_req = __assignment(session, "e-1", "c-1", timedelta(minutes=-1))
    repo.update_claim(
        session, c1, status="claimed", volunteer_id="u-vol-1", assignment_id=a_req.id, claimed_at=T0
    )
    assert mr.food_remaining(session, f6) == before - 1

    result = mr.refresh(session, T0)
    assert result.released_assignments == 2
    a_auto2, a_req2 = repo.get_assignment(session, a_auto.id), repo.get_assignment(session, a_req.id)
    assert a_auto2 and a_auto2.status == "released" and a_req2 and a_req2.status == "released"
    auto2 = repo.get_claim(session, "c-auto")
    assert auto2 and auto2.status == "cancelled" and auto2.cancel_reason == "released"
    assert mr.food_remaining(session, f6) == before  # 份數退回
    c1b = repo.get_claim(session, "c-1")
    assert c1b and c1b.status == "requested" and c1b.volunteer_id is None and c1b.assignment_id is None


def test_m18_delivering_claim_is_untouched(session: Session) -> None:
    c1 = repo.get_claim(session, "c-1")
    assert c1
    a = __assignment(session, "e-1", "c-1", timedelta(minutes=-1))
    repo.update_claim(session, c1, status="delivering", volunteer_id="u-vol-1", assignment_id=a.id)
    mr.refresh(session, T0)
    a2, c1b = repo.get_assignment(session, a.id), repo.get_claim(session, "c-1")
    assert a2 and a2.status == "released" and c1b and c1b.status == "delivering"


def test_m18_visit_marks_assignment_done(session: Session) -> None:
    a = __assignment(session, "e-5", None, timedelta(minutes=-1))  # 已過期，但有拜訪回報 → done 優先
    repo.create_visit(session, m.MealVisit(id="vi-t", elder_id="e-5", volunteer_id="u-vol-1", kind="care",
                                           result="seen", visited_at=T0 - timedelta(minutes=2)))  # fmt: skip
    result = mr.refresh(session, T0)
    a2 = repo.get_assignment(session, a.id)
    assert result.done_assignments == 1 and a2 and a2.status == "done" and a2.done_at is not None


def test_m18_active_assignment_not_yet_expired_stays(session: Session) -> None:
    a = __assignment(session, "e-5", None, timedelta(minutes=10))
    mr.refresh(session, T0)
    a2 = repo.get_assignment(session, a.id)
    assert a2 and a2.status == "assigned"
    assert mr.to_assignment(session, a2, T0).elder.id == "e-5"


# ---------------------------------------------------------------- 身分（deps）


def test_v2_unknown_account_is_elder(session: Session) -> None:
    acc = mr.get_account_or_default(session, "tp-unknown-123")
    assert acc.role == "elder" and repo.get_account(session, "tp-unknown-123") is None
    me = mr.to_me(session, acc, T0)
    assert me.role == "elder" and me.elder is None and me.supplier is None


def test_me_includes_profiles(session: Session) -> None:
    eld = mr.to_me(session, mr.get_account_or_default(session, "u-eld-1"), T0)
    assert eld.elder and eld.elder.id == "e-1"
    pending = mr.to_me(session, mr.get_account_or_default(session, "u-sup-3"), T0)
    assert pending.role == "elder" and pending.supplier and pending.supplier.status == "pending"
    vol = mr.to_me(session, mr.get_account_or_default(session, "u-vol-1"), T0)
    assert vol.role == "volunteer" and vol.station_id == "st-1"


def __probe_app() -> FastAPI:
    router = mr.meal_router("probe")

    @router.get("/probe/me")
    def me(account: mr.CurrentAccount, session: SessionDep) -> schemas.Me:
        return mr.to_me(session, account)

    @router.get("/probe/admin")
    def admin_only(account: Annotated[m.MealAccount, Depends(mr.require_roles("admin"))]) -> dict[str, str]:
        return {"id": account.id}

    @router.post("/probe/body")
    def body(payload: schemas.CheckInCreate) -> dict[str, str]:
        raise mr.MealError("WRONG_STATION", "掃了其他據點的 QR")

    app = FastAPI()
    app.include_router(router)
    return app


def test_deps_auth_roles_and_error_format(session: Session) -> None:
    with TestClient(__probe_app()) as c:
        r = c.get("/meal-relay/probe/me")  # V1
        assert r.status_code == 401 and r.json()["detail"]["code"] == "UNAUTHENTICATED"
        r = c.get("/meal-relay/probe/me", headers={"X-Demo-User": "tp-new"})  # V2
        assert r.status_code == 200 and r.json()["role"] == "elder" and r.json()["elder"] is None
        r = c.get("/meal-relay/probe/me", headers={"X-Demo-User": "u-eld-1"})
        assert r.json()["elder"]["last_seen_at"].endswith("+08:00")
        r = c.get("/meal-relay/probe/admin", headers={"X-Demo-User": "u-vol-1"})
        assert r.status_code == 403 and r.json()["detail"]["code"] == "FORBIDDEN_ROLE"
        assert c.get("/meal-relay/probe/admin", headers={"X-Demo-User": "u-admin-1"}).json() == {
            "id": "u-admin-1"
        }
        r = c.post("/meal-relay/probe/body", json={"qr_text": "x", "extra": 1})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "VALIDATION_ERROR"
        r = c.post("/meal-relay/probe/body", json={"qr_text": "x"})
        assert r.status_code == 403 and r.json()["detail"] == {
            "code": "WRONG_STATION",
            "message": "掃了其他據點的 QR",
        }


def test_current_account_runs_refresh_first(session: Session) -> None:  # V9 經過 API
    f1 = repo.get_food(session, "f-1")
    assert f1
    repo.update_food(session, f1, expires_at=mr.now() - timedelta(minutes=1))
    with TestClient(__probe_app()) as c:
        assert c.get("/meal-relay/probe/me", headers={"X-Demo-User": "u-eld-1"}).status_code == 200
    session.expire_all()
    c1 = repo.get_claim(session, "c-1")
    assert c1 and c1.status == "cancelled" and c1.cancel_reason == "expired"


# ---------------------------------------------------------------- 其他共用規則


def test_request_models_forbid_extra_fields() -> None:
    with pytest.raises(ValidationError):
        schemas.ClaimCreate.model_validate({"food_id": "f-1", "method": "pickup", "phone": "x"})
    with pytest.raises(ValidationError):
        schemas.FoodCreate.model_validate({"point_id": "p-1", "name": "x", "category": "pizza", "qty": 1,
                                           "expires_at": "2026-11-07T12:00:00+08:00"})  # fmt: skip


def test_qr_and_distance(session: Session) -> None:
    st1 = repo.get_station(session, "st-1")
    assert st1
    text = mr.station_qr_text(st1)
    assert text.startswith("meal-relay:checkin:") and st1.id not in text  # M15：不等於據點 id
    assert mr.parse_qr_text(text) == st1.checkin_code and mr.parse_qr_text("hello") is None
    st2 = repo.get_station(session, "st-2")
    assert st2 and 1000 < mr.distance_m(st1, st2) < 2000
    assert mr.distance_m(st1, schemas.Location(lat=st1.lat, lng=st1.lng)) == pytest.approx(0)


def test_ensure_station_access() -> None:
    vol = m.MealAccount(id="v", role="volunteer", station_id="st-1")
    mr.ensure_station_access(vol, "st-1")
    with pytest.raises(mr.MealError) as e:
        mr.ensure_station_access(vol, "st-2")
    assert e.value.code == "WRONG_STATION" and e.value.status == 403
    mr.ensure_station_access(m.MealAccount(id="a", role="admin"), "st-2")
