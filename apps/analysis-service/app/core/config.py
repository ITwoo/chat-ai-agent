from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    analysis_database_url: str

    analysis_ml_forecast_enabled: bool = False
    analysis_ml_forecast_alpha: float = 1.0
    analysis_ml_forecast_min_samples: int = 60
    
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()