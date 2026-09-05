from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    database_url: str = "postgres://rmw:rmw_local_dev@localhost:5433/rm_workbench"
    dataset_today: str = "2026-08-26"
    service_version: str = "0.1.0"


settings = Settings()
