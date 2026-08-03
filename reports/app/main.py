from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from strawberry.fastapi import GraphQLRouter

from app.config import get_settings
from app.db import close_db, ping_db
from app.schema import schema


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await ping_db()
    yield
    await close_db()


async def get_context(request: Request, response: Response) -> dict:
    return {"request": request, "response": response}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Projects Reports API",
        description="GraphQL reporting service for the RBAC platform.",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    graphql_app = GraphQLRouter(schema, context_getter=get_context)
    app.include_router(graphql_app, prefix="/graphql")

    @app.get("/health")
    async def health():
        try:
            await ping_db()
            db_ok = True
        except Exception:
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "service": "reports",
            "database": "up" if db_ok else "down",
        }

    return app


app = create_app()
