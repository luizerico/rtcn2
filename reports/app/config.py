from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    mongo_uri: str = Field(default="mongodb://localhost:27017/projects")
    mongodb_uri: str | None = None
    db_name: str = "projects"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000"
    require_auth: bool = True

    @model_validator(mode="after")
    def prefer_mongodb_uri(self) -> "Settings":
        if self.mongodb_uri and not self.mongo_uri.startswith("mongodb"):
            self.mongo_uri = self.mongodb_uri
        elif self.mongodb_uri and self.mongo_uri == "mongodb://localhost:27017/projects":
            self.mongo_uri = self.mongodb_uri
        return self

    @property
    def database_uri(self) -> str:
        return self.mongodb_uri or self.mongo_uri

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
