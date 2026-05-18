from app.core.errors import AppError
from app.db.supabase import get_supabase_admin, get_supabase_auth_client


def verify_access_token(token: str) -> dict:
    if not token:
        raise AppError("Missing authorization token", status_code=401)
    try:
        auth_client = get_supabase_auth_client()
        result = auth_client.auth.get_user(token)
        user = result.user
        if not user:
            raise AppError("Invalid or expired token", status_code=401)
        return {"id": user.id, "email": user.email or ""}
    except AppError:
        raise
    except Exception as exc:
        raise AppError("Could not verify Supabase access token", status_code=401, details={"reason": str(exc)})


def ensure_profile(user: dict) -> dict:
    supabase = get_supabase_admin()
    user_id = user["id"]
    email = user.get("email") or ""

    try:
        existing = supabase.table("profiles").select("*").eq("id", user_id).execute()
        if existing.data:
            return existing.data[0]

        created = supabase.table("profiles").insert({
            "id": user_id,
            "email": email,
            "full_name": email.split("@")[0] if email else "User",
            "role": "manager",
        }).execute()
        if not created.data:
            raise AppError("Profile could not be created", status_code=500)
        return created.data[0]
    except AppError:
        raise
    except Exception as exc:
        raise AppError("Failed to load or create profile", status_code=500, details={"reason": str(exc)})
