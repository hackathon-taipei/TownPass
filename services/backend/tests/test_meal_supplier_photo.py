"""T-129 提供者店面照片（合約 v2.4、ADR-029）。

- `meal_supplier.image_id`：選填，啟動時自動補欄位，舊資料是空的
- `POST /suppliers` 可帶 `image_id`；`Supplier` 回應多 `image_url`（沒有 → null）
- 個人提供者（`org_type = person`）：後端忽略照片、存 null，回應也一律 null
- 一般市民可以 `POST /images`（申請前先上傳店面照片）
"""

import base64
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import repo

FAKE_JPEG = b"\xff\xd8\xff\xe0storefront"
LOCATION = {"lat": 25.035, "lng": 121.499}


def h(account_id: str) -> dict[str, str]:
    return {"X-Demo-User": account_id}


@pytest.fixture
def api(client: TestClient) -> Iterator[TestClient]:
    with Session(engine) as s:
        mr.reset_demo(s)
    yield client


def __upload(client: TestClient, account_id: str) -> str:
    data_url = "data:image/jpeg;base64," + base64.b64encode(FAKE_JPEG).decode("ascii")
    r = client.post("/meal-relay/images", json={"data_url": data_url}, headers=h(account_id))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def __apply(client: TestClient, account_id: str, org_type: str, image_id: str | None) -> dict:
    body: dict[str, object] = {"name": "測試麵包坊（模擬）", "org_type": org_type, "location": LOCATION}
    if image_id is not None:
        body["image_id"] = image_id
    r = client.post("/meal-relay/suppliers", json=body, headers=h(account_id))
    assert r.status_code == 200, r.text
    return r.json()


def test_column_exists_after_startup(client: TestClient) -> None:
    assert "image_id" in {c["name"] for c in inspect(engine).get_columns("meal_supplier")}


def test_citizen_can_upload_storefront_photo(api: TestClient) -> None:
    """一般市民（還沒匯入的帳號也算）可以上傳照片；據點、管理員仍不行。"""
    __upload(api, "u-cit-1")
    __upload(api, "tp-new-citizen")
    for who in ("u-st-1", "u-admin-1"):
        r = api.post("/meal-relay/images", json={"data_url": "data:image/jpeg;base64,AAAA"}, headers=h(who))
        assert r.status_code == 403 and r.json()["detail"]["code"] == "FORBIDDEN_ROLE"


@pytest.mark.parametrize("org_type", ["shop", "school", "agency", "other"])
def test_apply_with_storefront_photo(api: TestClient, org_type: str) -> None:
    image_id = __upload(api, "u-cit-1")
    created = __apply(api, "u-cit-1", org_type, image_id)
    assert created["image_url"] == f"/meal-relay/images/{image_id}"

    with Session(engine) as s:
        row = repo.get_supplier(s, created["id"])
        assert row is not None and row.image_id == image_id

    # 自己的申請、管理員的審核清單、通過後的 /me 都帶 image_url
    mine = api.get("/meal-relay/suppliers/mine", headers=h("u-cit-1")).json()
    assert mine["image_url"] == created["image_url"]
    pending = api.get("/meal-relay/suppliers?status=pending", headers=h("u-admin-1")).json()
    assert next(s for s in pending if s["id"] == created["id"])["image_url"] == created["image_url"]
    approved = api.post(f"/meal-relay/suppliers/{created['id']}/approve", headers=h("u-admin-1")).json()
    assert approved["image_url"] == created["image_url"]
    me = api.get("/meal-relay/me", headers=h("u-cit-1")).json()
    assert me["supplier"]["image_url"] == created["image_url"]


def test_apply_without_photo_is_null(api: TestClient) -> None:
    created = __apply(api, "u-cit-1", "shop", None)
    assert created["image_url"] is None


def test_person_supplier_photo_is_ignored(api: TestClient) -> None:
    """個人提供者：送了照片也忽略、存 null（避免拍到自家住址）。"""
    image_id = __upload(api, "u-cit-1")
    created = __apply(api, "u-cit-1", "person", image_id)
    assert created["image_url"] is None
    with Session(engine) as s:
        row = repo.get_supplier(s, created["id"])
        assert row is not None and row.image_id is None


def test_person_row_with_image_id_still_outputs_null(api: TestClient) -> None:
    """資料庫裡個人提供者即使有 image_id（例如手動改過），回應仍是 null。"""
    with Session(engine) as s:
        row = repo.get_supplier(s, "s-3")
        assert row is not None
        repo.update_supplier(s, row, org_type="person", image_id="img-x")
    pending = api.get("/meal-relay/suppliers?status=pending", headers=h("u-admin-1")).json()
    assert next(x for x in pending if x["id"] == "s-3")["image_url"] is None


def test_seed_suppliers_have_no_photo(api: TestClient) -> None:
    suppliers = api.get("/meal-relay/suppliers", headers=h("u-admin-1")).json()
    assert suppliers and all("image_url" in s and s["image_url"] is None for s in suppliers)


def test_supplier_image_id_helper() -> None:
    assert mr.supplier_image_id("person", "img-1") is None
    assert mr.supplier_image_id("shop", "img-1") == "img-1"
    assert mr.supplier_image_id("shop", "") is None
    assert mr.supplier_image_id("school", None) is None
