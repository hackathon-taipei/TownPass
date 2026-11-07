"""T-111：管理員長者名冊與志工拜訪回報。"""

from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import models, repo


@pytest.fixture
def session(client: TestClient) -> Iterator[Session]:
    with Session(engine) as session:
        mr.reset_demo(session)
        yield session


def __assignment(session: Session, elder_id: str, volunteer_id: str = "u-vol-1", claim_id: str | None = None):
    at = mr.now()
    row = models.MealAssignment(
        id=mr.new_id("as"),
        checkin_id="ck-test",
        volunteer_id=volunteer_id,
        elder_id=elder_id,
        station_id="st-1",
        needs_meal=claim_id is not None,
        needs_care=True,
        claim_id=claim_id,
        status="assigned",
        assigned_at=at - timedelta(minutes=1),
        expires_at=at + timedelta(minutes=20),
    )
    return repo.create_assignment(session, row)


def __headers(account_id: str) -> dict[str, str]:
    return {"X-Demo-User": account_id}


def test_v19_volunteer_cannot_list_elder_roster(client: TestClient, session: Session) -> None:
    response = client.get("/meal-relay/elders", headers=__headers("u-vol-1"))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN_ROLE"


def test_v20_visit_for_elder_without_own_assigned_task_is_not_owner(
    client: TestClient, session: Session
) -> None:
    __assignment(session, "e-1", volunteer_id="u-vol-1")
    response = client.post(
        "/meal-relay/visits",
        headers=__headers("u-vol-2"),
        json={"elder_id": "e-1", "kind": "care", "result": "seen"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "NOT_OWNER"


def test_v10_seen_visit_updates_last_seen_alert_and_primary_volunteer(
    client: TestClient, session: Session
) -> None:
    elder = repo.get_elder(session, "e-2")
    assert elder
    repo.update_elder(
        session,
        elder,
        last_meal_at=mr.now(),
        next_care_at=mr.now() - timedelta(minutes=1),
        next_meal_at=mr.now() + timedelta(days=2),
    )
    claim = repo.create_claim(
        session,
        models.MealClaim(
            id=mr.new_id("c"),
            food_id="f-1",
            elder_id=elder.id,
            qty=1,
            method="delivery",
            status="delivering",
            requested_by="u-vol-1",
            volunteer_id="u-vol-1",
        ),
    )
    assignment = __assignment(session, elder.id, claim_id=claim.id)

    response = client.post(
        "/meal-relay/visits",
        headers=__headers("u-vol-1"),
        json={"elder_id": elder.id, "kind": "meal", "result": "seen", "claim_id": claim.id},
    )

    assert response.status_code == 200
    visit = response.json()
    assert visit["result"] == "seen" and visit["assignment_id"] == assignment.id
    assert visit["visited_at"]
    session.expire_all()
    updated = repo.get_elder(session, elder.id)
    task = repo.get_assignment(session, assignment.id)
    updated_claim = repo.get_claim(session, claim.id)
    assert updated and updated.last_seen_at and updated.primary_volunteer_id == "u-vol-1"
    assert updated.next_care_at is None and updated.next_meal_at is None and updated.last_meal_at
    assert task and task.status == "done"
    assert updated_claim and updated_claim.status == "done"
    elder_response = client.get("/meal-relay/elders", headers=__headers("u-admin-1"))
    result = next(row for row in elder_response.json() if row["id"] == elder.id)
    assert not result["care_due"] and not result["alert"]


def test_v11_fresh_food_cannot_be_left_at_door(client: TestClient, session: Session) -> None:
    claim = repo.create_claim(
        session,
        models.MealClaim(
            id=mr.new_id("c"),
            food_id="f-3",
            elder_id="e-1",
            qty=1,
            method="delivery",
            status="claimed",
            requested_by="u-vol-1",
            volunteer_id="u-vol-1",
        ),
    )
    __assignment(session, "e-1", claim_id=claim.id)

    response = client.post(
        "/meal-relay/visits",
        headers=__headers("u-vol-1"),
        json={
            "elder_id": "e-1",
            "kind": "meal",
            "result": "left_at_door",
            "claim_id": claim.id,
            "photo_image_id": "img-test",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "FRESH_CANNOT_LEAVE"


def test_left_at_door_requires_photo(client: TestClient, session: Session) -> None:
    __assignment(session, "e-1")
    response = client.post(
        "/meal-relay/visits",
        headers=__headers("u-vol-1"),
        json={"elder_id": "e-1", "kind": "meal", "result": "left_at_door"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "PHOTO_REQUIRED"


def test_returned_visit_cancels_claim(client: TestClient, session: Session) -> None:
    claim = repo.create_claim(
        session,
        models.MealClaim(
            id=mr.new_id("c"),
            food_id="f-1",
            elder_id="e-1",
            qty=1,
            method="delivery",
            status="delivering",
            requested_by="u-vol-1",
            volunteer_id="u-vol-1",
        ),
    )
    __assignment(session, "e-1", claim_id=claim.id)
    response = client.post(
        "/meal-relay/visits",
        headers=__headers("u-vol-1"),
        json={"elder_id": "e-1", "kind": "meal", "result": "returned", "claim_id": claim.id},
    )
    assert response.status_code == 200
    session.expire_all()
    updated = repo.get_claim(session, claim.id)
    assert updated and updated.status == "cancelled" and updated.cancel_reason == "returned"


def test_non_admin_cannot_create_elder(client: TestClient, session: Session) -> None:
    response = client.post(
        "/meal-relay/elders",
        headers=__headers("u-vol-1"),
        json={"alias": "測試長者", "location": {"lat": 25.03, "lng": 121.5}, "station_id": "st-1"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN_ROLE"


def test_admin_can_create_and_update_elder(client: TestClient, session: Session) -> None:
    created = client.post(
        "/meal-relay/elders",
        headers=__headers("u-admin-1"),
        json={
            "alias": "測試長者",
            "location": {"lat": 25.03, "lng": 121.5},
            "station_id": "st-1",
            "allergens": ["peanut"],
        },
    )
    assert created.status_code == 200
    assert created.json()["created_by"] == "u-admin-1"
    assert created.json()["alias"] == "測試長者"

    updated = client.patch(
        f"/meal-relay/elders/{created.json()['id']}",
        headers=__headers("u-admin-1"),
        json={"alias": "更新代號", "allergens": []},
    )
    assert updated.status_code == 200
    assert updated.json()["alias"] == "更新代號" and updated.json()["allergens"] == []


def test_admin_roster_hides_merged_elders(client: TestClient, session: Session) -> None:
    elder = repo.get_elder(session, "e-1")
    assert elder
    repo.update_elder(session, elder, merged_into="e-retired")
    response = client.get("/meal-relay/elders", headers=__headers("u-admin-1"))
    assert response.status_code == 200
    assert all(row["id"] != elder.id for row in response.json())


# ---------------------------------------------------------------- T-125：長者地址（只能是模擬資料，ADR-027）

SEED_ADDRESS = "臺北市萬華區西園路一段 999 號（模擬）"


def test_seed_elders_have_simulated_address(client: TestClient, session: Session) -> None:
    elders = repo.list_elders(session)
    assert elders
    assert all(e.address.endswith("（模擬）") for e in elders)


def test_admin_can_create_and_update_elder_address(client: TestClient, session: Session) -> None:
    created = client.post(
        "/meal-relay/elders",
        headers=__headers("u-admin-1"),
        json={
            "alias": "測試長者",
            "address": "臺北市萬華區西園路一段 0 號（模擬）",
            "location": {"lat": 25.03, "lng": 121.5},
            "station_id": "st-1",
        },
    )
    assert created.status_code == 200
    elder_id = created.json()["id"]
    assert created.json()["address"] == "臺北市萬華區西園路一段 0 號（模擬）"

    updated = client.patch(
        f"/meal-relay/elders/{elder_id}",
        headers=__headers("u-admin-1"),
        json={"address": "臺北市萬華區康定路 0 號（模擬）"},
    )
    assert updated.status_code == 200
    assert updated.json()["address"] == "臺北市萬華區康定路 0 號（模擬）"
    assert updated.json()["alias"] == "測試長者"

    cleared = client.patch(
        f"/meal-relay/elders/{elder_id}", headers=__headers("u-admin-1"), json={"address": None}
    )
    assert cleared.status_code == 200 and cleared.json()["address"] == ""

    roster = client.get("/meal-relay/elders", headers=__headers("u-admin-1")).json()
    assert next(row for row in roster if row["id"] == "e-1")["address"] == SEED_ADDRESS


def test_create_elder_without_address_defaults_to_empty(client: TestClient, session: Session) -> None:
    created = client.post(
        "/meal-relay/elders",
        headers=__headers("u-admin-1"),
        json={"alias": "測試長者", "location": {"lat": 25.03, "lng": 121.5}, "station_id": "st-1"},
    )
    assert created.status_code == 200 and created.json()["address"] == ""


def test_non_admin_cannot_update_elder_address(client: TestClient, session: Session) -> None:
    for account_id in ("u-vol-1", "u-st-1", "u-sup-1", "u-cit-1"):
        response = client.patch(
            "/meal-relay/elders/e-1",
            headers=__headers(account_id),
            json={"address": "臺北市萬華區西園路一段 0 號（模擬）"},
        )
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "FORBIDDEN_ROLE"
    session.expire_all()
    elder = repo.get_elder(session, "e-1")
    assert elder and elder.address == SEED_ADDRESS


def test_elder_address_over_120_chars_is_validation_error(client: TestClient, session: Session) -> None:
    long_address = "臺" * 121
    created = client.post(
        "/meal-relay/elders",
        headers=__headers("u-admin-1"),
        json={
            "alias": "測試長者",
            "address": long_address,
            "location": {"lat": 25.03, "lng": 121.5},
            "station_id": "st-1",
        },
    )
    assert created.status_code == 422
    assert created.json()["detail"]["code"] == "VALIDATION_ERROR"
    updated = client.patch(
        "/meal-relay/elders/e-1", headers=__headers("u-admin-1"), json={"address": long_address}
    )
    assert updated.status_code == 422
    assert updated.json()["detail"]["code"] == "VALIDATION_ERROR"
    ok = client.patch(
        "/meal-relay/elders/e-1", headers=__headers("u-admin-1"), json={"address": "臺" * 120}
    )
    assert ok.status_code == 200


def test_volunteer_sees_address_only_while_assignment_is_assigned(
    client: TestClient, session: Session
) -> None:
    assignment = __assignment(session, "e-1", volunteer_id="u-vol-1")
    mine = client.get("/meal-relay/assignments/mine", headers=__headers("u-vol-1"))
    assert mine.status_code == 200
    task = next(item for item in mine.json() if item["id"] == assignment.id)
    assert task["elder"]["address"] == SEED_ADDRESS

    other = client.get("/meal-relay/assignments/mine", headers=__headers("u-vol-2"))
    assert SEED_ADDRESS not in other.text

    visit = client.post(
        "/meal-relay/visits",
        headers=__headers("u-vol-1"),
        json={"elder_id": "e-1", "kind": "care", "result": "seen"},
    )
    assert visit.status_code == 200
    after = client.get("/meal-relay/assignments/mine", headers=__headers("u-vol-1"))
    assert after.status_code == 200
    assert all(item["elder_id"] != "e-1" for item in after.json())
    assert SEED_ADDRESS not in after.text

