"""鄰食轉運站 HTTP 端到端驗證；只啟動自己的暫存 SQLite / localhost 伺服器。

從有後端依賴的 Python 執行：python tools/meal-relay-e2e.py
不連正式服務、不使用真實帳號；結束時終止自己的 uvicorn，暫存資料庫自動移除。
"""

import argparse
import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4qkAAAAASUVORK5CYII="


class Suite:
    def __init__(self, base):
        self.base = base
        self.results = []
        self.http = []

    def request(self, method, path, user="u-admin-1", body=None):
        headers = {"Content-Type": "application/json"}
        if user:
            headers["X-Demo-User"] = user
        req = Request(
            self.base + "/meal-relay" + path,
            method=method,
            headers=headers,
            data=None if body is None else json.dumps(body).encode(),
        )
        try:
            response = urlopen(req, timeout=10)
        except HTTPError as error:
            response = error
        raw = response.read()
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            value = {"binary_bytes": len(raw)}
        self.http.append(
            {
                "method": method,
                "path": path,
                "simulated_user": user,
                "status": response.status,
                "response": value,
            }
        )
        return response.status, value

    def call(self, method, path, user="u-admin-1", body=None):
        status, data = self.request(method, path, user, body)
        if status != 200:
            raise AssertionError(f"{method} {path}: {status} {data}")
        return data

    def expect(self, name, condition, detail="", probe=False):
        row = {
            "name": name,
            "passed": bool(condition),
            "detail": detail,
            "kind": "negative_probe" if probe else "acceptance",
        }
        self.results.append(row)
        print(f"{'PASS' if condition else 'FAIL'} {name}: {detail}", flush=True)

    def error(self, name, method, path, user, body, status, code):
        actual, data = self.request(method, path, user, body)
        self.expect(
            name,
            actual == status and data.get("detail", {}).get("code") == code,
            f"HTTP {actual}, {data.get('detail')}",
        )

    def reset(self):
        return self.call("POST", "/demo/reset")

    def checkin(self, user="u-vol-1", station="u-st-1"):
        qr = self.call("GET", "/stations/mine", station)["qr_text"]
        return self.call("POST", "/checkins", user, {"qr_text": qr})

    def visit(self, task, result, **extra):
        return {
            "elder_id": task["elder_id"],
            "assignment_id": task["id"],
            "claim_id": task["claim_id"],
            "kind": "meal",
            "result": result,
            **extra,
        }

    def only_food(self, keep):
        for food in self.call("GET", "/foods"):
            user = "u-sup-1" if food["supplier_id"] == "s-1" else "u-sup-2"
            self.call(
                "PATCH", f"/foods/{food['id']}", user, {"closed": food["id"] != keep}
            )

    def run(self):
        self.reset()
        self.error("V1 未登入", "GET", "/me", None, None, 401, "UNAUTHENTICATED")
        me = self.call("GET", "/me", "e2e-unknown-simulated")
        self.expect(
            "V2 未匯入帳號是市民",
            me["role"] == "citizen" and me["supplier"] is None and "elder" not in me,
        )
        food_body = {
            "point_id": "p-1",
            "name": "E2E 便當（模擬）",
            "category": "meal_box",
            "allergens": [],
            "qty": 12,
            "expires_at": (datetime.now(UTC) + timedelta(hours=3)).isoformat(),
        }
        self.error(
            "V3 志工不能上架",
            "POST",
            "/foods",
            "u-vol-1",
            food_body,
            403,
            "FORBIDDEN_ROLE",
        )
        self.error(
            "V4 審核中不能上架",
            "POST",
            "/foods",
            "u-sup-3",
            food_body,
            403,
            "SUPPLIER_NOT_APPROVED",
        )
        self.error(
            "V19 志工不能取得名冊",
            "GET",
            "/elders",
            "u-vol-1",
            None,
            403,
            "FORBIDDEN_ROLE",
        )
        self.error(
            "據點不能取得管理看板",
            "GET",
            "/board",
            "u-st-1",
            None,
            403,
            "FORBIDDEN_ROLE",
        )
        self.error(
            "拒絕額外個資欄位",
            "POST",
            "/suppliers",
            "u-cit-1",
            {
                "name": "模擬店家",
                "org_type": "shop",
                "location": {"lat": 25, "lng": 121},
                "phone": "TEST-NOT-A-PHONE",
            },
            422,
            "VALIDATION_ERROR",
        )
        supplier = self.call(
            "POST",
            "/suppliers",
            "u-cit-1",
            {
                "name": "端到端店家（模擬）",
                "org_type": "shop",
                "location": {"lat": 25.035429, "lng": 121.501369},
                "address": "模擬測試場地",
            },
        )
        self.expect("市民申請進入待審核", supplier["status"] == "pending")
        pending = self.call("GET", "/suppliers?status=pending")
        self.expect(
            "管理員可看待審核", supplier["id"] in [row["id"] for row in pending]
        )
        self.call("POST", f"/suppliers/{supplier['id']}/approve")
        self.expect(
            "審核通過後身分更新",
            self.call("GET", "/me", "u-cit-1")["role"] == "supplier",
        )
        food = self.call("POST", "/foods", "u-cit-1", food_body)
        self.expect(
            "提供者上架與庫存", food["remaining"] == 12 and food["dispatched_qty"] == 0
        )
        food = self.call("PATCH", f"/foods/{food['id']}", "u-cit-1", {"qty": 15})
        self.expect("提供者修改庫存", food["remaining"] == 15)
        self.error(
            "提供者不能改他人庫存",
            "PATCH",
            f"/foods/{food['id']}",
            "u-sup-1",
            {"qty": 99},
            403,
            "NOT_OWNER",
        )
        food = self.call("PATCH", f"/foods/{food['id']}", "u-cit-1", {"closed": True})
        self.expect("提供者下架", food["status"] == "closed")
        self.call("POST", "/suppliers/s-3/reject")
        self.expect(
            "管理員拒絕申請",
            self.call("GET", "/suppliers/mine", "u-sup-3")["status"] == "rejected",
        )
        self.reset()
        station = self.call("GET", "/stations/mine", "u-st-1")
        stations = self.call("GET", "/stations", "u-cit-1")
        self.expect(
            "公開據點不含報到秘密",
            all("checkin_code" not in row and "qr_text" not in row for row in stations),
        )
        qr_other = self.call("GET", "/stations/mine", "u-st-2")["qr_text"]
        self.error(
            "V12 不同據點 QR",
            "POST",
            "/checkins",
            "u-vol-1",
            {"qr_text": qr_other},
            403,
            "WRONG_STATION",
        )
        parts = station["qr_text"].split(":")
        parts[-1] = "0000000000" if parts[-1] != "0000000000" else "1111111111"
        self.error(
            "V18 竄改 QR",
            "POST",
            "/checkins",
            "u-vol-1",
            {"qr_text": ":".join(parts)},
            409,
            "QR_EXPIRED",
        )
        result = self.checkin()
        tasks = result["assignments"]
        self.expect(
            "V13 派送三位且優先熟面孔",
            len(tasks) == 3
            and all(t["elder"]["primary_volunteer_id"] == "u-vol-1" for t in tasks),
        )
        again = self.checkin()
        self.expect(
            "V15 重複報到不重派",
            [t["id"] for t in again["assignments"]] == [t["id"] for t in tasks]
            and again["checkin"]["id"] == result["checkin"]["id"],
        )
        second = self.checkin("u-vol-2")
        self.expect(
            "V14 志工間派送隔離",
            not {t["elder_id"] for t in tasks}.intersection(
                t["elder_id"] for t in second["assignments"]
            ),
        )
        self.expect(
            "過敏原安全派送",
            all(
                not set(t["elder"]["allergens"]).intersection(
                    t["claim"]["food"]["allergens"]
                )
                for t in tasks + second["assignments"]
                if t["claim"]
            ),
        )
        self.expect(
            "據點可看到今天報到",
            len(self.call("GET", "/stations/mine", "u-st-1")["checkins"]) == 2,
        )
        task = tasks[0]
        self.error(
            "不能領取他人任務",
            "POST",
            f"/claims/{task['claim_id']}/pickup",
            "u-vol-2",
            None,
            403,
            "NOT_OWNER",
        )
        self.error(
            "不能回報他人長者",
            "POST",
            "/visits",
            "u-vol-2",
            self.visit(task, "seen"),
            403,
            "NOT_OWNER",
        )
        claim = self.call("POST", f"/claims/{task['claim_id']}/pickup", "u-vol-1")
        self.expect("取餐進入配送中", claim["status"] == "delivering")
        food_id = claim["food_id"]
        used_food = self.call("GET", f"/foods/{food_id}")
        owner = "u-sup-1" if used_food["supplier_id"] == "s-1" else "u-sup-2"
        self.error(
            "V21 不能減少已使用份數",
            "PATCH",
            f"/foods/{food_id}",
            owner,
            {"qty": 0},
            409,
            "QTY_BELOW_USED",
        )
        before_board = self.call("GET", "/board")
        self.call("POST", "/visits", "u-vol-1", self.visit(task, "seen"))
        board = self.call("GET", "/board")
        elder = next(e for e in board["elders"] if e["id"] == task["elder_id"])
        self.expect(
            "V10 見到本人更新關懷與熟面孔",
            elder["last_seen_at"] is not None
            and elder["primary_volunteer_id"] == "u-vol-1"
            and not elder["alert"],
        )
        self.expect(
            "管理看板連動",
            board["stats"]["seen_today"] == before_board["stats"]["seen_today"] + 1
            and board["stats"]["delivered_today"]
            == before_board["stats"]["delivered_today"] + 1,
        )
        self.expect(
            "V20 完成任務消失",
            task["id"]
            not in [t["id"] for t in self.call("GET", "/assignments/mine", "u-vol-1")],
        )
        self.expect(
            "V20 完成餐點消失",
            task["claim_id"]
            not in [c["id"] for c in self.call("GET", "/claims/mine", "u-vol-1")],
        )
        self.error(
            "完成後不可再次回報",
            "POST",
            "/visits",
            "u-vol-1",
            self.visit(task, "seen"),
            403,
            "NOT_OWNER",
        )
        task = tasks[1]
        claim = self.call("POST", f"/claims/{task['claim_id']}/pickup", "u-vol-1")
        before = self.call("GET", f"/foods/{claim['food_id']}")["remaining"]
        self.call("POST", "/visits", "u-vol-1", self.visit(task, "returned"))
        self.expect(
            "帶回退回庫存",
            self.call("GET", f"/foods/{claim['food_id']}")["remaining"] == before + 1,
        )
        task = tasks[2]
        claim = self.call("POST", f"/claims/{task['claim_id']}/pickup", "u-vol-1")
        self.error(
            "放門口必須照片",
            "POST",
            "/visits",
            "u-vol-1",
            self.visit(task, "left_at_door"),
            422,
            "PHOTO_REQUIRED",
        )
        image = self.call(
            "POST", "/images", "u-vol-1", {"data_url": "data:image/png;base64," + PNG}
        )
        self.expect(
            "照片上傳可讀取",
            self.request("GET", f"/images/{image['id']}", None)[1]["binary_bytes"]
            == len(base64.b64decode(PNG)),
        )
        prior = task["elder"]["last_seen_at"]
        self.call(
            "POST",
            "/visits",
            "u-vol-1",
            self.visit(task, "left_at_door", photo_image_id=image["id"]),
        )
        elder = next(
            e for e in self.call("GET", "/elders") if e["id"] == task["elder_id"]
        )
        self.expect(
            "放門口僅更新送餐不更新見面",
            elder["last_seen_at"] == prior and elder["last_meal_at"] is not None,
        )
        self.expect(
            "完成全部三筆任務", self.call("GET", "/assignments/mine", "u-vol-1") == []
        )
        self.reset()
        task = self.checkin()["assignments"][0]
        before = task["claim"]["food"]["remaining"]
        self.call("POST", f"/claims/{task['claim_id']}/cancel", "u-vol-1")
        assignments = self.call("GET", "/assignments/mine", "u-vol-1")
        self.expect(
            "V7 取消餐點退庫存但保留關懷",
            any(t["id"] == task["id"] for t in assignments)
            and self.call("GET", f"/foods/{task['claim']['food_id']}")["remaining"]
            == before + 1,
        )
        self.reset()
        foods = self.call("GET", "/foods")
        self.expect(
            "V8 無人認領仍可派送",
            any(f["unclaimed"] and f["status"] == "open" for f in foods),
        )
        for f in foods:
            user = "u-sup-1" if f["supplier_id"] == "s-1" else "u-sup-2"
            self.call("PATCH", f"/foods/{f['id']}", user, {"qty": 0})
        tasks = self.checkin()["assignments"]
        self.expect(
            "V5 零庫存仍派關懷但不派餐",
            len(tasks) == 3 and all(t["claim"] is None for t in tasks),
        )
        self.reset()
        self.only_food("f-4")
        self.call("PATCH", "/elders/e-4", body={"allergens": ["peanut"]})
        task = next(t for t in self.checkin()["assignments"] if t["elder_id"] == "e-4")
        self.expect("V6 花生過敏不派花生餐", task["claim"] is None)
        self.expect(
            "V6 管理篩選排除過敏食物",
            "f-4" not in [f["id"] for f in self.call("GET", "/foods?for_elder=e-4")],
        )
        self.reset()
        self.only_food("f-3")
        task = self.checkin()["assignments"][0]
        self.call("POST", f"/claims/{task['claim_id']}/pickup", "u-vol-1")
        image = self.call(
            "POST", "/images", "u-vol-1", {"data_url": "data:image/png;base64," + PNG}
        )
        self.error(
            "V11 生鮮不能放門口",
            "POST",
            "/visits",
            "u-vol-1",
            self.visit(task, "left_at_door", photo_image_id=image["id"]),
            409,
            "FRESH_CANNOT_LEAVE",
        )
        self.reset()
        task = self.checkin()["assignments"][0]
        status, data = self.request(
            "POST", "/visits", "u-vol-1", self.visit(task, "seen")
        )
        self.expect(
            "負向：未取餐不能直接完成送餐",
            status == 409 and data.get("detail", {}).get("code") == "INVALID_STATE",
            f"預期 HTTP 409 INVALID_STATE；實際 HTTP {status}",
            probe=True,
        )
        self.reset()
        task = self.checkin()["assignments"][0]
        self.call("POST", f"/claims/{task['claim_id']}/pickup", "u-vol-1")
        status, data = self.request(
            "POST",
            "/visits",
            "u-vol-1",
            self.visit(task, "left_at_door", photo_image_id="img-does-not-exist-e2e"),
        )
        self.expect(
            "負向：放門口不能引用不存在的照片",
            status == 404 and data.get("detail", {}).get("code") == "NOT_FOUND",
            f"實際 HTTP {status}；photo_url={data.get('photo_url')}",
            probe=True,
        )
        reset = self.reset()
        self.expect(
            "V17 重置回種子",
            reset["imported"] > 0
            and len(self.call("GET", "/elders")) == 12
            and self.call("GET", "/assignments/mine", "u-vol-1") == [],
        )


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8003)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "artifacts/e2e-2026-11-08"
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    base = f"http://127.0.0.1:{args.port}"
    suite = Suite(base)
    try:
        # 拒絕占用中的埠，避免把其他人的伺服器當成測試環境。
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", args.port))
        with tempfile.TemporaryDirectory(prefix="townpass-e2e-") as directory:
            env = os.environ.copy()
            env.update(
                DATABASE_URL="sqlite:///" + (Path(directory) / "e2e.db").as_posix(),
                PYTHONPATH=str(ROOT / "services/backend/src"),
                MEAL_RELAY_MODE="demo",
            )
            with (args.output / "api-server.log").open("w", encoding="utf-8") as log:
                server = subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "townpass_backend.main:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(args.port),
                    ],
                    env=env,
                    cwd=ROOT / "services/backend",
                    stdout=log,
                    stderr=log,
                )
                try:
                    deadline = time.monotonic() + 30
                    while time.monotonic() < deadline:
                        if server.poll() is not None:
                            raise RuntimeError(
                                "測試伺服器啟動失敗，請看 api-server.log"
                            )
                        try:
                            with urlopen(base + "/health", timeout=1) as response:
                                if response.status == 200:
                                    break
                        except (URLError, TimeoutError):
                            time.sleep(0.1)  # 只等伺服器就緒，不用 sleep 驗證時間規則
                    else:
                        raise RuntimeError("測試伺服器未就緒")
                    suite.run()
                finally:
                    if os.name == "nt" and server.poll() is None:
                        # Windows 的 venv 啟動器可能另開 Python 子行程；一併結束自己啟動的樹。
                        subprocess.run(
                            ["taskkill", "/PID", str(server.pid), "/T", "/F"],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            check=False,
                        )
                    else:
                        server.terminate()
                    try:
                        server.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait(timeout=5)
    except (
        AssertionError,
        OSError,
        RuntimeError,
        ValueError,
        KeyError,
        StopIteration,
    ) as error:
        suite.expect("測試流程未預期中斷", False, repr(error))
    report = {
        "tested_at": datetime.now(UTC).isoformat(),
        "base_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "environment": "隔離 SQLite / localhost",
        "passed": sum(r["passed"] for r in suite.results),
        "failed": sum(not r["passed"] for r in suite.results),
        "checks": suite.results,
        "limitations": [
            "V9 過期、V16 任務逾時由固定時間的既有 pytest 覆蓋，本腳本不變更伺服器時間或 DB。",
            "QR 輪替不以等待驗證；此處驗證有效 QR、錯據點與竄改 token。",
            "此為 HTTP 全流程，Android 相機/bridge 與畫面由主代理另行驗證。",
        ],
        "http_requests": suite.http,
    }
    (args.output / "api-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"RESULT: {report['passed']} passed, {report['failed']} failed; {args.output / 'api-report.json'}"
    )
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
