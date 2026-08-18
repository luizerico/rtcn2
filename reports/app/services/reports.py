from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


ASSET_COLLECTIONS = (
    ("surveys", "SURVEY", "Survey"),
)


def _oid(value: str | None) -> ObjectId | None:
    if not value or not ObjectId.is_valid(value):
        return None
    return ObjectId(value)


def _date_filter(from_date: datetime | None, to_date: datetime | None) -> dict[str, Any]:
    created: dict[str, Any] = {}
    if from_date:
        created["$gte"] = from_date
    if to_date:
        created["$lte"] = to_date
    return {"createdAt": created} if created else {}


async def build_overview(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    users = await db.users.count_documents({})
    groups = await db.groups.count_documents({})
    permissions = await db.permissions.count_documents({})
    action_logs = await db.actionlogs.count_documents({})
    surveys = await db.surveys.count_documents({})
    survey_responses = await db.survey_responses.count_documents({})

    by_kind: list[dict[str, Any]] = []
    assets = 0
    for collection, kind, _asset_type in ASSET_COLLECTIONS:
        count = await db[collection].count_documents({})
        assets += count
        by_kind.append({"key": kind, "count": count})
    by_kind.sort(key=lambda row: row["count"], reverse=True)

    return {
        "users": users,
        "groups": groups,
        "assets": assets,
        "permissions": permissions,
        "actionLogs": action_logs,
        "surveys": surveys,
        "surveyResponses": survey_responses,
        "assetsByKind": by_kind,
    }


async def build_asset_summary(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    by_type: list[dict[str, Any]] = []
    recent_docs: list[dict[str, Any]] = []

    for collection, kind, asset_type in ASSET_COLLECTIONS:
        count = await db[collection].count_documents({})
        by_type.append({"kind": kind, "assetType": asset_type, "count": count})
        rows = (
            await db[collection]
            .find({}, {"name": 1, "kind": 1, "assetType": 1, "createdAt": 1, "ownerId": 1})
            .sort("createdAt", -1)
            .limit(20)
            .to_list(20)
        )
        for doc in rows:
            recent_docs.append(
                {
                    "id": str(doc["_id"]),
                    "name": doc.get("name") or "",
                    "kind": doc.get("kind") or kind,
                    "assetType": doc.get("assetType") or asset_type,
                    "createdAt": doc.get("createdAt"),
                    "ownerId": str(doc["ownerId"]) if doc.get("ownerId") else None,
                }
            )

    by_type.sort(key=lambda row: row["count"], reverse=True)
    recent_docs.sort(
        key=lambda row: row["createdAt"] or datetime.min,
        reverse=True,
    )

    return {
        "byType": by_type,
        "recent": recent_docs[:20],
    }


async def build_user_activity(
    db: AsyncIOMotorDatabase,
    *,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    match = _date_filter(from_date, to_date)
    pipeline: list[dict[str, Any]] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.extend(
        [
            {
                "$group": {
                    "_id": {"userId": "$userId", "username": "$username"},
                    "actions": {"$sum": 1},
                    "successes": {"$sum": {"$cond": ["$success", 1, 0]}},
                    "failures": {"$sum": {"$cond": ["$success", 0, 1]}},
                    "lastSeenAt": {"$max": "$createdAt"},
                }
            },
            {"$sort": {"actions": -1}},
            {"$limit": max(1, min(limit, 100))},
        ]
    )
    rows = await db.actionlogs.aggregate(pipeline).to_list(100)
    return [
        {
            "userId": str(row["_id"]["userId"]) if row["_id"].get("userId") else None,
            "username": row["_id"].get("username") or "anonymous",
            "actions": row["actions"],
            "successes": row["successes"],
            "failures": row["failures"],
            "lastSeenAt": row.get("lastSeenAt"),
        }
        for row in rows
    ]


async def build_action_log_summary(
    db: AsyncIOMotorDatabase,
    *,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> dict[str, Any]:
    match = _date_filter(from_date, to_date)
    base: list[dict[str, Any]] = [{"$match": match}] if match else []

    totals_pipeline = base + [
        {
            "$group": {
                "_id": None,
                "total": {"$sum": 1},
                "successes": {"$sum": {"$cond": ["$success", 1, 0]}},
                "failures": {"$sum": {"$cond": ["$success", 0, 1]}},
            }
        }
    ]
    by_resource = await db.actionlogs.aggregate(
        base
        + [
            {"$group": {"_id": "$resourceType", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 50},
        ]
    ).to_list(50)
    by_action = await db.actionlogs.aggregate(
        base
        + [
            {"$group": {"_id": "$action", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 50},
        ]
    ).to_list(50)
    totals_rows = await db.actionlogs.aggregate(totals_pipeline).to_list(1)
    totals = totals_rows[0] if totals_rows else {"total": 0, "successes": 0, "failures": 0}

    return {
        "total": totals.get("total", 0),
        "successes": totals.get("successes", 0),
        "failures": totals.get("failures", 0),
        "byResourceType": [
            {"key": row["_id"] or "UNKNOWN", "count": row["count"]} for row in by_resource
        ],
        "byAction": [{"key": row["_id"] or "UNKNOWN", "count": row["count"]} for row in by_action],
    }


async def build_group_membership_report(db: AsyncIOMotorDatabase) -> list[dict[str, Any]]:
    groups = await db.groups.find({}, {"name": 1, "description": 1, "members": 1, "createdAt": 1}).sort(
        "name", 1
    ).to_list(500)
    return [
        {
            "id": str(group["_id"]),
            "name": group.get("name") or "",
            "description": group.get("description") or "",
            "memberCount": len(group.get("members") or []),
            "createdAt": group.get("createdAt"),
        }
        for group in groups
    ]


async def build_survey_report(db: AsyncIOMotorDatabase, survey_id: str) -> dict[str, Any] | None:
    oid = _oid(survey_id)
    if not oid:
        return None

    survey = await db.surveys.find_one({"_id": oid})
    if not survey:
        return None

    responses = await db.survey_responses.find(
        {"surveyId": oid},
        {"createdBy": 1, "createdAt": 1, "answers": 1, "name": 1},
    ).sort("createdAt", -1).to_list(1000)

    questions = list(survey.get("questions") or [])
    questions.sort(key=lambda q: q.get("sortOrder") or 0)

    option_counts: dict[str, dict[str, int]] = {}
    text_totals: dict[str, int] = {}
    question_by_id = {str(q.get("questionId") or ""): q for q in questions if q.get("questionId")}

    for response in responses:
        for answer in response.get("answers") or []:
            qid = str(answer.get("questionId") or "")
            value = answer.get("value")
            if not qid:
                continue
            question = question_by_id.get(qid)
            qtype = (question or {}).get("type") or "text"
            if qtype == "text":
                text_totals[qid] = text_totals.get(qid, 0) + 1
            else:
                key = str(value)
                bucket = option_counts.setdefault(qid, {})
                bucket[key] = bucket.get(key, 0) + 1

    question_summaries = []
    for question in questions:
        qid = str(question.get("questionId") or "")
        qtype = question.get("type") or "text"
        if qtype == "text":
            total = text_totals.get(qid, 0)
            counts: list[dict[str, Any]] = []
        else:
            counts_map = option_counts.get(qid, {})
            total = sum(counts_map.values())
            counts = [{"option": k, "count": v} for k, v in sorted(counts_map.items())]
        question_summaries.append(
            {
                "questionId": qid,
                "prompt": question.get("prompt") or "",
                "type": qtype,
                "totalAnswered": total,
                "counts": counts,
            }
        )

    return {
        "surveyId": str(survey["_id"]),
        "name": survey.get("name") or "",
        "description": survey.get("description") or "",
        "responseCount": len(responses),
        "questionCount": len(questions),
        "questions": question_summaries,
        "recentResponses": [
            {
                "id": str(doc["_id"]),
                "createdBy": str(doc["createdBy"]) if doc.get("createdBy") else None,
                "createdAt": doc.get("createdAt"),
                "answerCount": len(doc.get("answers") or []),
            }
            for doc in responses[:25]
        ],
    }
