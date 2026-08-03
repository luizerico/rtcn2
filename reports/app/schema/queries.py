from __future__ import annotations

from datetime import datetime

import strawberry

from app.auth import AuthError, require_user
from app.db import get_db
from app.services import reports as report_service


@strawberry.type
class CountBucket:
    key: str
    count: int


@strawberry.type
class OverviewReport:
    users: int
    groups: int
    assets: int
    permissions: int
    action_logs: int
    surveys: int
    survey_responses: int
    assets_by_kind: list[CountBucket]


@strawberry.type
class AssetTypeCount:
    kind: str
    asset_type: str
    count: int


@strawberry.type
class RecentAsset:
    id: strawberry.ID
    name: str
    kind: str
    asset_type: str
    created_at: datetime | None
    owner_id: strawberry.ID | None


@strawberry.type
class AssetSummaryReport:
    by_type: list[AssetTypeCount]
    recent: list[RecentAsset]


@strawberry.type
class UserActivityRow:
    user_id: strawberry.ID | None
    username: str
    actions: int
    successes: int
    failures: int
    last_seen_at: datetime | None


@strawberry.type
class ActionLogSummaryReport:
    total: int
    successes: int
    failures: int
    by_resource_type: list[CountBucket]
    by_action: list[CountBucket]


@strawberry.type
class GroupMembershipRow:
    id: strawberry.ID
    name: str
    description: str
    member_count: int
    created_at: datetime | None


@strawberry.type
class OptionCount:
    option: str
    count: int


@strawberry.type
class SurveyQuestionSummary:
    question_id: strawberry.ID
    prompt: str
    type: str
    total_answered: int
    counts: list[OptionCount]


@strawberry.type
class SurveyRecentResponse:
    id: strawberry.ID
    created_by: strawberry.ID | None
    created_at: datetime | None
    answer_count: int


@strawberry.type
class SurveyReport:
    survey_id: strawberry.ID
    name: str
    description: str
    response_count: int
    question_count: int
    questions: list[SurveyQuestionSummary]
    recent_responses: list[SurveyRecentResponse]


def _ensure_auth(info: strawberry.Info) -> None:
    try:
        require_user(info)
    except AuthError as exc:
        raise Exception(exc.message) from exc


@strawberry.type
class Query:
    @strawberry.field(description="High-level platform counts for dashboards.")
    async def overview(self, info: strawberry.Info) -> OverviewReport:
        _ensure_auth(info)
        data = await report_service.build_overview(get_db())
        return OverviewReport(
            users=data["users"],
            groups=data["groups"],
            assets=data["assets"],
            permissions=data["permissions"],
            action_logs=data["actionLogs"],
            surveys=data["surveys"],
            survey_responses=data["surveyResponses"],
            assets_by_kind=[CountBucket(**row) for row in data["assetsByKind"]],
        )

    @strawberry.field(description="Asset inventory broken down by kind and type.")
    async def asset_summary(self, info: strawberry.Info) -> AssetSummaryReport:
        _ensure_auth(info)
        data = await report_service.build_asset_summary(get_db())
        return AssetSummaryReport(
            by_type=[
                AssetTypeCount(
                    kind=row["kind"],
                    asset_type=row["assetType"],
                    count=row["count"],
                )
                for row in data["byType"]
            ],
            recent=[
                RecentAsset(
                    id=strawberry.ID(row["id"]),
                    name=row["name"],
                    kind=row["kind"],
                    asset_type=row["assetType"],
                    created_at=row["createdAt"],
                    owner_id=strawberry.ID(row["ownerId"]) if row["ownerId"] else None,
                )
                for row in data["recent"]
            ],
        )

    @strawberry.field(description="Top users by recorded API actions.")
    async def user_activity(
        self,
        info: strawberry.Info,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int = 20,
    ) -> list[UserActivityRow]:
        _ensure_auth(info)
        rows = await report_service.build_user_activity(
            get_db(),
            from_date=from_date,
            to_date=to_date,
            limit=limit,
        )
        return [
            UserActivityRow(
                user_id=strawberry.ID(row["userId"]) if row["userId"] else None,
                username=row["username"],
                actions=row["actions"],
                successes=row["successes"],
                failures=row["failures"],
                last_seen_at=row["lastSeenAt"],
            )
            for row in rows
        ]

    @strawberry.field(description="Aggregated action-log metrics for a time window.")
    async def action_log_summary(
        self,
        info: strawberry.Info,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> ActionLogSummaryReport:
        _ensure_auth(info)
        data = await report_service.build_action_log_summary(
            get_db(),
            from_date=from_date,
            to_date=to_date,
        )
        return ActionLogSummaryReport(
            total=data["total"],
            successes=data["successes"],
            failures=data["failures"],
            by_resource_type=[CountBucket(**row) for row in data["byResourceType"]],
            by_action=[CountBucket(**row) for row in data["byAction"]],
        )

    @strawberry.field(description="Groups with membership counts.")
    async def group_membership(self, info: strawberry.Info) -> list[GroupMembershipRow]:
        _ensure_auth(info)
        rows = await report_service.build_group_membership_report(get_db())
        return [
            GroupMembershipRow(
                id=strawberry.ID(row["id"]),
                name=row["name"],
                description=row["description"],
                member_count=row["memberCount"],
                created_at=row["createdAt"],
            )
            for row in rows
        ]

    @strawberry.field(description="Survey response analytics for one survey.")
    async def survey_report(
        self,
        info: strawberry.Info,
        survey_id: strawberry.ID,
    ) -> SurveyReport | None:
        _ensure_auth(info)
        data = await report_service.build_survey_report(get_db(), str(survey_id))
        if not data:
            return None
        return SurveyReport(
            survey_id=strawberry.ID(data["surveyId"]),
            name=data["name"],
            description=data["description"],
            response_count=data["responseCount"],
            question_count=data["questionCount"],
            questions=[
                SurveyQuestionSummary(
                    question_id=strawberry.ID(q["questionId"]),
                    prompt=q["prompt"],
                    type=q["type"],
                    total_answered=q["totalAnswered"],
                    counts=[OptionCount(**c) for c in q["counts"]],
                )
                for q in data["questions"]
            ],
            recent_responses=[
                SurveyRecentResponse(
                    id=strawberry.ID(r["id"]),
                    created_by=strawberry.ID(r["createdBy"]) if r["createdBy"] else None,
                    created_at=r["createdAt"],
                    answer_count=r["answerCount"],
                )
                for r in data["recentResponses"]
            ],
        )
