from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    env_name: str = ""
    node_env: str = ""

    database_url: str
    redis_url: str

    jwt_secret: str
    jwt_expires_in: int = 60 * 60

    jwt_refresh_secret: str
    jwt_refresh_expires_in: int = 60 * 60 * 24 * 7

    llm_provider: str = "openai"

    openai_api_key: str
    openai_model: str

    google_api_key: str
    google_model: str

    anthropic_api_key: str
    anthropic_model: str

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3.5:4b"

    langgraph_database_url: str
    mcp_analysis_server_url: str
    analysis_service_url: str

    rag_upload_dir: str = "uploads/rag"
    rag_file_storage: str = "local"

    rag_s3_bucket: str = ""
    rag_s3_prefix: str = "rag"
    aws_region: str = ""

    rag_eval_disable_memory: bool = False

    port: int = 3000

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()