"""長者名冊與拜訪回報的業務邏輯；共用規則與資料存取經 meal_relay 套件根使用。"""

from sqlmodel import Session

from townpass_backend.features.meal_relay import (
    CANCEL_RETURNED,
    MealError,
    ensure_assigned_elder,
    models,
    new_id,
    now,
    refresh,
    repo,
    schemas,
    to_elder,
    to_utc,
    to_visit,
)


def list_elders(session: Session) -> list[schemas.Elder]:
    """管理員名冊；repo 預設排除 merged_into 有值的資料。"""
    return [to_elder(session, elder) for elder in repo.list_elders(session)]


def create_elder(session: Session, account: models.MealAccount, payload: schemas.ElderCreate) -> schemas.Elder:
    """建立模擬長者資料（ADR-024、M12）。"""
    if repo.get_station(session, payload.station_id) is None:
        raise MealError("NOT_FOUND", "找不到這個據點")
    at = now()
    elder = models.MealElder(
        id=new_id("e"),
        alias=payload.alias,
        address=(payload.address or "").strip(),
        station_id=payload.station_id,
        lat=payload.location.lat,
        lng=payload.location.lng,
        allergens=list(payload.allergens),
        created_by=account.id,
        created_at=at,
        next_care_at=to_utc(payload.next_care_at) if payload.next_care_at else None,
        next_meal_at=to_utc(payload.next_meal_at) if payload.next_meal_at else None,
    )
    return to_elder(session, repo.create_elder(session, elder))


def update_elder(session: Session, elder_id: str, payload: schemas.ElderUpdate) -> schemas.Elder:
    """修改名冊中有提供的欄位。"""
    elder = repo.get_elder(session, elder_id)
    if elder is None or elder.merged_into is not None:
        raise MealError("NOT_FOUND", "找不到這位長者")
    changes = payload.model_dump(exclude_unset=True)
    location = changes.pop("location", None)
    if any(changes.get(key) is None for key in ("alias", "allergens", "station_id") if key in changes):
        raise MealError("VALIDATION_ERROR", "代號、過敏原與據點不可為空")
    if "address" in changes:
        changes["address"] = (changes["address"] or "").strip()  # null 代表清除地址
    if location is not None:
        changes["lat"] = location.lat
        changes["lng"] = location.lng
    if (
        "station_id" in changes
        and changes["station_id"] is not None
        and repo.get_station(session, changes["station_id"]) is None
    ):
        raise MealError("NOT_FOUND", "找不到這個據點")
    for key in ("next_care_at", "next_meal_at"):
        if changes.get(key) is not None:
            changes[key] = to_utc(changes[key])
    updated = repo.update_elder(session, elder, **changes)
    return to_elder(session, updated)


def report_visit(
    session: Session, account: models.MealAccount, payload: schemas.VisitCreate
) -> schemas.Visit:
    """依 M9、M11、M13 回報拜訪；完成後 M18 refresh 會關閉任務。"""
    assignment = ensure_assigned_elder(session, account, payload.elder_id)
    elder = repo.get_elder(session, payload.elder_id)
    if elder is None or elder.merged_into is not None:
        raise MealError("NOT_FOUND", "找不到這位長者")

    claim = repo.get_claim(session, assignment.claim_id) if assignment.claim_id else None
    if payload.claim_id is not None and (claim is None or payload.claim_id != claim.id):
        raise MealError("INVALID_STATE", "拜訪申請與任務不相符")

    if payload.result == "left_at_door":
        if payload.kind != "meal":
            raise MealError("VALIDATION_ERROR", "放門口只能用於送餐回報")
        if not payload.photo_image_id:
            raise MealError("PHOTO_REQUIRED", "放門口回報必須附照片")
        if claim is not None:
            food = repo.get_food(session, claim.food_id)
            if food is not None and food.category == "produce":
                raise MealError("FRESH_CANNOT_LEAVE", "生鮮蔬果不能放門口")

    visited_at = now()
    visit = models.MealVisit(
        id=new_id("vi"),
        elder_id=elder.id,
        volunteer_id=account.id,
        kind=payload.kind,
        claim_id=claim.id if claim else None,
        assignment_id=assignment.id,
        result=payload.result,
        photo_image_id=payload.photo_image_id,
        visited_at=visited_at,
    )

    elder_changes: dict[str, object] = {}
    if payload.result in ("seen", "left_at_door"):
        elder_changes["primary_volunteer_id"] = account.id
    if payload.result == "seen":
        elder_changes["last_seen_at"] = visited_at
        elder_changes["next_care_at"] = (
            to_utc(payload.next_care_at) if payload.next_care_at is not None else None
        )
    if payload.kind == "meal" and payload.result in ("seen", "left_at_door"):
        elder_changes["last_meal_at"] = visited_at
        elder_changes["next_meal_at"] = (
            to_utc(payload.next_meal_at) if payload.next_meal_at is not None else None
        )
    repo.update_elder(session, elder, commit=False, **elder_changes)

    if claim is not None:
        if payload.result in ("seen", "left_at_door") and payload.kind == "meal":
            repo.update_claim(session, claim, commit=False, status="done", done_at=visited_at)
        elif payload.result == "returned":
            repo.update_claim(
                session, claim, commit=False, status="cancelled", cancel_reason=CANCEL_RETURNED
            )

    saved_visit = repo.create_visit(session, visit, commit=False)
    refresh(session, visited_at)  # M18：拜訪後任務立即完成
    return to_visit(saved_visit)
