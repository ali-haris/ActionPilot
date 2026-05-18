from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.auth_service import ensure_profile, verify_access_token

security = HTTPBearer(auto_error=True)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    user = verify_access_token(credentials.credentials)
    profile = ensure_profile(user)
    return {**user, "profile": profile}
