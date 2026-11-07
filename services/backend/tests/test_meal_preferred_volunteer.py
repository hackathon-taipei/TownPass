"""v2.7（ADR-032）：每位長者、志工都屬於一個據點；管理員指定志工；M9 最常照顧的志工；M16 派送順序。"""

import json
import shutil
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

import townpass_backend.features.meal_relay as mr
from townpass_backend.db import engine
from townpass_backend.features.meal_relay import models, repo

NOW = datetime.now(UTC).replace(microsecond=0)
LATER = NOW + timedelta(days=30)
ADMIN = {"X-Demo-User": "u-admin-1"}
NEW_ELDER = {"alias": "測試長者", "location": {"lat": 25.03, "lng": 121.5}, "station_id": "st-1"}


@pytest.fixture
def session(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[Session]:
    monkeypatch.setattr(mr.service, "now", lambda: NOW)
    monkeypatch.setattr(mr, "now", lambda: NOW)
    with Session(engine) as session:
        mr.reset_demo(session, NOW)
        yield session


def __headers(account_id: str) -> dict[str, str]:
    return {"X-Demo-User": account_id}


def __code(response) -> str:
    return response.json()["detail"]["code"]


# ---------------------------------------------------------------- 每位長者、志工都屬於一個據點


def test_seed_every_elder_and_volunteer_belongs_to_an_existing_station(session: Session) -> None:
    stations = {s.id for s in repo.list_stations(session)}
    elders = repo.list_elders(session, include_merged=True)
    assert elders and all(e.station_id in stations for e in elders)
    for role in ("volunteer", "station"):
        accounts = repo.list_accounts(session, role=role)
        assert accounts and all(a.station_id in stations for a in accounts)


def test_seed_preferred_volunteers_are_same_station_volunteers(session: Session) -> None:
    preferred = {e.id: e.preferred_volunteer_id for e in repo.list_elders(session) if e.preferred_volunteer_id}
    assert preferred == {"e-3": "u-vol-2", "e-8": "u-vol-1", "e-11": "u-vol-3"}
    for elder_id, volunteer_id in preferred.items():
        elder, volunteer = repo.get_elder(session, elder_id), repo.get_account(session, volunteer_id)
        assert elder and volunteer and volunteer.role == "volunteer" and volunteer.station_id == elder.station_id
    e8 = repo.get_elder(session, "e-8")
    assert e8 and e8.primary_volunteer_id == "u-vol-2"  # Demo：指定志工 u-vol-1 蓋過最常照顧的 u-vol-2


@pytest.mark.parametrize(
    ("filename", "record_id", "field", "value"),
    [
        ("elders.json", "e-1", "station_id", "st-missing"),
        ("elders.json", "e-1", "station_id", ""),
        ("accounts.json", "u-vol-1", "station_id", None),
        ("elders.json", "e-1", "preferred_volunteer_id", "u-vol-3"),  # 別的據點的志工
        ("elders.json", "e-1", "preferred_volunteer_id", "u-st-1"),  # 不是志工
    ],
)
def test_import_seed_rejects_missing_station_or_invalid_preferred(
    session: Session, tmp_path: Path, filename: str, record_id: str, field: str, value: str | None
) -> None:
    folder = tmp_path / "seed"
    shutil.copytree(mr.SEED_DIR, folder)
    records = json.loads((folder / filename).read_text(encoding="utf-8"))
    next(r for r in records if r["id"] == record_id)[field] = value
    (folder / filename).write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    repo.clear_all(session)

    with pytest.raises(ValueError, match="種子資料錯誤"):
        mr.import_seed(session, NOW, folder)
    assert not repo.has_any_account(session)  # 不寫進資料庫


def test_create_elder_requires_existing_station(client: TestClient, session: Session) -> None:
    body = {k: v for k, v in NEW_ELDER.items() if k != "station_id"}
    missing = client.post("/meal-relay/elders", headers=ADMIN, json=body)
    unknown = client.post("/meal-relay/elders", headers=ADMIN, json={**body, "station_id": "st-missing"})
    empty = client.post("/meal-relay/elders", headers=ADMIN, json={**body, "station_id": ""})
    assert missing.status_code == 422 and __code(missing) == "VALIDATION_ERROR"
    assert unknown.status_code == empty.status_code == 404
    assert __code(unknown) == __code(empty) == "NOT_FOUND"


def test_update_elder_cannot_clear_or_point_station_to_missing(client: TestClient, session: Session) -> None:
    cleared = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"station_id": None})
    unknown = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"station_id": "st-missing"})
    assert cleared.status_code == 422 and __code(cleared) == "VALIDATION_ERROR"
    assert unknown.status_code == 404 and __code(unknown) == "NOT_FOUND"


# ---------------------------------------------------------------- 指定志工（建立、修改、權限）


def test_admin_creates_elder_with_same_station_preferred_volunteer(client: TestClient, session: Session) -> None:
    created = client.post("/meal-relay/elders", headers=ADMIN, json={**NEW_ELDER, "preferred_volunteer_id": "u-vol-2"})
    plain = client.post("/meal-relay/elders", headers=ADMIN, json=NEW_ELDER)

    assert created.status_code == plain.status_code == 200
    assert created.json()["preferred_volunteer_id"] == "u-vol-2"
    assert plain.json()["preferred_volunteer_id"] is None
    row = repo.get_elder(session, created.json()["id"])
    assert row and row.preferred_volunteer_id == "u-vol-2"


@pytest.mark.parametrize(
    ("volunteer_id", "status", "code"),
    [
        ("u-vol-3", 409, "VOLUNTEER_NOT_IN_STATION"),  # st-2 的志工
        ("u-st-1", 404, "NOT_FOUND"),  # 據點帳號，不是志工
        ("u-admin-1", 404, "NOT_FOUND"),
        ("u-nobody", 404, "NOT_FOUND"),
        ("", 422, "VALIDATION_ERROR"),
    ],
)
def test_preferred_volunteer_must_be_volunteer_of_same_station(
    client: TestClient, session: Session, volunteer_id: str, status: int, code: str
) -> None:
    created = client.post("/meal-relay/elders", headers=ADMIN, json={**NEW_ELDER, "preferred_volunteer_id": volunteer_id})
    updated = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"preferred_volunteer_id": volunteer_id})

    assert created.status_code == updated.status_code == status
    assert __code(created) == __code(updated) == code
    session.expire_all()
    e1 = repo.get_elder(session, "e-1")
    assert e1 and e1.preferred_volunteer_id is None


def test_update_preferred_volunteer_set_and_clear(client: TestClient, session: Session) -> None:
    set_ = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"preferred_volunteer_id": "u-vol-1"})
    other = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"alias": "王阿嬤二"})
    assert set_.status_code == other.status_code == 200
    assert set_.json()["preferred_volunteer_id"] == other.json()["preferred_volunteer_id"] == "u-vol-1"

    cleared = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"preferred_volunteer_id": None})
    assert cleared.status_code == 200 and cleared.json()["preferred_volunteer_id"] is None


def test_changing_station_requires_preferred_volunteer_of_new_station(client: TestClient, session: Session) -> None:
    # e-3 在 st-1，指定 u-vol-2；改到 st-2 卻沒換指定志工 → 409，資料不變
    stale = client.patch("/meal-relay/elders/e-3", headers=ADMIN, json={"station_id": "st-2"})
    assert stale.status_code == 409 and __code(stale) == "VOLUNTEER_NOT_IN_STATION"
    session.expire_all()
    e3 = repo.get_elder(session, "e-3")
    assert e3 and e3.station_id == "st-1" and e3.preferred_volunteer_id == "u-vol-2"

    cleared = client.patch("/meal-relay/elders/e-3", headers=ADMIN, json={"station_id": "st-2", "preferred_volunteer_id": None})
    moved = client.patch("/meal-relay/elders/e-1", headers=ADMIN, json={"station_id": "st-2", "preferred_volunteer_id": "u-vol-3"})
    assert cleared.status_code == moved.status_code == 200
    assert cleared.json()["station_id"] == "st-2" and cleared.json()["preferred_volunteer_id"] is None
    assert moved.json()["station_id"] == "st-2" and moved.json()["preferred_volunteer_id"] == "u-vol-3"


@pytest.mark.parametrize("account_id", ["u-vol-1", "u-st-1", "u-sup-1", "u-cit-1"])
def test_only_admin_sets_preferred_volunteer(client: TestClient, session: Session, account_id: str) -> None:
    created = client.post(
        "/meal-relay/elders", headers=__headers(account_id), json={**NEW_ELDER, "preferred_volunteer_id": "u-vol-1"}
    )
    updated = client.patch("/meal-relay/elders/e-1", headers=__headers(account_id), json={"preferred_volunteer_id": "u-vol-1"})
    assert created.status_code == updated.status_code == 403
    assert __code(created) == __code(updated) == "FORBIDDEN_ROLE"


# ---------------------------------------------------------------- GET /volunteers（admin）


def test_admin_lists_volunteers_per_station(client: TestClient, session: Session) -> None:
    every = client.get("/meal-relay/volunteers", headers=ADMIN)
    st1 = client.get("/meal-relay/volunteers", headers=ADMIN, params={"station_id": "st-1"})
    unknown = client.get("/meal-relay/volunteers", headers=ADMIN, params={"station_id": "st-missing"})

    assert every.status_code == st1.status_code == 200
    assert [v["id"] for v in every.json()] == ["u-vol-1", "u-vol-2", "u-vol-3"]
    assert [v["id"] for v in st1.json()] == ["u-vol-1", "u-vol-2"]
    assert all(set(v) == {"id", "name", "station_id"} for v in every.json())  # 只回 id、名稱、據點
    assert unknown.status_code == 404 and __code(unknown) == "NOT_FOUND"


@pytest.mark.parametrize("account_id", ["u-vol-1", "u-st-1", "u-sup-1", "u-cit-1", "u-unknown"])
def test_non_admin_cannot_list_volunteers(client: TestClient, session: Session, account_id: str) -> None:
    response = client.get("/meal-relay/volunteers", headers=__headers(account_id))
    assert response.status_code == 403 and __code(response) == "FORBIDDEN_ROLE"
    assert client.get("/meal-relay/volunteers").status_code == 401


# ---------------------------------------------------------------- M9 最常照顧的志工


def __visit(volunteer_id: str, minutes_ago: int, result: str = "seen", elder_id: str = "e-x") -> models.MealVisit:
    return models.MealVisit(
        id=mr.new_id("vi"), elder_id=elder_id, volunteer_id=volunteer_id, kind="care", result=result,
        visited_at=NOW - timedelta(minutes=minutes_ago),
    )


def test_most_frequent_volunteer_counts_care_results_and_breaks_ties_by_latest() -> None:
    assert mr.most_frequent_volunteer([]) is None
    assert mr.most_frequent_volunteer([__visit("u-vol-1", 5, "returned")]) is None  # 沒照顧到不算
    most = [__visit("u-vol-1", 300), __visit("u-vol-1", 200, "left_at_door"), __visit("u-vol-2", 10)]
    assert mr.most_frequent_volunteer(most) == "u-vol-1"
    tie = [__visit("u-vol-1", 300), __visit("u-vol-2", 100), __visit("u-vol-1", 50, "returned")]
    assert mr.most_frequent_volunteer(tie) == "u-vol-2"  # 同次數 → 最近回報


def test_effective_volunteer_prefers_admin_choice() -> None:
    elder = models.MealElder(id="e-x", primary_volunteer_id="u-vol-1")
    assert mr.effective_volunteer_id(elder) == "u-vol-1"
    elder.preferred_volunteer_id = "u-vol-2"
    assert mr.effective_volunteer_id(elder) == "u-vol-2"
    assert mr.effective_volunteer_id(models.MealElder(id="e-y")) is None


def __assignment(session: Session, elder_id: str, volunteer_id: str) -> models.MealAssignment:
    return repo.create_assignment(
        session,
        models.MealAssignment(
            id=mr.new_id("as"), checkin_id="ck-test", volunteer_id=volunteer_id, elder_id=elder_id,
            station_id="st-1", needs_care=True, status="assigned",
            assigned_at=NOW - timedelta(minutes=1), expires_at=NOW + timedelta(minutes=20),
        ),
    )


def __report_seen(client: TestClient, session: Session, elder_id: str, volunteer_id: str):
    __assignment(session, elder_id, volunteer_id)
    return client.post(
        "/meal-relay/visits", headers=__headers(volunteer_id),
        json={"elder_id": elder_id, "kind": "care", "result": "seen"},
    )


def test_m9_visit_report_stores_most_frequent_volunteer_not_last_reporter(
    client: TestClient, session: Session
) -> None:
    for minutes in (300, 200):
        repo.create_visit(session, __visit("u-vol-2", minutes, elder_id="e-2"))

    response = __report_seen(client, session, "e-2", "u-vol-1")

    assert response.status_code == 200
    session.expire_all()
    e2 = repo.get_elder(session, "e-2")
    assert e2 and e2.primary_volunteer_id == "u-vol-2"  # 2 次 > 1 次，最後回報的 u-vol-1 不會取代
    assert e2.last_seen_at  # 其他 M9 效果不變


def test_m9_tie_goes_to_latest_reporter(client: TestClient, session: Session) -> None:
    repo.create_visit(session, __visit("u-vol-2", 300, elder_id="e-2"))

    response = __report_seen(client, session, "e-2", "u-vol-1")

    assert response.status_code == 200
    session.expire_all()
    e2 = repo.get_elder(session, "e-2")
    assert e2 and e2.primary_volunteer_id == "u-vol-1"


def test_m9_report_does_not_touch_preferred_volunteer(client: TestClient, session: Session) -> None:
    e3 = repo.get_elder(session, "e-3")
    assert e3 and e3.preferred_volunteer_id == "u-vol-2"

    response = __report_seen(client, session, "e-3", "u-vol-1")

    assert response.status_code == 200
    session.expire_all()
    e3 = repo.get_elder(session, "e-3")
    assert e3 and e3.primary_volunteer_id == "u-vol-1" and e3.preferred_volunteer_id == "u-vol-2"


# ---------------------------------------------------------------- M16 派送順序


def __check_in(client: TestClient, account_id: str):
    with Session(engine) as s:
        station = repo.get_station(s, "st-1")
        assert station
        qr_text = mr.station_qr_text(station, NOW)
    return client.post("/meal-relay/checkins", headers=__headers(account_id), json={"qr_text": qr_text})


def __only_test_elders(session: Session, **elders: dict) -> None:
    """種子長者都改成不需要服務，只留下測試長者（同一個位置，排序只看分組與 last_seen_at）。"""
    for elder in repo.list_elders(session, include_merged=True):
        repo.update_elder(session, elder, last_seen_at=NOW, last_meal_at=NOW, next_care_at=LATER, next_meal_at=LATER)
    for elder_id, fields in elders.items():
        values = {"last_seen_at": NOW - timedelta(days=3), **fields}
        repo.create_elder(
            session,
            models.MealElder(
                id=elder_id, alias=elder_id, station_id="st-1", lat=25.0368, lng=121.5013, created_by="u-admin-1",
                created_at=NOW, last_meal_at=NOW, next_meal_at=LATER, **values,
            ),
        )


def __assigned(response) -> list[str]:
    assert response.status_code == 200
    return [a["elder_id"] for a in response.json()["assignments"]]


def test_m16_preferred_volunteer_beats_most_frequent(client: TestClient, session: Session) -> None:
    __only_test_elders(
        session,
        **{
            "e-pref": {"primary_volunteer_id": "u-vol-1", "preferred_volunteer_id": "u-vol-2",
                       "last_seen_at": NOW - timedelta(days=2)},
            "e-none": {"last_seen_at": NOW - timedelta(days=5)},
        },
    )

    # u-vol-2 是 e-pref 的指定志工 → ①，排在較久未見但沒有負責志工的 e-none（②）前面
    assert __assigned(__check_in(client, "u-vol-2")) == ["e-pref", "e-none"]


def test_m16_most_frequent_volunteer_is_not_first_when_someone_else_is_preferred(
    client: TestClient, session: Session
) -> None:
    __only_test_elders(
        session,
        **{
            "e-pref": {"primary_volunteer_id": "u-vol-1", "preferred_volunteer_id": "u-vol-2",
                       "last_seen_at": NOW - timedelta(days=5)},
            "e-none": {"last_seen_at": NOW - timedelta(days=3)},
            "e-mine": {"primary_volunteer_id": "u-vol-1", "last_seen_at": NOW - timedelta(days=2)},
        },
    )

    # u-vol-1：e-mine ①、e-none ②、e-pref ③（指定的 u-vol-2 今天沒報到，才輪到別人）
    assert __assigned(__check_in(client, "u-vol-1")) == ["e-mine", "e-none", "e-pref"]


def test_m16_preferred_volunteer_checked_in_today_keeps_the_elder(client: TestClient, session: Session) -> None:
    __only_test_elders(
        session,
        **{
            "e-pref": {"primary_volunteer_id": "u-vol-1", "preferred_volunteer_id": "u-vol-2"},
            "e-none": {},
        },
    )
    repo.create_checkin(
        session, models.MealCheckin(id="ck-vol-2", volunteer_id="u-vol-2", station_id="st-1", checked_in_at=NOW)
    )

    # u-vol-1 是最常照顧的志工，但指定的 u-vol-2 今天已報到 → 留給 u-vol-2
    assert __assigned(__check_in(client, "u-vol-1")) == ["e-none"]


def test_m16_uses_most_frequent_volunteer_computed_from_visits(client: TestClient, session: Session) -> None:
    __only_test_elders(session, **{"e-freq": {}, "e-none": {"last_seen_at": NOW - timedelta(days=9)}})
    for minutes in (3000, 2000):
        repo.create_visit(session, __visit("u-vol-2", minutes, elder_id="e-freq"))
    assert __report_seen(client, session, "e-freq", "u-vol-1").status_code == 200  # 1 次 < u-vol-2 的 2 次
    session.expire_all()
    elder = repo.get_elder(session, "e-freq")
    assert elder and elder.primary_volunteer_id == "u-vol-2"
    repo.update_elder(session, elder, next_care_at=NOW - timedelta(minutes=1))  # 又需要關懷

    assert __assigned(__check_in(client, "u-vol-2")) == ["e-freq", "e-none"]


def test_m16_volunteer_never_gets_an_elder_list(client: TestClient, session: Session) -> None:
    """M13／ADR-026：指定志工不會讓志工看到名冊或志工清單。"""
    assert client.get("/meal-relay/elders", headers=__headers("u-vol-2")).status_code == 403
    assert client.get("/meal-relay/volunteers", headers=__headers("u-vol-2")).status_code == 403
