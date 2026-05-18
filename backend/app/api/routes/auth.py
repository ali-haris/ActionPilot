from fastapi import APIRouter, Depends
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user
