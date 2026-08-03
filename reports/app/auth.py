from dataclasses import dataclass

import jwt
from fastapi import Request
from strawberry.types import Info

from app.config import get_settings


class AuthError(Exception):
    def __init__(self, message: str = "Unauthorized"):
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class AuthUser:
    user_id: str
    username: str


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def decode_token(token: str) -> AuthUser:
    settings = get_settings()
    if not settings.jwt_secret:
        raise AuthError("JWT_SECRET is not configured on the reports service")

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired token") from exc

    user_id = payload.get("id") or payload.get("sub") or payload.get("_id")
    username = payload.get("username") or payload.get("name") or ""
    if not user_id:
        raise AuthError("Token missing user identity")

    return AuthUser(user_id=str(user_id), username=str(username))


def require_user(info: Info) -> AuthUser | None:
    settings = get_settings()
    request: Request = info.context["request"]
    token = _extract_bearer(request)

    if not token:
        if settings.require_auth:
            raise AuthError("Missing Authorization Bearer token")
        return None

    return decode_token(token)
