"""meal_account（T-108）：帳號、提供者申請與審核、重置 Demo（合約 11-meal-relay.md v2.2 §8、V1、V2、V17）。"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from townpass_backend.db import engine
from townpass_backend.features import meal_relay as mr
from townpass_backend.features.meal_relay import repo

ADMIN, CITIZEN, APPLICANT, SUPPLIER, VOLUNTEER, STATION = (
    "u-admin-1", "u-cit-1", "u-sup-3", "u-sup-1", "u-vol-1", "u-st-1",
)  # fmt: skip
APPLY = {"name": "測試麵包坊（模擬）", "org_type": "shop", "location": {"lat": 25.035, "lng": 121.499}}


def h(account_id: str) -> dict[str, str]:
    return {"X-Demo-User": account_id}


@pytest.fixture
def api(client: TestClient) -> Iterator[TestClient]:
    """每個測試前回到種子狀態。"""
    with Session(engine) as s:
        mr.reset_demo(s)
    yield client


def error_code(res: object) -> str:
    return res.json()["detail"]["code"]  # type: ignore[attr-defined]


# ---------------------------------------------------------------- V1 身分


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/meal-relay/me"),
        ("POST", "/meal-relay/demo/reset"),
        ("POST", "/meal-relay/suppliers"),
        ("GET", "/meal-relay/suppliers/mine"),
        ("GET", "/meal-relay/suppliers"),
        ("POST", "/meal-relay/suppliers/s-3/approve"),
        ("POST", "/meal-relay/suppliers/s-3/reject"),
    ],
)
def test_v1_missing_header_is_unauthenticated(api: TestClient, method: str, path: str) -> None:
    res = api.request(method, path, json=APPLY if path.endswith("/suppliers") and method == "POST" else None)
    assert res.status_code == 401
    assert error_code(res) == "UNAUTHENTICATED"


def test_v1_blank_header_is_unauthenticated(api: TestClient) -> None:
    res = api.get("/meal-relay/me", headers=h("  "))
    assert res.status_code == 401 and error_code(res) == "UNAUTHENTICATED"


# ---------------------------------------------------------------- GET /me


def test_v2_unknown_id_is_citizen_without_elder(api: TestClient) -> None:
    res = api.get("/meal-relay/me", headers=h("tp-not-imported-123"))
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "id": "tp-not-imported-123",
        "role": "citizen",
        "name": "",
        "station_id": None,
        "supplier": None,
    }
    assert "elder" not in body
    # 預設的一般市民不寫進資料庫
    with Session(engine) as s:
        assert repo.get_account(s, "tp-not-imported-123") is None


@pytest.mark.parametrize(
    ("account_id", "role", "station_id", "supplier_status"),
    [
        (ADMIN, "admin", None, None),
        (VOLUNTEER, "volunteer", "st-1", None),
        (STATION, "station", "st-1", None),
        (SUPPLIER, "supplier", None, "approved"),
        (APPLICANT, "citizen", None, "pending"),
        (CITIZEN, "citizen", None, None),
    ],
)
def test_me_for_seed_accounts(
    api: TestClient, account_id: str, role: str, station_id: str | None, supplier_status: str | None
) -> None:
    body = api.get("/meal-relay/me", headers=h(account_id)).json()
    assert body["id"] == account_id and body["role"] == role and body["station_id"] == station_id
    assert "elder" not in body
    assert (body["supplier"] or {}).get("status") == supplier_status


# ---------------------------------------------------------------- 申請


def test_citizen_applies_and_sees_pending(api: TestClient) -> None:
    res = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY)
    assert res.status_code == 200
    sup = res.json()
    assert sup["id"].startswith("s-") and sup["account_id"] == CITIZEN
    assert sup["name"] == APPLY["name"] and sup["org_type"] == "shop" and sup["location"] == APPLY["location"]
    assert sup["status"] == "pending" and sup["reviewed_at"] is None
    assert sup["created_at"].endswith("+08:00")
    mine = api.get("/meal-relay/suppliers/mine", headers=h(CITIZEN))
    assert mine.status_code == 200 and mine.json() == sup
    me = api.get("/meal-relay/me", headers=h(CITIZEN)).json()
    assert me["role"] == "citizen" and me["supplier"] == sup


def test_my_supplier_is_null_without_application(api: TestClient) -> None:
    res = api.get("/meal-relay/suppliers/mine", headers=h(CITIZEN))
    assert res.status_code == 200 and res.json() is None
    res = api.get("/meal-relay/suppliers/mine", headers=h("tp-new-person"))
    assert res.status_code == 200 and res.json() is None


def test_supplier_sees_own_approved_application(api: TestClient) -> None:
    res = api.get("/meal-relay/suppliers/mine", headers=h(SUPPLIER))
    assert res.status_code == 200
    assert res.json()["id"] == "s-1" and res.json()["status"] == "approved"


def test_duplicate_application_is_already_applied(api: TestClient) -> None:
    assert api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY).status_code == 200
    res = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY)
    assert res.status_code == 409 and error_code(res) == "ALREADY_APPLIED"
    # 種子裡審核中的 u-sup-3 也不能再申請
    res = api.post("/meal-relay/suppliers", headers=h(APPLICANT), json=APPLY)
    assert res.status_code == 409 and error_code(res) == "ALREADY_APPLIED"


def test_rejected_applicant_cannot_apply_again(api: TestClient) -> None:
    assert api.post("/meal-relay/suppliers/s-3/reject", headers=h(ADMIN)).status_code == 200
    res = api.post("/meal-relay/suppliers", headers=h(APPLICANT), json=APPLY)
    assert res.status_code == 409 and error_code(res) == "ALREADY_APPLIED"


@pytest.mark.parametrize(
    "body",
    [
        {**APPLY, "name": ""},
        {**APPLY, "org_type": "factory"},
        {"name": "x", "org_type": "shop"},
        {**APPLY, "location": {"lat": 200, "lng": 121.5}},
        {**APPLY, "status": "approved"},  # 多送欄位
    ],
)
def test_apply_validation_error(api: TestClient, body: dict[str, object]) -> None:
    res = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=body)
    assert res.status_code == 422 and error_code(res) == "VALIDATION_ERROR"


@pytest.mark.parametrize("account_id", [SUPPLIER, VOLUNTEER, STATION, ADMIN])
def test_only_citizen_can_apply(api: TestClient, account_id: str) -> None:
    res = api.post("/meal-relay/suppliers", headers=h(account_id), json=APPLY)
    assert res.status_code == 403 and error_code(res) == "FORBIDDEN_ROLE"


@pytest.mark.parametrize("account_id", [VOLUNTEER, STATION, ADMIN])
def test_my_supplier_forbidden_for_other_roles(api: TestClient, account_id: str) -> None:
    res = api.get("/meal-relay/suppliers/mine", headers=h(account_id))
    assert res.status_code == 403 and error_code(res) == "FORBIDDEN_ROLE"


# ---------------------------------------------------------------- 審核（管理員）


def test_admin_lists_suppliers_with_status_filter(api: TestClient) -> None:
    all_ = api.get("/meal-relay/suppliers", headers=h(ADMIN))
    assert all_.status_code == 200
    assert {s["id"] for s in all_.json()} == {"s-1", "s-2", "s-3"}
    pending = api.get("/meal-relay/suppliers", headers=h(ADMIN), params={"status": "pending"}).json()
    assert [s["id"] for s in pending] == ["s-3"]
    approved = api.get("/meal-relay/suppliers", headers=h(ADMIN), params={"status": "approved"}).json()
    assert {s["id"] for s in approved} == {"s-1", "s-2"}
    assert api.get("/meal-relay/suppliers", headers=h(ADMIN), params={"status": "rejected"}).json() == []


def test_list_suppliers_bad_status_is_validation_error(api: TestClient) -> None:
    res = api.get("/meal-relay/suppliers", headers=h(ADMIN), params={"status": "done"})
    assert res.status_code == 422 and error_code(res) == "VALIDATION_ERROR"


def test_approve_makes_applicant_a_supplier(api: TestClient) -> None:
    sup = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY).json()
    res = api.post(f"/meal-relay/suppliers/{sup['id']}/approve", headers=h(ADMIN))
    assert res.status_code == 200
    approved = res.json()
    assert approved["status"] == "approved" and approved["reviewed_at"].endswith("+08:00")
    me = api.get("/meal-relay/me", headers=h(CITIZEN)).json()
    assert me["role"] == "supplier" and me["supplier"]["id"] == sup["id"]
    assert me["supplier"]["status"] == "approved"
    with Session(engine) as s:
        account = repo.get_account(s, CITIZEN)
        assert account and account.role == "supplier" and account.supplier_id == sup["id"]
    # 變成 supplier 後仍可看自己的申請，但不能再申請
    assert api.get("/meal-relay/suppliers/mine", headers=h(CITIZEN)).json()["status"] == "approved"
    res = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY)
    assert res.status_code == 403 and error_code(res) == "FORBIDDEN_ROLE"


def test_approve_seed_pending_supplier(api: TestClient) -> None:
    res = api.post("/meal-relay/suppliers/s-3/approve", headers=h(ADMIN))
    assert res.status_code == 200 and res.json()["status"] == "approved"
    me = api.get("/meal-relay/me", headers=h(APPLICANT)).json()
    assert me["role"] == "supplier" and me["supplier"]["id"] == "s-3"


def test_not_imported_citizen_applies_and_is_approved(api: TestClient) -> None:
    """沒匯入的台北通帳號：申請時寫進 meal_account（仍是 citizen），通過後變成 supplier。"""
    who = "tp-shop-owner-1"
    sup = api.post("/meal-relay/suppliers", headers=h(who), json=APPLY).json()
    assert api.get("/meal-relay/me", headers=h(who)).json()["role"] == "citizen"
    assert api.post(f"/meal-relay/suppliers/{sup['id']}/approve", headers=h(ADMIN)).status_code == 200
    me = api.get("/meal-relay/me", headers=h(who)).json()
    assert me["role"] == "supplier" and me["supplier"]["id"] == sup["id"]


def test_reject_keeps_applicant_citizen(api: TestClient) -> None:
    sup = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY).json()
    res = api.post(f"/meal-relay/suppliers/{sup['id']}/reject", headers=h(ADMIN))
    assert res.status_code == 200
    assert res.json()["status"] == "rejected" and res.json()["reviewed_at"] is not None
    me = api.get("/meal-relay/me", headers=h(CITIZEN)).json()
    assert me["role"] == "citizen" and me["supplier"]["status"] == "rejected"


@pytest.mark.parametrize("decision", ["approve", "reject"])
def test_review_non_pending_is_invalid_state(api: TestClient, decision: str) -> None:
    res = api.post(f"/meal-relay/suppliers/s-1/{decision}", headers=h(ADMIN))  # s-1 已通過
    assert res.status_code == 409 and error_code(res) == "INVALID_STATE"
    assert api.post("/meal-relay/suppliers/s-3/reject", headers=h(ADMIN)).status_code == 200
    res = api.post(f"/meal-relay/suppliers/s-3/{decision}", headers=h(ADMIN))  # 已審過不能再審
    assert res.status_code == 409 and error_code(res) == "INVALID_STATE"
    assert api.get("/meal-relay/me", headers=h(APPLICANT)).json()["role"] == "citizen"


@pytest.mark.parametrize("decision", ["approve", "reject"])
def test_review_unknown_supplier_is_not_found(api: TestClient, decision: str) -> None:
    res = api.post(f"/meal-relay/suppliers/s-nope/{decision}", headers=h(ADMIN))
    assert res.status_code == 404 and error_code(res) == "NOT_FOUND"


@pytest.mark.parametrize("account_id", [CITIZEN, APPLICANT, SUPPLIER, VOLUNTEER, STATION, "tp-unknown"])
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/meal-relay/suppliers"),
        ("POST", "/meal-relay/suppliers/s-3/approve"),
        ("POST", "/meal-relay/suppliers/s-3/reject"),
        ("POST", "/meal-relay/demo/reset"),
    ],
)
def test_admin_only_endpoints_forbid_other_roles(
    api: TestClient, account_id: str, method: str, path: str
) -> None:
    res = api.request(method, path, headers=h(account_id))
    assert res.status_code == 403 and error_code(res) == "FORBIDDEN_ROLE"
    with Session(engine) as s:
        s3 = repo.get_supplier(s, "s-3")
        assert s3 and s3.status == "pending"


# ---------------------------------------------------------------- V17 重置


def test_v17_reset_demo_restores_seed_state(api: TestClient) -> None:
    sup = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY).json()
    api.post(f"/meal-relay/suppliers/{sup['id']}/approve", headers=h(ADMIN))
    api.post("/meal-relay/suppliers/s-3/reject", headers=h(ADMIN))
    api.post("/meal-relay/suppliers", headers=h("tp-temp-1"), json=APPLY)

    res = api.post("/meal-relay/demo/reset", headers=h(ADMIN))
    assert res.status_code == 200
    assert res.json()["imported"] > 0

    pending = api.get("/meal-relay/suppliers", headers=h(ADMIN), params={"status": "pending"}).json()
    assert [s["id"] for s in pending] == ["s-3"]
    everyone = api.get("/meal-relay/suppliers", headers=h(ADMIN)).json()
    assert {s["id"] for s in everyone} == {"s-1", "s-2", "s-3"}
    me = api.get("/meal-relay/me", headers=h(CITIZEN)).json()
    assert me["role"] == "citizen" and me["supplier"] is None
    with Session(engine) as s:
        assert repo.get_account(s, "tp-temp-1") is None
        assert len(repo.list_foods(s)) >= 6 and len(repo.list_elders(s)) >= 12


# ---------------------------------------------------------------- 單位地址（T-133、ADR-030）


def test_apply_with_address_is_stripped_and_listed(api: TestClient) -> None:
    address = "  臺北市萬華區測試路1號（模擬）  "
    res = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json={**APPLY, "address": address})
    assert res.status_code == 200
    assert res.json()["address"] == "臺北市萬華區測試路1號（模擬）"
    mine = api.get("/meal-relay/suppliers/mine", headers=h(CITIZEN)).json()
    assert mine["address"] == "臺北市萬華區測試路1號（模擬）"
    api.post(f"/meal-relay/suppliers/{res.json()['id']}/approve", headers=h(ADMIN))
    listed = {s["id"]: s for s in api.get("/meal-relay/suppliers", headers=h(ADMIN)).json()}
    assert listed[res.json()["id"]]["address"] == "臺北市萬華區測試路1號（模擬）"


def test_apply_without_address_is_empty_string(api: TestClient) -> None:
    res = api.post("/meal-relay/suppliers", headers=h(CITIZEN), json=APPLY)
    assert res.status_code == 200 and res.json()["address"] == ""
    res_null = api.post("/meal-relay/suppliers", headers=h("tp-addr-null"), json={**APPLY, "address": None})
    assert res_null.status_code == 200 and res_null.json()["address"] == ""


def test_apply_person_does_not_store_address(api: TestClient) -> None:
    """個人提供者的地址是自家住址，一律不存（ADR-030、AGENTS.md 第 5 條）。"""
    body = {**APPLY, "org_type": "person", "address": "臺北市某路1號"}
    res = api.post("/meal-relay/suppliers", headers=h("tp-addr-person"), json=body)
    assert res.status_code == 200 and res.json()["address"] == ""
    with Session(engine) as s:
        row = repo.get_supplier(s, res.json()["id"])
        assert row is not None and row.address == ""


def test_apply_address_max_120_chars(api: TestClient) -> None:
    ok = api.post("/meal-relay/suppliers", headers=h("tp-addr-120"), json={**APPLY, "address": "址" * 120})
    assert ok.status_code == 200 and ok.json()["address"] == "址" * 120
    too_long = api.post(
        "/meal-relay/suppliers", headers=h("tp-addr-121"), json={**APPLY, "address": "址" * 121}
    )
    assert too_long.status_code == 422 and error_code(too_long) == "VALIDATION_ERROR"
