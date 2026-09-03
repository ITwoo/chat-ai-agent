from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    analysis_database_url: str

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()