"""T-112 據點、QR 報到與自動派送驗收。"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from math import floor

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

import townpass_backend.features.meal_relay as mr
from townpass_backend.db import engine

NOW = datetime.now(UTC).replace(microsecond=0)
LATER = NOW + timedelta(days=30)


@pytest.fixture
def dispatch_session(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[Session]:
    monkeypatch.setattr(mr.service, "now", lambda: NOW)
    monkeypatch.setattr(mr, "now", lambda: NOW)
    with Session(engine) as session:
        mr.reset_demo(session, NOW)
        yield session


def __check_in(client: TestClient, account_id: str = "u-vol-1", station_id: str = "st-1"):
    with Session(engine) as session:
        station = mr.repo.get_station(session, station_id)
        assert station
        qr_text = mr.station_qr_text(station, NOW)
    return client.post(
        "/meal-relay/checkins", headers={"X-Demo-User": account_id}, json={"qr_text": qr_text}
    )


def __prepare_one_elder(session: Session, *, elder_id: str, allergens: list[str] | None = None) -> None:
    for elder in mr.repo.list_elders(session, include_merged=True):
        mr.repo.update_elder(
            session, elder, last_seen_at=NOW, last_meal_at=NOW,
            next_care_at=LATER, next_meal_at=LATER,
        )
    mr.repo.create_elder(
        session,
        mr.models.MealElder(
            id=elder_id, alias="測試長者", station_id="st-1", lat=25.0368, lng=121.5013,
            allergens=allergens or [], created_by="u-admin-1", created_at=NOW,
            next_care_at=LATER, next_meal_at=NOW,
        ),
    )


def __set_only_food(session: Session, food_id: str) -> mr.models.MealFood:
    for food in mr.repo.list_foods(session):
        mr.repo.update_food(session, food, closed=food.id != food_id)
    food = mr.repo.get_food(session, food_id)
    assert food
    return food


def test_v5_dispatch_skips_food_with_no_remaining_portions(
    client: TestClient, dispatch_session: Session
) -> None:
    __prepare_one_elder(dispatch_session, elder_id="e-v5")
    food = __set_only_food(dispatch_session, "f-1")
    mr.repo.update_food(dispatch_session, food, qty=0)

    response = __check_in(client)

    assert response.status_code == 200
    result = response.json()
    task = next(item for item in result["assignments"] if item["elder_id"] == "e-v5")
    assert task["needs_meal"] is True and task["claim_id"] is None
    assert not mr.repo.list_claims(dispatch_session)


def test_v6_dispatch_does_not_choose_food_with_elder_allergen(
    client: TestClient, dispatch_session: Session
) -> None:
    __prepare_one_elder(dispatch_session, elder_id="e-v6", allergens=["peanut"])
    __set_only_food(dispatch_session, "f-4")  # 含花生的食物

    response = __check_in(client)

    assert response.status_code == 200
    task = next(item for item in response.json()["assignments"] if item["elder_id"] == "e-v6")
    assert task["needs_meal"] is True and task["claim_id"] is None
    assert not mr.repo.list_claims(dispatch_session)


def test_m2_dispatch_deducts_remaining_food_between_assignments(
    client: TestClient, dispatch_session: Session
) -> None:
    __prepare_one_elder(dispatch_session, elder_id="e-m2-a")
    mr.repo.create_elder(
        dispatch_session,
        mr.models.MealElder(
            id="e-m2-b", alias="測試長者二", station_id="st-1", lat=25.037, lng=121.502,
            created_by="u-admin-1", created_at=NOW, next_care_at=LATER, next_meal_at=NOW,
        ),
    )
    food = __set_only_food(dispatch_session, "f-1")
    mr.repo.update_food(dispatch_session, food, qty=1)

    response = __check_in(client)

    assert response.status_code == 200
    assignments = [
        item for item in response.json()["assignments"] if item["elder_id"] in {"e-m2-a", "e-m2-b"}
    ]
    assert len(assignments) == 2
    assert sum(item["claim_id"] is not None for item in assignments) == 1
    assert sum(item["claim_id"] is None for item in assignments) == 1
    claims = mr.repo.list_claims(dispatch_session)
    assert len(claims) == 1 and claims[0].food_id == food.id


def test_v12_checkin_rejects_another_stations_qr(
    client: TestClient, dispatch_session: Session
) -> None:
    response = __check_in(client, account_id="u-vol-3", station_id="st-1")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "WRONG_STATION"


def test_v13_checkin_assigns_primary_volunteer_first_and_respects_limit(
    client: TestClient, dispatch_session: Session
) -> None:
    response = __check_in(client)

    assert response.status_code == 200
    result = response.json()
    elder_ids = [assignment["elder_id"] for assignment in result["assignments"]]
    assert elder_ids == ["e-4", "e-5", "e-10"]
    assert len(elder_ids) <= mr.settings().DISPATCH_LIMIT
    assert all(assignment["elder"]["primary_volunteer_id"] == "u-vol-1"
               for assignment in result["assignments"])
    for item in result["assignments"]:
        assigned_at = datetime.fromisoformat(item["assigned_at"])
        expires_at = datetime.fromisoformat(item["expires_at"])
        assert expires_at == assigned_at + timedelta(minutes=mr.settings().ASSIGNMENT_TTL_MIN)


def test_checkin_assignments_include_simulated_elder_address(
    client: TestClient, dispatch_session: Session
) -> None:
    response = __check_in(client)

    assert response.status_code == 200
    assignments = response.json()["assignments"]
    assert assignments
    assert all(item["elder"]["address"].endswith("（模擬）") for item in assignments)


def test_v14_does_not_assign_volunteer_one_elders_to_volunteer_two(
    client: TestClient, dispatch_session: Session
) -> None:
    first = __check_in(client, "u-vol-1")
    assert first.status_code == 200

    second = __check_in(client, "u-vol-2")

    assert second.status_code == 200
    assignments = second.json()["assignments"]
    assert all(item["elder"]["primary_volunteer_id"] != "u-vol-1" for item in assignments)
    held = {item["elder_id"] for item in first.json()["assignments"]}
    assert held.isdisjoint({item["elder_id"] for item in assignments})


def test_v15_repeated_checkin_returns_existing_assignments(
    client: TestClient, dispatch_session: Session
) -> None:
    first = __check_in(client)
    second = __check_in(client)

    assert first.status_code == second.status_code == 200
    assert first.json()["checkin"]["id"] == second.json()["checkin"]["id"]
    assert [a["id"] for a in first.json()["assignments"]] == [
        a["id"] for a in second.json()["assignments"]
    ]
    assert len(mr.repo.list_checkins(dispatch_session, volunteer_id="u-vol-1")) == 1


def test_v16_expired_assignment_is_released_and_claim_portion_returned(
    client: TestClient, dispatch_session: Session
) -> None:
    __prepare_one_elder(dispatch_session, elder_id="e-v16")
    food = __set_only_food(dispatch_session, "f-1")
    response = __check_in(client)
    assert response.status_code == 200
    task = next(item for item in response.json()["assignments"] if item["elder_id"] == "e-v16")
    assert task["claim_id"]
    assignment = mr.repo.get_assignment(dispatch_session, task["id"])
    assert assignment
    mr.repo.update_assignment(dispatch_session, assignment, expires_at=NOW - timedelta(seconds=1))

    mine = client.get("/meal-relay/assignments/mine", headers={"X-Demo-User": "u-vol-1"})

    assert mine.status_code == 200
    assert all(item["id"] != task["id"] for item in mine.json())
    dispatch_session.expire_all()
    released = mr.repo.get_assignment(dispatch_session, task["id"])
    claim = mr.repo.get_claim(dispatch_session, task["claim_id"])
    current_food = mr.repo.get_food(dispatch_session, food.id)
    assert released and released.status == "released"
    assert claim and claim.status == "cancelled"
    assert current_food and mr.food_remaining(dispatch_session, current_food) == current_food.qty


def test_v18_qr_old_or_tampered_is_expired_but_previous_window_is_accepted(
    client: TestClient, dispatch_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station = mr.repo.get_station(dispatch_session, "st-1")
    assert station
    step = mr.settings().QR_ROTATE_SEC
    start = floor(NOW.timestamp() / step) * step
    fixed = datetime.fromtimestamp(start + 5, UTC)
    monkeypatch.setattr(mr.service, "now", lambda: fixed)
    monkeypatch.setattr(mr, "now", lambda: fixed)
    stale = mr.station_qr_text(station, fixed - timedelta(seconds=step * 2))
    current = mr.station_qr_text(station, fixed)
    tampered = current[:-1] + ("0" if current[-1] != "0" else "1")

    old_response = client.post(
        "/meal-relay/checkins", headers={"X-Demo-User": "u-vol-1"}, json={"qr_text": stale}
    )
    tampered_response = client.post(
        "/meal-relay/checkins", headers={"X-Demo-User": "u-vol-1"}, json={"qr_text": tampered}
    )
    previous_window = datetime.fromtimestamp(start - 1, UTC)
    previous_qr = mr.station_qr_text(station, previous_window)
    previous_response = client.post(
        "/meal-relay/checkins",
        headers={"X-Demo-User": "u-vol-1"},
        json={"qr_text": previous_qr},
    )

    assert old_response.status_code == tampered_response.status_code == 409
    assert old_response.json()["detail"]["code"] == tampered_response.json()["detail"]["code"] == "QR_EXPIRED"
    assert previous_response.status_code == 200


def test_stations_endpoints_hide_checkin_code_and_include_rotating_qr(
    client: TestClient, dispatch_session: Session
) -> None:
    checkin = __check_in(client)
    assert checkin.status_code == 200
    stations = client.get("/meal-relay/stations", headers={"X-Demo-User": "u-cit-1"})
    mine = client.get("/meal-relay/stations/mine", headers={"X-Demo-User": "u-st-1"})

    assert stations.status_code == mine.status_code == 200
    assert stations.json() and all("checkin_code" not in row for row in stations.json())
    assert mine.json()["qr_text"].startswith("meal-relay:checkin:")
    assert mine.json()["qr_expires_at"]
    assert [row["id"] for row in mine.json()["checkins"]] == [checkin.json()["checkin"]["id"]]
