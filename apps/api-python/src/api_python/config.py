from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    database_url: str
    redis_url: str

    jwt_secret: str
    jwt_expires_in: str

    jwt_refresh_secret: str
    jwt_refresh_expires_in: str

    llm_provider: str

    openai_api_key: str = ""
    openai_model: str = ""

    google_api_key: str = ""
    google_model: str = ""

    anthropic_api_key: str = ""
    anthropic_model: str = ""

    langgraph_database_url: str = ""

    analysis_service_url: str = ""

    cors_origin: str = ""

    port: int = 3000

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()