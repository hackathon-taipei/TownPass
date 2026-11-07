"""E2E 發現的回報缺陷：取餐狀態與照片存在性，失敗時不得產生副作用。"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_relay as mr

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4qkAAAAASUVORK5CYII="
VOLUNTEER = {"X-Demo-User": "u-vol-1"}


@pytest.fixture
def session(client: TestClient) -> Iterator[Session]:
    with Session(engine) as session:
        mr.reset_demo(session)
        yield session


def __task(client: TestClient) -> dict:
    station = client.get("/meal-relay/stations/mine", headers={"X-Demo-User": "u-st-1"}).json()
    response = client.post("/meal-relay/checkins", headers=VOLUNTEER, json={"qr_text": station["qr_text"]})
    assert response.status_code == 200
    return response.json()["assignments"][0]


def __photo(client: TestClient) -> str:
    response = client.post(
        "/meal-relay/images", headers=VOLUNTEER, json={"data_url": "data:image/png;base64," + PNG}
    )
    assert response.status_code == 200
    return response.json()["id"]


def __snapshot(session: Session, task: dict) -> dict:
    session.expire_all()
    elder = mr.repo.get_elder(session, task["elder_id"])
    claim = mr.repo.get_claim(session, task["claim_id"])
    assignment = mr.repo.get_assignment(session, task["id"])
    food = mr.repo.get_food(session, claim.food_id)
    assert elder and claim and assignment and food
    return {
        "elder": elder.model_dump(),
        "claim": claim.model_dump(),
        "assignment": assignment.model_dump(),
        "remaining": mr.food_remaining(session, food),
        "visits": [visit.model_dump() for visit in mr.repo.list_visits(session, elder_id=elder.id)],
    }


@pytest.mark.parametrize("result", ["seen", "returned", "left_at_door"])
def test_meal_report_requires_pickup_and_preserves_state_on_rejection(
    client: TestClient, session: Session, result: str
) -> None:
    task = __task(client)
    photo_id = __photo(client) if result == "left_at_door" else None
    before = __snapshot(session, task)
    response = client.post(
        "/meal-relay/visits",
        headers=VOLUNTEER,
        json={
            "elder_id": task["elder_id"],
            "assignment_id": task["id"],
            "claim_id": task["claim_id"],
            "kind": "meal",
            "result": result,
            "photo_image_id": photo_id,
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "INVALID_STATE"
    assert __snapshot(session, task) == before


def test_left_at_door_rejects_missing_image_without_changing_state(
    client: TestClient, session: Session
) -> None:
    task = __task(client)
    pickup = client.post(f"/meal-relay/claims/{task['claim_id']}/pickup", headers=VOLUNTEER)
    assert pickup.status_code == 200
    before = __snapshot(session, task)
    response = client.post(
        "/meal-relay/visits",
        headers=VOLUNTEER,
        json={
            "elder_id": task["elder_id"],
            "claim_id": task["claim_id"],
            "kind": "meal",
            "result": "left_at_door",
            "photo_image_id": "img-missing-e2e",
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "NOT_FOUND"
    assert __snapshot(session, task) == before


def test_left_at_door_after_pickup_accepts_uploaded_image(client: TestClient, session: Session) -> None:
    task = __task(client)
    assert client.post(f"/meal-relay/claims/{task['claim_id']}/pickup", headers=VOLUNTEER).status_code == 200
    photo_id = __photo(client)
    before_seen = task["elder"]["last_seen_at"]
    response = client.post(
        "/meal-relay/visits",
        headers=VOLUNTEER,
        json={
            "elder_id": task["elder_id"],
            "claim_id": task["claim_id"],
            "kind": "meal",
            "result": "left_at_door",
            "photo_image_id": photo_id,
        },
    )
    assert response.status_code == 200
    assert response.json()["photo_image_id"] == photo_id
    assert client.get(response.json()["photo_url"]).status_code == 200
    after = __snapshot(session, task)
    assert after["claim"]["status"] == "done"
    assert after["assignment"]["status"] == "done"
    # 放門口只能更新送餐，不能把這次拜訪算成「見到本人」。
    roster = client.get("/meal-relay/elders", headers={"X-Demo-User": "u-admin-1"}).json()
    elder = next(row for row in roster if row["id"] == task["elder_id"])
    assert elder["last_seen_at"] == before_seen
    assert elder["last_meal_at"] is not None
