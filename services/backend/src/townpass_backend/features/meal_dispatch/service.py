"""鄰食轉運站據點、報到與自動派送邏輯（M13、M15–M18）。"""

from datetime import datetime, timedelta
from secrets import token_hex

from sqlmodel import Session

import townpass_backend.features.meal_relay as mr


def list_stations(session: Session) -> list[mr.schemas.Station]:
    return [mr.to_station(row) for row in mr.repo.list_stations(session)]


def create_station(session: Session, body: mr.schemas.StationCreate) -> mr.schemas.Station:
    """T-140：後台新增據點，不建立帳號，也不接受客戶端報到密碼。"""
    row = mr.repo.create_station(
        session,
        mr.models.MealStation(
            id=mr.new_id("st"), name=body.name, address=body.address,
            lat=body.location.lat, lng=body.location.lng,
            source="管理員新增（模擬）", checkin_code=token_hex(16),
        ),
    )
    return mr.to_station(row)


def update_station(
    session: Session, station_id: str, body: mr.schemas.StationUpdate,
) -> mr.schemas.Station:
    row = mr.repo.get_station(session, station_id)
    if row is None:
        raise mr.MealError("NOT_FOUND", "找不到據點")
    changes = body.model_dump(exclude_unset=True)
    location = changes.pop("location", None)
    if location is not None:
        changes.update(lat=location["lat"], lng=location["lng"])
    return mr.to_station(mr.repo.update_station(session, row, **changes))


def delete_station(session: Session, station_id: str) -> None:
    row = mr.repo.get_station(session, station_id)
    if row is None:
        raise mr.MealError("NOT_FOUND", "找不到據點")
    if mr.repo.station_has_references(session, station_id):
        raise mr.MealError(
            "STATION_IN_USE", "據點仍有長者、帳號、報到或任務紀錄，無法刪除", status=409,
        )
    mr.repo.delete_station(session, row)


def get_my_station(session: Session, account: mr.models.MealAccount) -> mr.schemas.MyStation:
    station = mr.repo.get_station(session, account.station_id or "")
    if station is None:
        raise mr.MealError("NOT_FOUND", "找不到帳號所屬據點")
    today = mr.local_day_start()
    checkins = mr.repo.list_checkins(session, station_id=station.id, since=today)
    return mr.schemas.MyStation(
        station=mr.to_station(station),
        qr_text=mr.station_qr_text(station),
        qr_expires_at=mr.qr_expires_at(),
        checkins=[mr.to_checkin(session, row) for row in checkins],
    )


def my_assignments(
    session: Session, account: mr.models.MealAccount
) -> list[mr.schemas.Assignment]:
    assignments = mr.repo.list_assignments(session, status="assigned", volunteer_id=account.id)
    at = mr.now()
    return [mr.to_assignment(session, row, at) for row in __ordered_assignments(session, account, assignments, at)]


def __ordered_assignments(
    session: Session,
    account: mr.models.MealAccount,
    assignments: list[mr.models.MealAssignment],
    at: datetime,
) -> list[mr.models.MealAssignment]:
    """依 M16 的主要志工、未見天數與距離排序，供各任務端點共用。"""
    station = mr.repo.get_station(session, account.station_id or "")
    if station is None:
        raise mr.MealError("NOT_FOUND", "找不到帳號所屬據點")
    today = mr.local_day_start(at)
    checked_in_today = {
        row.volunteer_id for row in mr.repo.list_checkins(session, since=today)
    }
    priority_rows = []
    for assignment in assignments:
        elder = mr.repo.get_elder(session, assignment.elder_id)
        if elder is None:
            raise mr.MealError("NOT_FOUND", f"找不到任務 {assignment.id} 的長者")
        primary = elder.primary_volunteer_id
        group = (
            0
            if primary == account.id
            else 1
            if primary is None
            else 2
            if primary not in checked_in_today
            else 3
        )
        last_seen = elder.last_seen_at.timestamp() if elder.last_seen_at else float("-inf")
        priority_rows.append(
            (group, last_seen, mr.distance_m(station, elder), elder.id, assignment)
        )
    priority_rows.sort(key=lambda row: row[:4])
    return [row[4] for row in priority_rows]


def check_in(
    session: Session, account: mr.models.MealAccount, qr_text: str
) -> mr.schemas.CheckInResult:
    """驗證 QR 後報到並派送長者與合適食物。"""
    at = mr.now()
    station = mr.verify_qr_text(session, qr_text, account, at)  # M15
    today = mr.local_day_start(at)
    previous = mr.repo.list_checkins(session, volunteer_id=account.id, since=today)
    if previous:
        checkin = previous[-1]
        active = mr.repo.list_assignments(session, status="assigned", volunteer_id=account.id)
        return mr.schemas.CheckInResult(
            checkin=mr.to_checkin(session, checkin),
            station=mr.to_station(station),
            assignments=[
                mr.to_assignment(session, row, at)
                for row in __ordered_assignments(session, account, active, at)
            ],
        )

    checkin = mr.repo.create_checkin(
        session,
        mr.models.MealCheckin(
            id=mr.new_id("ck"), volunteer_id=account.id, station_id=station.id, checked_in_at=at
        ),
        commit=False,
    )

    checked_in_today = {
        row.volunteer_id for row in mr.repo.list_checkins(session, since=today)
    }
    held_elder_ids = {
        row.elder_id for row in mr.repo.list_assignments(session, status="assigned")
    }
    candidates = []
    for elder in mr.repo.list_elders(session, station_id=station.id):
        if elder.id in held_elder_ids:
            continue
        flags = mr.elder_flags(session, elder, at)
        if not flags.alert:
            continue
        primary = elder.primary_volunteer_id
        if primary and primary in checked_in_today and primary != account.id:
            continue
        group = 0 if primary == account.id else 1 if primary is None else 2
        last_seen = elder.last_seen_at.timestamp() if elder.last_seen_at else float("-inf")
        candidates.append(
            (group, last_seen, mr.distance_m(station, elder), elder.id, elder, flags)
        )
    candidates.sort(key=lambda item: item[:4])  # M16：主要志工優先、較久未見、較近據點

    assignments = []
    for _, _, _, _, elder, flags in candidates[: mr.settings().DISPATCH_LIMIT]:
        assignment = mr.repo.create_assignment(
            session,
            mr.models.MealAssignment(
                id=mr.new_id("as"),
                checkin_id=checkin.id,
                volunteer_id=account.id,
                elder_id=elder.id,
                station_id=station.id,
                needs_meal=flags.meal_due,
                needs_care=flags.care_due,
                status="assigned",
                assigned_at=at,
                expires_at=at + timedelta(minutes=mr.settings().ASSIGNMENT_TTL_MIN),
            ),
            commit=False,
        )
        if flags.meal_due:
            food = __available_food(session, station, elder, at)
            if food is not None:
                if mr.allergen_conflict(food, elder):
                    raise mr.MealError("ALLERGEN_CONFLICT", "食物含有長者過敏原")
                claim = mr.repo.create_claim(
                    session,
                    mr.models.MealClaim(
                        id=mr.new_id("c"),
                        food_id=food.id,
                        elder_id=elder.id,
                        qty=1,
                        method="delivery",
                        status="claimed",
                        requested_by=account.id,
                        volunteer_id=account.id,
                        assignment_id=assignment.id,
                        created_at=at,
                        claimed_at=at,
                    ),
                    commit=False,
                )
                assignment = mr.repo.update_assignment(
                    session, assignment, commit=False, claim_id=claim.id
                )
        assignments.append(assignment)

    mr.repo.commit(session)
    return mr.schemas.CheckInResult(
        checkin=mr.to_checkin(session, checkin),
        station=mr.to_station(station),
        assignments=[
            mr.to_assignment(session, row, at)
            for row in __ordered_assignments(session, account, assignments, at)
        ],
    )


def __available_food(
    session: Session,
    station: mr.models.MealStation,
    elder: mr.models.MealElder,
    at: datetime,
) -> mr.models.MealFood | None:
    foods = []
    for food in mr.repo.list_foods(session, include_closed=False):
        if mr.food_status(food, mr.food_remaining(session, food), at) != "open":
            continue
        if mr.allergen_conflict(food, elder):
            continue
        point = mr.repo.get_point(session, food.point_id)
        if point is None:
            continue
        foods.append((mr.distance_m(station, point), food.expires_at, food.id, food))
    foods.sort(key=lambda item: item[:3])  # M17：據點距離、到期時間
    return foods[0][3] if foods else None
