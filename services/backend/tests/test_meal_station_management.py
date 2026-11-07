"""T-140 據點管理：持久化、權限、輸入驗證與刪除關聯保護。"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

import townpass_backend.features.meal_relay as mr
from townpass_backend.db import engine

ADMIN = {"X-Demo-User": "u-admin-1"}
BASE = "/meal-relay/stations"
BODY = {"name": "  測試據點  ", "address": "  公共廣場（模擬）  ", "location": {"lat": 25.03, "lng": 121.5}}


@pytest.fixture(autouse=True)
def reset_data(client: TestClient):
    with Session(engine) as session:
        mr.reset_demo(session)
    yield
    with Session(engine) as session:
        mr.reset_demo(session)


def test_station_crud_persists_and_preserves_secret(client: TestClient):
    created = client.post(BASE, headers=ADMIN, json=BODY)
    assert created.status_code == 200
    station = created.json()
    assert station["name"] == "測試據點" and station["address"] == "公共廣場（模擬）"
    assert station["source"] == "管理員新增（模擬）"
    assert "checkin_code" not in station
    other = client.post(BASE, headers=ADMIN, json=BODY).json()
    assert other["id"] != station["id"]
    with Session(engine) as session:
        original = mr.repo.get_station(session, station["id"])
        original_code = original.checkin_code
        assert original_code and mr.repo.get_station(session, other["id"]).checkin_code != original_code
    updated = client.patch(f"{BASE}/{station['id']}", headers=ADMIN, json={
        "name": " 新據點 ", "address": " ", "location": {"lat": 25.1, "lng": 121.6},
    })
    assert updated.status_code == 200
    assert updated.json() == {**station, "name": "新據點", "address": "", "location": {"lat": 25.1, "lng": 121.6}}
    with Session(engine) as session:
        assert mr.repo.get_station(session, station["id"]).checkin_code == original_code
    unchanged = client.patch(f"{BASE}/{station['id']}", headers=ADMIN, json={})
    assert unchanged.json() == updated.json()
    listed = client.get(BASE, headers=ADMIN).json()
    assert updated.json() in listed and all("checkin_code" not in row for row in listed)
    deleted = client.delete(f"{BASE}/{station['id']}", headers=ADMIN)
    assert deleted.status_code == 204 and deleted.content == b""
    assert station["id"] not in [row["id"] for row in client.get(BASE, headers=ADMIN).json()]
    with Session(engine) as session:
        assert mr.repo.get_station(session, station["id"]) is None


@pytest.mark.parametrize("role_id", ["u-vol-1", "u-st-1", "u-sup-1", "u-cit-1"])
@pytest.mark.parametrize("method", ["post", "patch", "delete"])
def test_only_admin_can_write_stations(client: TestClient, role_id: str, method: str):
    path = BASE if method == "post" else f"{BASE}/st-1"
    kwargs = {"json": BODY} if method != "delete" else {}
    response = getattr(client, method)(path, headers={"X-Demo-User": role_id}, **kwargs)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN_ROLE"


@pytest.mark.parametrize("method", ["post", "patch", "delete"])
def test_station_write_requires_login(client: TestClient, method: str):
    path = BASE if method == "post" else f"{BASE}/st-1"
    kwargs = {"json": BODY} if method != "delete" else {}
    assert getattr(client, method)(path, **kwargs).status_code == 401


@pytest.mark.parametrize("patch", [
    {"name": " "}, {"name": "x" * 101}, {"name": None}, {"address": "x" * 121},
    {"address": None}, {"location": None}, {"location": {"lat": 91, "lng": 121}},
    {"location": {"lat": 25, "lng": -181}}, {"location": {"lat": 25}},
    {"location": {"lat": 25, "lng": 121, "extra": 1}},
    {"checkin_code": "forged"}, {"source": "forged"}, {"id": "forged"},
])
@pytest.mark.parametrize("method", ["post", "patch"])
def test_station_write_rejects_invalid_fields(client: TestClient, patch: dict, method: str):
    body = {**BODY, **patch} if method == "post" else patch
    path = BASE if method == "post" else f"{BASE}/st-1"
    response = getattr(client, method)(path, headers=ADMIN, json=body)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_ERROR"


def test_station_create_requires_name_location_and_allows_omitted_address(client: TestClient):
    for body in ({}, {"name": "據點"}, {"location": BODY["location"]}):
        assert client.post(BASE, headers=ADMIN, json=body).status_code == 422
    response = client.post(BASE, headers=ADMIN, json={"name": "據點", "location": BODY["location"]})
    assert response.status_code == 200 and response.json()["address"] == ""


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_missing_station_is_404(client: TestClient, method: str):
    kwargs = {"json": {"name": "新名稱"}} if method == "patch" else {}
    response = getattr(client, method)(f"{BASE}/st-missing", headers=ADMIN, **kwargs)
    assert response.status_code == 404 and response.json()["detail"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("reference", ["account", "elder", "merged_elder", "checkin", "assignment"])
def test_delete_keeps_all_references_including_history(client: TestClient, reference: str):
    station_id = client.post(BASE, headers=ADMIN, json=BODY).json()["id"]
    with Session(engine) as session:
        if reference == "account":
            row = mr.models.MealAccount(id="ref-account", role="station", station_id=station_id)
        elif reference in {"elder", "merged_elder"}:
            row = mr.models.MealElder(
                id="ref-elder", alias="代稱", station_id=station_id, created_by="u-admin-1",
                merged_into="e-1" if reference == "merged_elder" else None,
            )
        elif reference == "checkin":
            row = mr.models.MealCheckin(id="ref-checkin", station_id=station_id, volunteer_id="u-vol-1")
        else:
            row = mr.models.MealAssignment(
                id="ref-assignment", station_id=station_id, volunteer_id="u-vol-1", elder_id="e-1",
                checkin_id="past-checkin", status="done", expires_at=datetime.now(UTC),
            )
        mr.repo.save(session, row)
        row_type, row_id = type(row), row.id
    response = client.delete(f"{BASE}/{station_id}", headers=ADMIN)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "STATION_IN_USE"
    with Session(engine) as session:
        assert mr.repo.get_station(session, station_id) is not None
        assert session.get(row_type, row_id) is not None
