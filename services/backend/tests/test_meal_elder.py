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

