"""test_meal_food - T-109 食物點、食物、庫存去向與圖片端點測試。

涵蓋驗收項目：
- V3: 志工呼叫 POST /foods -> 403 FORBIDDEN_ROLE
- V4: 審核中的提供者上架或建點 -> 403 SUPPLIER_NOT_APPROVED
- V6: GET /foods?for_elder= 篩掉過敏衝突食物
- V8: 上架後超過 CLAIM_WINDOW_SEC -> unclaimed = True
- V9: expires_at 設成過去後呼叫 -> expired
- V21: 提供者改份數小於已派加已送 -> 409 QTY_BELOW_USED
- 權限: 改別人的食物 -> 403 NOT_OWNER
- 圖片: 格式檢查、大小檢查 (413 IMAGE_TOO_LARGE)、公開讀取 GET /images/{id}
"""

import base64
from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import models as m
from townpass_backend.features.meal_relay import repo

T0 = mr.now().replace(microsecond=0)


@pytest.fixture
def session(client: TestClient) -> Iterator[Session]:
    with Session(engine) as s:
        mr.reset_demo(s, T0)
        yield s


# ---------------------------------------------------------------- 食物點 (Points)


def test_list_points(client: TestClient, session: Session) -> None:
    # 志工無權限 (403 FORBIDDEN_ROLE)
    r = client.get("/meal-relay/points", headers={"X-Demo-User": "u-vol-1"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "FORBIDDEN_ROLE"

    # 提供者與管理員可查詢
    r_sup = client.get("/meal-relay/points", headers={"X-Demo-User": "u-sup-1"})
    assert r_sup.status_code == 200
    points = r_sup.json()
    assert len(points) >= 1
    assert "open_food_count" in points[0]

    # for_elder 排除過敏
    r_elder = client.get("/meal-relay/points?for_elder=e-1", headers={"X-Demo-User": "u-admin-1"})
    assert r_elder.status_code == 200


def test_create_point_permissions(client: TestClient, session: Session) -> None:
    payload = {
        "name": "新自訂食物點",
        "kind": "custom",
        "location": {"lat": 25.04, "lng": 121.55},
    }

    # 志工呼叫 -> 403 FORBIDDEN_ROLE
    r_vol = client.post("/meal-relay/points", json=payload, headers={"X-Demo-User": "u-vol-1"})
    assert r_vol.status_code == 403
    assert r_vol.json()["detail"]["code"] == "FORBIDDEN_ROLE"

    # V4: 審核中的提供者 (u-sup-3) -> 403 SUPPLIER_NOT_APPROVED
    r_pending = client.post("/meal-relay/points", json=payload, headers={"X-Demo-User": "u-sup-3"})
    assert r_pending.status_code == 403
    assert r_pending.json()["detail"]["code"] == "SUPPLIER_NOT_APPROVED"

    # 通過的提供者 (u-sup-1) -> 200 成功
    r_ok = client.post("/meal-relay/points", json=payload, headers={"X-Demo-User": "u-sup-1"})
    assert r_ok.status_code == 200
    created = r_ok.json()
    assert created["name"] == "新自訂食物點"
    assert created["source"] == "custom"
    assert created["open_food_count"] == 0


# ---------------------------------------------------------------- 食物 (Foods)


def test_v3_volunteer_cannot_create_food(client: TestClient, session: Session) -> None:
    # V3: 志工呼叫 POST /foods -> 403 FORBIDDEN_ROLE
    payload = {
        "point_id": "p-station-1",
        "name": "志工試圖上架食物",
        "category": "meal_box",
        "allergens": [],
        "qty": 5,
        "expires_at": (T0 + timedelta(days=1)).isoformat(),
    }
    r = client.post("/meal-relay/foods", json=payload, headers={"X-Demo-User": "u-vol-1"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "FORBIDDEN_ROLE"


def test_v4_pending_supplier_cannot_create_food(client: TestClient, session: Session) -> None:
    # V4: 審核中的提供者 (u-sup-3) 上架 -> 403 SUPPLIER_NOT_APPROVED
    payload = {
        "point_id": "p-station-1",
        "name": "審核中提供者食物",
        "category": "meal_box",
        "allergens": [],
        "qty": 5,
        "expires_at": (T0 + timedelta(days=1)).isoformat(),
    }
    r = client.post("/meal-relay/foods", json=payload, headers={"X-Demo-User": "u-sup-3"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "SUPPLIER_NOT_APPROVED"


def test_create_and_get_food(client: TestClient, session: Session) -> None:
    # 通過審核的提供者 (u-sup-1) 上架
    payload = {
        "point_id": "p-1",
        "name": "美味便當",
        "category": "meal_box",
        "allergens": ["egg"],
        "qty": 10,
        "expires_at": (T0 + timedelta(days=2)).isoformat(),
        "source_note": "測試備註",
    }
    r = client.post("/meal-relay/foods", json=payload, headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 200
    food = r.json()
    assert food["name"] == "美味便當"
    assert food["remaining"] == 10
    assert food["status"] == "open"
    assert food["unclaimed"] is False
    food_id = food["id"]

    # GET /foods/{id}
    r_get = client.get(f"/meal-relay/foods/{food_id}", headers={"X-Demo-User": "u-vol-1"})
    assert r_get.status_code == 200
    assert r_get.json()["id"] == food_id

    # 查無此食物 -> 404 NOT_FOUND
    r_none = client.get("/meal-relay/foods/f-nonexistent", headers={"X-Demo-User": "u-sup-1"})
    assert r_none.status_code == 404
    assert r_none.json()["detail"]["code"] == "NOT_FOUND"


def test_v6_filter_allergens_for_elder(client: TestClient, session: Session) -> None:
    # V6: e-1 對 peanut 過敏；種子中 f-4 含有 peanut
    r = client.get("/meal-relay/foods?for_elder=e-1", headers={"X-Demo-User": "u-admin-1"})
    assert r.status_code == 200
    food_ids = [f["id"] for f in r.json()]
    assert "f-4" not in food_ids

    # 不帶 for_elder 時可看到 f-4
    r_all = client.get("/meal-relay/foods", headers={"X-Demo-User": "u-admin-1"})
    assert r_all.status_code == 200
    all_food_ids = [f["id"] for f in r_all.json()]
    assert "f-4" in all_food_ids


def test_list_foods_mine_filter(client: TestClient, session: Session) -> None:
    # mine=1 只回傳該提供者 (u-sup-1 擁有 s-1) 的食物
    r = client.get("/meal-relay/foods?mine=1", headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 200
    foods = r.json()
    assert len(foods) > 0
    for f in foods:
        assert f["supplier_id"] == "s-1"


def test_patch_food_not_owner(client: TestClient, session: Session) -> None:
    # f-1 屬於 s-1 (u-sup-1)；u-sup-2 試圖修改 -> 403 NOT_OWNER
    r = client.patch(
        "/meal-relay/foods/f-1",
        json={"qty": 15},
        headers={"X-Demo-User": "u-sup-2"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "NOT_OWNER"


def test_v21_patch_food_qty_below_used(client: TestClient, session: Session) -> None:
    # V21: 提供者把份數改成小於已派出加已送達 -> 409 QTY_BELOW_USED
    food = repo.get_food(session, "f-1")
    assert food is not None

    # 手動建立兩筆申請: 1 筆 claimed (qty=2), 1 筆 done (qty=1)，合計已使用 3 份
    c1 = m.MealClaim(
        id=mr.new_id("c"),
        food_id="f-1",
        elder_id="e-1",
        qty=2,
        method="delivery",
        status="claimed",
        requested_by="u-vol-1",
        created_at=T0,
    )
    c2 = m.MealClaim(
        id=mr.new_id("c"),
        food_id="f-1",
        elder_id="e-2",
        qty=1,
        method="delivery",
        status="done",
        requested_by="u-vol-1",
        created_at=T0,
    )
    repo.create_claim(session, c1)
    repo.create_claim(session, c2)

    # 嘗試修改 qty = 2 (< 3) -> 409 QTY_BELOW_USED
    r_bad = client.patch(
        "/meal-relay/foods/f-1",
        json={"qty": 2},
        headers={"X-Demo-User": "u-sup-1"},
    )
    assert r_bad.status_code == 409
    assert r_bad.json()["detail"]["code"] == "QTY_BELOW_USED"

    # 修改 qty = 5 (>= 3) -> 成功
    r_good = client.patch(
        "/meal-relay/foods/f-1",
        json={"qty": 5},
        headers={"X-Demo-User": "u-sup-1"},
    )
    assert r_good.status_code == 200
    updated = r_good.json()
    assert updated["qty"] == 5
    assert updated["remaining"] == 2  # 5 - 3 = 2


def test_v9_expired_food(client: TestClient, session: Session) -> None:
    # V9: expires_at 設成過去再呼叫 -> 食物狀態為 expired
    food = repo.get_food(session, "f-2")
    assert food is not None
    past_time = T0 - timedelta(hours=2)
    repo.update_food(session, food, expires_at=past_time)

    r = client.get("/meal-relay/foods/f-2", headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 200
    assert r.json()["status"] == "expired"


def test_v8_unclaimed_flag(client: TestClient, session: Session) -> None:
    # V8: 上架後超過 CLAIM_WINDOW_SEC -> unclaimed = True
    food = repo.get_food(session, "f-3")
    assert food is not None
    # 調整 created_at 超過領取時間窗
    old_time = T0 - timedelta(seconds=mr.settings().CLAIM_WINDOW_SEC + 10)
    repo.update_food(session, food, created_at=old_time)

    r = client.get("/meal-relay/foods/f-3", headers={"X-Demo-User": "u-sup-1"})
    assert r.status_code == 200
    assert r.json()["unclaimed"] is True


# ---------------------------------------------------------------- 圖片 (Images)


def test_upload_and_get_image(client: TestClient, session: Session) -> None:
    # 產生 1x1 假圖片 base64
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    b64_str = base64.b64encode(fake_png).decode("ascii")
    data_url = f"data:image/png;base64,{b64_str}"

    # 提供者上傳圖片
    r_up = client.post(
        "/meal-relay/images",
        json={"data_url": data_url},
        headers={"X-Demo-User": "u-sup-1"},
    )
    assert r_up.status_code == 200
    img_info = r_up.json()
    assert img_info["mime"] == "image/png"
    assert img_info["size"] == len(fake_png)
    image_id = img_info["id"]

    # 公開讀取 GET /images/{id} 不需要 Header
    r_get = client.get(f"/meal-relay/images/{image_id}")
    assert r_get.status_code == 200
    assert r_get.headers["content-type"] == "image/png"
    assert r_get.content == fake_png


def test_image_too_large(client: TestClient, session: Session) -> None:
    # 超過 IMAGE_MAX_BYTES (200000 bytes) -> 413 IMAGE_TOO_LARGE
    large_bytes = b"X" * 200001
    b64_str = base64.b64encode(large_bytes).decode("ascii")
    data_url = f"data:image/jpeg;base64,{b64_str}"

    r = client.post(
        "/meal-relay/images",
        json={"data_url": data_url},
        headers={"X-Demo-User": "u-sup-1"},
    )
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "IMAGE_TOO_LARGE"


def test_image_invalid_mime(client: TestClient, session: Session) -> None:
    # 不支援的圖片格式 -> 422 VALIDATION_ERROR
    b64_str = base64.b64encode(b"dummy").decode("ascii")
    data_url = f"data:text/plain;base64,{b64_str}"

    r = client.post(
        "/meal-relay/images",
        json={"data_url": data_url},
        headers={"X-Demo-User": "u-sup-1"},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "VALIDATION_ERROR"
