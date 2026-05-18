from fastapi import APIRouter, Depends, UploadFile, File
from app.api.deps import get_current_user
from app.schemas.meetings import MeetingCreate, TranscriptPayload, TaskUpdate
from app.services.meeting_service import (
    create_meeting,
    delete_meeting,
    get_meeting,
    list_meetings,
    list_my_tasks,
    process_meeting,
    save_audio_file,
    set_manual_transcript,
    update_task,
)

router = APIRouter(tags=["meetings"])


@router.post("/meetings")
def create(payload: MeetingCreate, current_user: dict = Depends(get_current_user)):
    return create_meeting(
        user_id=current_user["id"],
        title=payload.title,
        participants=[p.model_dump() for p in payload.participants],
    )


@router.get("/meetings")
def list_all(current_user: dict = Depends(get_current_user)):
    return list_meetings(user_id=current_user["id"])


@router.get("/meetings/{meeting_id}")
def read(meeting_id: str, current_user: dict = Depends(get_current_user)):
    return get_meeting(meeting_id, user_id=current_user["id"], user_email=current_user.get("email", ""))


@router.delete("/meetings/{meeting_id}")
def delete_meeting_endpoint(meeting_id: str, current_user: dict = Depends(get_current_user)):
    return delete_meeting(meeting_id=meeting_id, user_id=current_user["id"])

@router.post("/meetings/{meeting_id}/upload-audio")
async def upload_audio(meeting_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    return await save_audio_file(meeting_id=meeting_id, user_id=current_user["id"], file=file)


@router.post("/meetings/{meeting_id}/transcript")
def set_transcript(meeting_id: str, payload: TranscriptPayload, current_user: dict = Depends(get_current_user)):
    return set_manual_transcript(meeting_id=meeting_id, user_id=current_user["id"], transcript=payload.transcript)


@router.post("/meetings/{meeting_id}/process")
async def process(meeting_id: str, current_user: dict = Depends(get_current_user)):
    return await process_meeting(meeting_id=meeting_id, user_id=current_user["id"])


# CRITICAL: /tasks/my MUST come BEFORE /tasks/{task_id}
# If it were after, FastAPI would capture "my" as task_id and return 404 or wrong data
@router.get("/tasks/my")
def my_tasks(current_user: dict = Depends(get_current_user)):
    return list_my_tasks(user_email=current_user.get("email", ""))


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, payload: TaskUpdate, current_user: dict = Depends(get_current_user)):
    return update_task(
        task_id=task_id,
        user_id=current_user["id"],
        user_email=current_user.get("email", ""),
        patch=payload.model_dump(exclude_unset=True),
    )
