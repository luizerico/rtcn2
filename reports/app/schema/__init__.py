import strawberry

from app.schema.queries import Query

schema = strawberry.Schema(query=Query)
