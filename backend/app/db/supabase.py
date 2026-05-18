from functools import lru_cache
from supabase import Client, create_client
from app.core.config import get_settings
from app.core.errors import AppError


@lru_cache
def get_supabase_admin() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service configuration is missing", status_code=500)
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache
def get_supabase_auth_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise AppError("Supabase auth configuration is missing", status_code=500)
    return create_client(settings.supabase_url, settings.supabase_anon_key)
