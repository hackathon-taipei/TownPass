"""鄰食轉運站共用資料層與規則（T-107、T-123）：資料表、種子、refresh、M1／M4／M5／M6／M10／M13／M14／M15／M18、身分。"""

from collections import Counter
from collections.abc import Iterator
from datetime import timedelta
from typing import Annotated, get_args

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import inspect, text
from sqlmodel import Session

from townpass_backend.db import SessionDep, engine, sync_schema
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
    roles = Counter(a.role for a in accounts)
    assert roles["admin"] >= 1 and roles["volunteer"] >= 3 and roles["supplier"] >= 2
    assert roles["citizen"] >= 2 and roles["station"] >= 2
    assert "elder" not in roles and set(roles) <= set(schemas.ROLES)  # ADR-026：長者不是帳號
    assert not any(a.elder_id for a in accounts)
    vol1, vol2 = repo.get_account(session, "u-vol-1"), repo.get_account(session, "u-vol-2")
    assert vol1 and vol2 and vol1.station_id == vol2.station_id == "st-1"
    # 一般市民：u-sup-3 已申請、審核中的提供者；u-cit-1 什麼都還沒做
    applicant, citizen = repo.get_account(session, "u-sup-3"), repo.get_account(session, "u-cit-1")
    assert applicant and applicant.role == "citizen" and applicant.supplier_id == "s-3"
    assert citizen and citizen.role == "citizen" and citizen.supplier_id is None
    assert repo.get_supplier_by_account(session, "u-cit-1") is None
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
    # 長者名冊只由管理員登記（ADR-026）
    assert all(e.created_by == "u-admin-1" and e.account_id is None for e in elders)
    admin = repo.get_account(session, "u-admin-1")
    assert admin and admin.role == "admin"
    assert repo.list_claims(session) == []  # ADR-025：申請只由派送產生，種子沒有申請
    # 種子相對時間：以 T0 換算
    f1 = repo.get_food(session, "f-1")
    assert f1 and f1.expires_at == T0 + timedelta(hours=3)


def test_seed_is_idempotent(session: Session) -> None:
    before = len(repo.list_accounts(session)), len(repo.list_foods(session))
    mr.seed(session)
    mr.seed(session)
    assert (len(repo.list_accounts(session)), len(repo.list_foods(session))) == before


def test_seed_converts_legacy_elder_accounts(session: Session) -> None:  # ADR-026：已部署的資料庫升級
    repo.create_account(session, m.MealAccount(id="u-old-eld-1", role="elder", name="舊版長者帳號（模擬）",
                                               elder_id="e-1"))  # fmt: skip
    repo.create_account(session, m.MealAccount(id="u-old-eld-2", role="elder", name="舊版長者帳號（模擬）"))
    before = len(repo.list_accounts(session)), len(repo.list_foods(session)), len(repo.list_elders(session))
    mr.seed(session)
    session.expire_all()
    for account_id in ("u-old-eld-1", "u-old-eld-2"):
        acc = repo.get_account(session, account_id)
        assert acc and acc.role == "citizen"
    old1 = repo.get_account(session, "u-old-eld-1")
    assert old1 and old1.elder_id == "e-1"  # 只改角色，其他欄位不動
    assert repo.list_accounts(session, role="elder") == []
    # 已有帳號：不重新匯入種子，其他資料不動
    after = len(repo.list_accounts(session)), len(repo.list_foods(session)), len(repo.list_elders(session))
    assert after == before
    vol1 = repo.get_account(session, "u-vol-1")
    assert vol1 and vol1.role == "volunteer"
    assert repo.convert_elder_accounts_to_citizen(session) == 0  # 再跑一次不重複


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


def __claim(
    session: Session,
    claim_id: str,
    food_id: str,
    elder_id: str,
    *,
    qty: int = 1,
    status: str = "claimed",
    assignment_id: str | None = None,
    requested_by: str = "u-vol-1",
) -> m.MealClaim:
    """M7、M17：派送建立的送餐申請（method 一律 delivery，requested_by 是志工）。"""
    row = m.MealClaim(id=claim_id, food_id=food_id, elder_id=elder_id, qty=qty, method="delivery", status=status,
                      requested_by=requested_by, volunteer_id="u-vol-1", assignment_id=assignment_id,
                      created_at=T0, claimed_at=T0)  # fmt: skip
    return repo.create_claim(session, row)


def test_claim_enums_follow_adr_025() -> None:
    assert get_args(schemas.ClaimStatus) == ("claimed", "delivering", "done", "cancelled")
    assert get_args(schemas.ClaimMethod) == ("delivery",)
    assert repo.ACTIVE_CLAIM_STATUSES == ("claimed", "delivering")
    assert not hasattr(schemas, "ClaimCreate")  # 沒有手動申請的入口（M7）
    assert m.MealClaim(id="c-x").method == "delivery" and m.MealClaim(id="c-x").status == "claimed"


def test_m1_remaining_and_status_priority(session: Session) -> None:
    f1 = repo.get_food(session, "f-1")
    assert f1
    food = mr.to_food(session, f1, T0)
    assert food.remaining == 5  # 種子沒有申請
    assert food.dispatched_qty == 0 and food.delivered_qty == 0
    assert food.status == "open" and food.location.lat == pytest.approx(repo.get_point(session, "p-1").lat)
    assert food.point_name and food.supplier_name

    # 全數申請 → claimed
    __claim(session, "c-t1", "f-1", "e-2", qty=5)
    assert mr.to_food(session, f1, T0).status == "claimed"
    # 取消就退回（M1 自然成立，V7）
    c = repo.get_claim(session, "c-t1")
    assert c
    repo.update_claim(session, c, status="cancelled")
    assert mr.to_food(session, f1, T0).remaining == 5
    # 過期優先於 claimed；下架優先於過期
    later = f1.expires_at + timedelta(seconds=1)
    assert mr.food_status(f1, 0, later) == "expired"
    assert mr.food_status(f1, 0, T0) == "claimed"
    repo.update_food(session, f1, closed=True)
    assert mr.food_status(f1, 0, later) == "closed"


def test_v21_food_usage_matches_claim_statuses(session: Session) -> None:  # M1、M14
    f6 = repo.get_food(session, "f-6")
    assert f6 and f6.qty == 10
    __claim(session, "c-u1", "f-6", "e-2", qty=2, status="claimed")
    __claim(session, "c-u2", "f-6", "e-4", qty=1, status="delivering")
    __claim(session, "c-u3", "f-6", "e-5", qty=2, status="done")
    __claim(session, "c-u4", "f-6", "e-6", qty=2, status="cancelled")  # 取消的不算（份數已退回）
    __claim(session, "c-u5", "f-1", "e-7", qty=2, status="claimed")  # 別的食物不算
    usage = mr.food_usage(session, f6)
    assert usage == mr.FoodUsage(dispatched=3, delivered=2) and usage.used == 5
    food = mr.to_food(session, f6, T0)
    assert (food.dispatched_qty, food.delivered_qty, food.remaining) == (3, 2, 5)
    assert food.status == "open" and mr.food_remaining(session, f6) == 5

    # M14：份數不能少於已派出加已送達
    with pytest.raises(mr.MealError) as e:
        mr.ensure_food_update(session, f6, schemas.FoodUpdate(qty=4), T0)
    assert e.value.code == "QTY_BELOW_USED" and e.value.status == 409 and "5" in e.value.message
    mr.ensure_food_update(session, f6, schemas.FoodUpdate(qty=5), T0)  # 等於已用掉的份數可以
    mr.ensure_food_update(session, f6, schemas.FoodUpdate(closed=True), T0)  # 沒改份數就不檢查
    # M14：到期時間不能早於現在
    with pytest.raises(mr.MealError) as e:
        mr.ensure_food_update(session, f6, schemas.FoodUpdate(expires_at=T0 - timedelta(minutes=1)), T0)
    assert e.value.code == "VALIDATION_ERROR" and e.value.status == 422
    mr.ensure_food_update(session, f6, schemas.FoodUpdate(qty=8, expires_at=T0 + timedelta(hours=2)), T0)
    with pytest.raises(mr.MealError) as e:  # 份數與時間一起改，份數不合也一樣擋
        mr.ensure_food_update(session, f6, schemas.FoodUpdate(qty=1, expires_at=T0 + timedelta(hours=2)), T0)
    assert e.value.code == "QTY_BELOW_USED"


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


def test_m10_pending_request_is_always_false(session: Session) -> None:  # ADR-025
    e1 = repo.get_elder(session, "e-1")  # 最近才見過、最近才送過餐
    assert e1
    __claim(session, "c-t1", "f-1", "e-1")  # 有進行中的派送申請也不影響警示
    e = mr.to_elder(session, e1, T0)
    assert not e.pending_request and not e.meal_due and not e.care_due and not e.alert
    assert not any(mr.to_elder(session, x, T0).pending_request for x in repo.list_elders(session))


def test_seed_alerts_match_scenarios(session: Session) -> None:
    alerts = {e.id: mr.to_elder(session, e, T0).alert for e in repo.list_elders(session)}
    assert alerts["e-2"] and alerts["e-4"] and alerts["e-10"]  # 從未見到、逾期、下次時間已到
    assert not alerts["e-7"] and not alerts["e-9"] and not alerts["e-12"]  # 最近見過、下次時間未到


# ---------------------------------------------------------------- M6 / M18 refresh


def test_m6_refresh_cancels_claims_of_expired_food(session: Session) -> None:  # V9
    f1 = repo.get_food(session, "f-1")
    assert f1
    __claim(session, "c-1", "f-1", "e-2")
    __claim(session, "c-2", "f-1", "e-4", status="delivering")
    __claim(session, "c-3", "f-1", "e-5", status="done")
    __claim(session, "c-4", "f-3", "e-6")  # 別的食物
    repo.update_food(session, f1, expires_at=T0 - timedelta(minutes=1))
    result = mr.refresh(session, T0)
    assert result.cancelled_claims == 2  # claimed、delivering 都取消（M6）
    for cid in ("c-1", "c-2"):
        c = repo.get_claim(session, cid)
        assert c and c.status == "cancelled" and c.cancel_reason == "expired"
    c3 = repo.get_claim(session, "c-3")  # 已完成的不動
    assert c3 and c3.status == "done"
    assert mr.to_food(session, f1, T0).status == "expired"
    c4 = repo.get_claim(session, "c-4")  # 別的食物不受影響
    assert c4 and c4.status == "claimed"
    assert mr.refresh(session, T0).cancelled_claims == 0  # 再跑一次不重複


def __assignment(
    session: Session, elder_id: str, claim_id: str | None, expires_in: timedelta
) -> m.MealAssignment:
    row = m.MealAssignment(id=mr.new_id("as"), checkin_id="ck-x", volunteer_id="u-vol-1", elder_id=elder_id,
                           station_id="st-1", needs_meal=claim_id is not None, needs_care=True, claim_id=claim_id,
                           assigned_at=T0 - timedelta(minutes=5), expires_at=T0 + expires_in)  # fmt: skip
    return repo.create_assignment(session, row)


def test_m18_release_cancels_claimed_claim_and_returns_stock(session: Session) -> None:  # V16
    f6 = repo.get_food(session, "f-6")
    assert f6
    before = mr.food_remaining(session, f6)
    auto = __claim(session, "c-auto", "f-6", "e-4")
    a_auto = __assignment(session, "e-4", "c-auto", timedelta(minutes=-1))
    repo.update_claim(session, auto, assignment_id=a_auto.id)
    assert mr.is_auto_claim(auto, a_auto)
    # 任務的 claim_id 有值但申請沒回填 assignment_id、requested_by 也不同：仍一律取消（沒有退回待接單）
    __claim(session, "c-odd", "f-6", "e-5", requested_by="someone-else")
    a_odd = __assignment(session, "e-5", "c-odd", timedelta(minutes=-1))
    assert mr.food_remaining(session, f6) == before - 2

    result = mr.refresh(session, T0)
    assert result.released_assignments == 2 and result.cancelled_claims == 2
    for aid in (a_auto.id, a_odd.id):
        a = repo.get_assignment(session, aid)
        assert a and a.status == "released"
    for cid in ("c-auto", "c-odd"):
        c = repo.get_claim(session, cid)
        assert c and c.status == "cancelled" and c.cancel_reason == "released"
    assert mr.food_remaining(session, f6) == before  # 份數退回
    assert mr.refresh(session, T0).cancelled_claims == 0  # 再跑一次不重複


def test_m18_delivering_claim_is_untouched(session: Session) -> None:
    a = __assignment(session, "e-1", "c-1", timedelta(minutes=-1))
    __claim(session, "c-1", "f-1", "e-1", status="delivering", assignment_id=a.id)
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


def test_v2_unknown_account_is_citizen(session: Session) -> None:
    acc = mr.get_account_or_default(session, "tp-unknown-123")
    assert acc.role == "citizen" and repo.get_account(session, "tp-unknown-123") is None  # 不寫進資料庫
    me = mr.to_me(session, acc, T0)
    assert me.role == "citizen" and me.supplier is None
    assert "elder" not in me.model_dump()  # ADR-026：Me 沒有 elder 欄位


def test_me_includes_profiles(session: Session) -> None:
    pending = mr.to_me(session, mr.get_account_or_default(session, "u-sup-3"), T0)
    assert pending.role == "citizen" and pending.supplier and pending.supplier.status == "pending"
    citizen = mr.to_me(session, mr.get_account_or_default(session, "u-cit-1"), T0)
    assert citizen.role == "citizen" and citizen.supplier is None and citizen.station_id is None
    sup = mr.to_me(session, mr.get_account_or_default(session, "u-sup-1"), T0)
    assert sup.role == "supplier" and sup.supplier and sup.supplier.status == "approved"
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
        assert r.status_code == 200 and r.json()["role"] == "citizen" and r.json()["supplier"] is None
        assert "elder" not in r.json()
        r = c.get("/meal-relay/probe/me", headers={"X-Demo-User": "u-cit-1"})
        assert r.status_code == 200 and r.json()["role"] == "citizen" and "elder" not in r.json()
        r = c.get("/meal-relay/probe/me", headers={"X-Demo-User": "u-sup-3"})  # 審核中的提供者申請人
        assert r.json()["role"] == "citizen" and r.json()["supplier"]["created_at"].endswith("+08:00")
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
    __claim(session, "c-1", "f-1", "e-2")
    repo.update_food(session, f1, expires_at=mr.now() - timedelta(minutes=1))
    with TestClient(__probe_app()) as c:
        assert c.get("/meal-relay/probe/me", headers={"X-Demo-User": "u-cit-1"}).status_code == 200
    session.expire_all()
    c1 = repo.get_claim(session, "c-1")
    assert c1 and c1.status == "cancelled" and c1.cancel_reason == "expired"


# ---------------------------------------------------------------- 其他共用規則


def test_request_models_forbid_extra_fields() -> None:
    with pytest.raises(ValidationError):
        schemas.ClaimCancel.model_validate({"reason": "x", "phone": "x"})
    with pytest.raises(ValidationError):
        schemas.FoodCreate.model_validate({"point_id": "p-1", "name": "x", "category": "pizza", "qty": 1,
                                           "expires_at": "2026-11-07T12:00:00+08:00"})  # fmt: skip


def test_qr_and_distance(session: Session) -> None:
    st1 = repo.get_station(session, "st-1")
    assert st1
    text = mr.station_qr_text(st1, T0)
    assert text.startswith("meal-relay:checkin:") and st1.id not in text  # M15：不等於據點 id
    parsed = mr.parse_qr_text(text)
    assert parsed and parsed[0] == st1.checkin_code and len(parsed[1]) == 10
    assert mr.parse_qr_text("hello") is None
    assert mr.parse_qr_text(f"meal-relay:checkin:{st1.checkin_code}") is None  # 沒有 token
    st2 = repo.get_station(session, "st-2")
    assert st2 and 1000 < mr.distance_m(st1, st2) < 2000
    assert mr.distance_m(st1, schemas.Location(lat=st1.lat, lng=st1.lng)) == pytest.approx(0)


def __qr_error(session: Session, text: str, account_id: str, at: object) -> str:
    account = repo.get_account(session, account_id)
    assert account
    with pytest.raises(mr.MealError) as e:
        mr.verify_qr_text(session, text, account, at)  # type: ignore[arg-type]
    return e.value.code


def test_m15_qr_rotates_and_expires(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:  # V12、V18
    monkeypatch.delenv("MEAL_RELAY_QR_SECRET", raising=False)
    st1, vol1 = repo.get_station(session, "st-1"), repo.get_account(session, "u-vol-1")
    assert st1 and vol1
    step = timedelta(seconds=mr.settings().QR_ROTATE_SEC)
    text = mr.station_qr_text(st1, T0)
    assert mr.verify_qr_text(session, text, vol1, T0).id == "st-1"  # 目前時間窗
    assert mr.verify_qr_text(session, text, vol1, T0 + step).id == "st-1"  # 前一個時間窗仍可
    assert mr.station_qr_text(st1, T0 + 2 * step) != text  # 會換
    assert __qr_error(session, text, "u-vol-1", T0 + 2 * step) == "QR_EXPIRED"  # 兩個時間窗以前
    tampered = text[:-1] + ("0" if text[-1] != "0" else "1")
    assert __qr_error(session, tampered, "u-vol-1", T0) == "QR_EXPIRED"
    assert __qr_error(session, text, "u-vol-3", T0) == "WRONG_STATION"  # u-vol-3 屬於 st-2
    assert __qr_error(session, "hello", "u-vol-1", T0) == "NOT_FOUND"
    assert __qr_error(session, f"meal-relay:checkin:{st1.checkin_code}", "u-vol-1", T0) == "NOT_FOUND"
    assert __qr_error(session, "meal-relay:checkin:ZZZZZZZZ:0123456789", "u-vol-1", T0) == "NOT_FOUND"
    # 換金鑰後舊 QR 失效
    monkeypatch.setenv("MEAL_RELAY_QR_SECRET", "another-secret")
    assert __qr_error(session, text, "u-vol-1", T0) == "QR_EXPIRED"
    assert mr.verify_qr_text(session, mr.station_qr_text(st1, T0), vol1, T0).id == "st-1"
    # 到期時間：晚於現在、不超過一個時間窗，以台北時間表示
    expires = mr.qr_expires_at(T0)
    assert T0 < expires <= T0 + step and expires.utcoffset() == timedelta(hours=8)


def test_m13_ensure_assigned_elder(session: Session) -> None:  # V20
    vol1, vol2 = repo.get_account(session, "u-vol-1"), repo.get_account(session, "u-vol-2")
    assert vol1 and vol2
    a = __assignment(session, "e-5", None, timedelta(minutes=10))  # u-vol-1 的任務
    assert mr.ensure_assigned_elder(session, vol1, "e-5").id == a.id
    for account, elder_id in ((vol2, "e-5"), (vol1, "e-6"), (vol1, "")):
        with pytest.raises(mr.MealError) as e:
            mr.ensure_assigned_elder(session, account, elder_id)
        assert e.value.code == "NOT_OWNER" and e.value.status == 403
    repo.update_assignment(session, a, status="done")  # 完成後就不能再回報
    with pytest.raises(mr.MealError):
        mr.ensure_assigned_elder(session, vol1, "e-5")


def test_new_error_codes_are_409() -> None:
    assert mr.MealError("QTY_BELOW_USED", "x").status == 409
    assert mr.MealError("QR_EXPIRED", "x").status == 409


# ---------------------------------------------------------------- 地址（T-133、ADR-030）

# T-115 §2 的原始地址（開放資料）。據點與食物點共用同一組地址；p-5、p-6 的原文沒有行政區
T115_ADDRESSES = {
    "st-1": "臺北市萬華區福音里康定路229號6樓",
    "st-2": "臺北市萬華區凌霄里中華路2段504巷43號1樓",
    "p-1": "臺北市萬華區福音里康定路229號6樓",
    "p-2": "臺北市萬華區凌霄里中華路2段504巷43號1樓",
    "p-3": "臺北市萬華區福音里昆明街284號1樓",
    "p-4": "臺北市萬華區福音里桂林路64號",
    "p-5": "大理街106號1樓",
    "p-6": "內江街55巷9號",
}
SIMULATED_SUPPLIER_ADDRESSES = {
    "s-1": "臺北市萬華區西園路一段999號（模擬）",
    "s-2": "臺北市萬華區桂林路999號（模擬）",
    "s-3": "臺北市萬華區西園路一段998號（模擬）",
}


def test_address_columns_exist_after_startup(client: TestClient) -> None:
    """資料表只增不減：啟動時（sync_schema）補上 address 欄位（ADR-030）。"""
    tables = inspect(engine)
    for table in ("meal_station", "meal_point", "meal_supplier"):
        assert "address" in {c["name"] for c in tables.get_columns(table)}


def test_seed_station_address_equals_t115(session: Session) -> None:
    for station_id in ("st-1", "st-2"):
        station = repo.get_station(session, station_id)
        assert station is not None and station.address == T115_ADDRESSES[station_id]


def test_seed_point_address_equals_t115(session: Session) -> None:
    for point_id in ("p-1", "p-2", "p-3", "p-4", "p-5", "p-6"):
        point = repo.get_point(session, point_id)
        assert point is not None and point.address == T115_ADDRESSES[point_id]


def test_seed_supplier_addresses_are_simulated(session: Session) -> None:
    suppliers = {s.id: s for s in repo.list_suppliers(session)}
    assert set(suppliers) == set(SIMULATED_SUPPLIER_ADDRESSES)
    for supplier_id, address in SIMULATED_SUPPLIER_ADDRESSES.items():
        assert suppliers[supplier_id].address == address
        assert address.endswith("（模擬）") and "99" in address  # 門牌是不存在的號碼，不對應真實住家


def test_address_defaults_to_empty_string() -> None:
    """沒填地址的列是空字串，不是 NULL（舊資料庫補上的欄位也是空字串）。"""
    assert m.MealStation(id="st-x").address == ""
    assert m.MealPoint(id="p-x").address == ""
    assert m.MealSupplier(id="s-x").address == ""


def test_old_database_gets_empty_address_until_reset(session: Session) -> None:
    """已部署的舊資料庫（T-133 前沒有 address）：啟動時補欄位、值是空字串；種子地址要管理員重置後才寫入。"""
    session.close()
    tables = ("meal_station", "meal_point", "meal_supplier")
    try:
        with engine.begin() as conn:
            for table in tables:
                conn.execute(text(f"ALTER TABLE {table} DROP COLUMN address"))
        assert {f"{t}.address" for t in tables} <= set(sync_schema())
        with engine.connect() as conn:
            stations = conn.execute(text("SELECT address FROM meal_station")).all()
        assert stations and all(row[0] == "" for row in stations)
        mr.seed(session)  # 啟動時的 seed()：已有帳號，不重新匯入
        session.expire_all()
        station = repo.get_station(session, "st-1")
        assert station is not None and station.address == ""
        mr.reset_demo(session, T0)  # 管理員按「重置示範資料」
        session.expire_all()
        station = repo.get_station(session, "st-1")
        assert station is not None and station.address == T115_ADDRESSES["st-1"]
    finally:
        sync_schema()
        mr.reset_demo(session, T0)


def test_read_routes_carry_address(client: TestClient, session: Session) -> None:
    """GET /stations、/points、/foods、/suppliers 的回應都有 address，值和種子一致。"""
    stations = client.get("/meal-relay/stations", headers={"X-Demo-User": "u-cit-1"}).json()
    assert {s["id"]: s["address"] for s in stations} == {k: T115_ADDRESSES[k] for k in ("st-1", "st-2")}
    points = client.get("/meal-relay/points", headers={"X-Demo-User": "u-sup-1"}).json()
    point_addresses = {k: v for k, v in T115_ADDRESSES.items() if k.startswith("p-")}
    assert {p["id"]: p["address"] for p in points} == point_addresses
    foods = client.get("/meal-relay/foods", headers={"X-Demo-User": "u-sup-1"}).json()
    f1 = next(f for f in foods if f["id"] == "f-1")
    assert f1["point_address"] == T115_ADDRESSES["p-1"]
    suppliers = client.get("/meal-relay/suppliers", headers={"X-Demo-User": "u-admin-1"}).json()
    assert {s["id"]: s["address"] for s in suppliers} == SIMULATED_SUPPLIER_ADDRESSES
