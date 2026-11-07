"""LOGIC LAYER - 管理員看板（合約 docs/system/11-meal-relay.md v2.2 §8 `getBoard`，T-113）。

只組裝與統計，不重寫共用規則：剩餘份數與食物狀態（M1）、長者警示（M10）都用
`townpass_backend.features.meal_relay` 的 `to_food()`、`to_elder()` 算；資料一律經過 `meal_relay.repo`。

`stats` 的算法（「今天」= 台北時間 +08:00 的 0 點起，`local_day_start()`）：
- `foods_open`：`status = open` 的食物數（M1）
- `delivered_today`：今天 `done_at` 的 `done` 申請份數合計（M1 的「已送達」；M3 每筆 1 份，等於筆數）
- `seen_today`：今天有 `seen` 拜訪回報的長者人數（同一位長者見到兩次算 1 位）
- `alerts`：`alert = true` 的長者數（M10）
- `checkins_today`：今天報到的志工人數（同一位志工重複報到算 1 位）

長者一律不含 `merged_into` 有值的（M13，repo 預設就排除）；申請不含 `cancelled`。
"""

from datetime import datetime

from sqlmodel import Session

from townpass_backend.features.meal_relay import (
    local_day_start,
    now,
    repo,
    schemas,
    to_claim,
    to_elder,
    to_food,
    to_point,
    to_station,
)


def get_board(session: Session, at: datetime | None = None) -> schemas.Board:
    """GET /board（admin）。`at` 給測試固定時間用；refresh（M20）已由 CurrentAccount 先跑。"""
    t = at or now()
    since = local_day_start(t)  # 「今天」以 +08:00 判斷

    foods = [to_food(session, f, t) for f in repo.list_foods(session)]
    elders = [to_elder(session, e, t) for e in repo.list_elders(session)]  # 不含已合併（M13）
    claims = repo.list_claims(session, exclude_status="cancelled")

    open_by_point: dict[str, int] = {}
    for f in foods:
        if f.status == "open":
            open_by_point[f.point_id] = open_by_point.get(f.point_id, 0) + 1

    return schemas.Board(
        stations=[to_station(s) for s in repo.list_stations(session)],
        points=[to_point(p, open_by_point.get(p.id, 0)) for p in repo.list_points(session)],
        foods=foods,
        elders=elders,
        claims=[to_claim(session, c, t) for c in claims],
        stats=__stats(session, foods, elders, since, t),
    )


def __stats(
    session: Session, foods: list[schemas.Food], elders: list[schemas.Elder], since: datetime, at: datetime
) -> schemas.BoardStats:
    elder_ids = {e.id for e in elders}
    delivered = sum(
        c.qty
        for c in repo.list_claims(session, status="done")
        if c.done_at is not None and since <= c.done_at <= at
    )
    seen = {
        v.elder_id
        for v in repo.list_visits(session, since=since)
        if v.result == "seen" and v.visited_at <= at and v.elder_id in elder_ids
    }
    volunteers = {c.volunteer_id for c in repo.list_checkins(session, since=since) if c.checked_in_at <= at}
    return schemas.BoardStats(
        foods_open=sum(f.status == "open" for f in foods),  # M1
        delivered_today=delivered,
        seen_today=len(seen),
        alerts=sum(e.alert for e in elders),  # M10
        checkins_today=len(volunteers),
    )
