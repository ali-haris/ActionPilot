from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ActionPilot API"
    environment: str = "development"
    frontend_origin: str = "http://localhost:5173"
    upload_dir: str = "uploads"
    max_upload_mb: int = 50

    supabase_url: str = Field(default="")
    supabase_anon_key: str = Field(default="")
    supabase_service_role_key: str = Field(default="")

    gemini_api_key: str = Field(default="")
    gemini_model: str = "gemini-2.5-flash"

    speechmatics_api_key: str = Field(default="")
    speechmatics_language: str = "en"
    speechmatics_enable_diarization: bool = True
    speechmatics_timeout_seconds: int = 600

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()
