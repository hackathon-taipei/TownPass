"""T-128 食物點與據點的入口照片（合約 v2.3、ADR-028）。

- `meal_point.image_id`、`meal_station.image_id`：選填，啟動時自動補欄位，舊資料是空的
- `POST /points` 可帶 `image_id`；`Point`、`Station` 回應多 `image_url`（沒有 → null）
- `Food.point_image_url`：食物點（取餐地點）的入口照片，志工任務卡用
- 種子不放照片
"""

import base64
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session

import townpass_backend.features.meal_relay as mr
from townpass_backend.db import engine

NOW = datetime.now(UTC).replace(microsecond=0)
LATER = NOW + timedelta(days=30)
FAKE_JPEG = b"\xff\xd8\xff\xe0entrance-photo"


@pytest.fixture
def session(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[Session]:
    monkeypatch.setattr(mr.service, "now", lambda: NOW)
    monkeypatch.setattr(mr, "now", lambda: NOW)
    with Session(engine) as s:
        mr.reset_demo(s, NOW)
        yield s


def __upload(client: TestClient, account_id: str = "u-sup-1") -> str:
    data_url = "data:image/jpeg;base64," + base64.b64encode(FAKE_JPEG).decode("ascii")
    r = client.post("/meal-relay/images", json={"data_url": data_url}, headers={"X-Demo-User": account_id})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def __create_point(client: TestClient, **extra: object) -> dict:
    payload = {"name": "老松國小側門", "kind": "custom", "location": {"lat": 25.038, "lng": 121.502}, **extra}
    r = client.post("/meal-relay/points", json=payload, headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 200, r.text
    return r.json()


def test_columns_exist_after_startup(client: TestClient) -> None:
    """資料表只增不減：啟動時（sync_schema）補上 image_id 欄位。"""
    tables = inspect(engine)
    assert "image_id" in {c["name"] for c in tables.get_columns("meal_point")}
    assert "image_id" in {c["name"] for c in tables.get_columns("meal_station")}


def test_seed_has_no_entrance_photos(client: TestClient, session: Session) -> None:
    """種子不放照片：所有據點、食物點的 image_url 都是 null（欄位一定存在）。"""
    stations = client.get("/meal-relay/stations", headers={"X-Demo-User": "u-cit-1"}).json()
    assert stations and all("image_url" in s and s["image_url"] is None for s in stations)
    points = client.get("/meal-relay/points", headers={"X-Demo-User": "u-sup-1"}).json()
    assert points and all("image_url" in p and p["image_url"] is None for p in points)


def test_create_point_with_entrance_photo(client: TestClient, session: Session) -> None:
    image_id = __upload(client)
    created = __create_point(client, image_id=image_id)
    assert created["image_url"] == f"/meal-relay/images/{image_id}"

    row = mr.repo.get_point(session, created["id"])
    assert row is not None and row.image_id == image_id

    # 清單也帶 image_url，照片可公開讀取
    listed = client.get("/meal-relay/points", headers={"X-Demo-User": "u-sup-1"}).json()
    assert next(p for p in listed if p["id"] == created["id"])["image_url"] == created["image_url"]
    photo = client.get(created["image_url"])
    assert photo.status_code == 200 and photo.content == FAKE_JPEG


def test_create_point_without_photo_is_null(client: TestClient, session: Session) -> None:
    created = __create_point(client)
    assert created["image_url"] is None
    created_null = __create_point(client, image_id=None)
    assert created_null["image_url"] is None


def test_station_image_url(client: TestClient, session: Session) -> None:
    """據點照片由管理員或種子提供：資料表有 image_id 就回傳 image_url。"""
    station = mr.repo.get_station(session, "st-1")
    assert station is not None
    mr.repo.update_station(session, station, image_id="img-st-1")

    stations = client.get("/meal-relay/stations", headers={"X-Demo-User": "u-cit-1"}).json()
    by_id = {s["id"]: s for s in stations}
    assert by_id["st-1"]["image_url"] == "/meal-relay/images/img-st-1"
    assert by_id["st-2"]["image_url"] is None

    board = client.get("/meal-relay/board", headers={"X-Demo-User": "u-admin-1"}).json()
    assert {s["id"]: s["image_url"] for s in board["stations"]}["st-1"] == "/meal-relay/images/img-st-1"


def test_food_carries_point_photo(client: TestClient, session: Session) -> None:
    image_id = __upload(client)
    point = __create_point(client, image_id=image_id)
    body = {
        "point_id": point["id"],
        "name": "雞腿便當",
        "category": "meal_box",
        "qty": 2,
        "expires_at": (NOW + timedelta(hours=3)).isoformat(),
    }
    r = client.post("/meal-relay/foods", json=body, headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 200, r.text
    food = r.json()
    assert food["point_image_url"] == f"/meal-relay/images/{image_id}"
    assert food["image_url"] is None  # 食物照片與入口照片分開

    # 沒有入口照片的食物點 → null
    seeded = client.get("/meal-relay/foods/f-1", headers={"X-Demo-User": "u-sup-1"}).json()
    assert seeded["point_image_url"] is None


def test_volunteer_task_shows_pickup_point_photo(client: TestClient, session: Session) -> None:
    """志工任務卡：Assignment.claim.food.point_image_url 是取餐地點的入口照片。"""
    for elder in mr.repo.list_elders(session, include_merged=True):
        mr.repo.update_elder(
            session, elder, last_seen_at=NOW, last_meal_at=NOW, next_care_at=LATER, next_meal_at=LATER
        )
    mr.repo.create_elder(
        session,
        mr.models.MealElder(
            id="e-photo", alias="測試長者", station_id="st-1", lat=25.0368, lng=121.5013,
            allergens=[], created_by="u-admin-1", created_at=NOW, next_care_at=LATER, next_meal_at=NOW,
        ),
    )
    for food in mr.repo.list_foods(session):
        mr.repo.update_food(session, food, closed=food.id != "f-1")
    food = mr.repo.get_food(session, "f-1")
    assert food is not None
    point = mr.repo.get_point(session, food.point_id)
    assert point is not None
    mr.repo.update_point(session, point, image_id="img-pickup")

    station = mr.repo.get_station(session, "st-1")
    assert station is not None
    r = client.post(
        "/meal-relay/checkins",
        headers={"X-Demo-User": "u-vol-1"},
        json={"qr_text": mr.station_qr_text(station, NOW)},
    )
    assert r.status_code == 200, r.text
    task = next(a for a in r.json()["assignments"] if a["elder_id"] == "e-photo")
    assert task["claim"]["food"]["point_image_url"] == "/meal-relay/images/img-pickup"


def test_point_create_rejects_unknown_fields(client: TestClient, session: Session) -> None:
    """請求型別仍是 extra="forbid"：多送欄位 → 422。"""
    payload = {"name": "x", "location": {"lat": 25.0, "lng": 121.5}, "image_url": "/meal-relay/images/x"}
    r = client.post("/meal-relay/points", json=payload, headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "VALIDATION_ERROR"
