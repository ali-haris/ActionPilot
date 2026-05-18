import tempfile
from pathlib import Path
from uuid import uuid4
from fastapi import UploadFile
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.supabase import get_supabase_admin
from app.services.gemini_service import analyze_meeting_transcript
from app.services.speechmatics_service import transcribe_audio_with_speechmatics

ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
SUPABASE_BUCKET = "meeting-audio"


def _safe_execute(operation_name: str, func):
    try:
        return func()
    except AppError:
        raise
    except Exception as exc:
        raise AppError(f"Database operation failed: {operation_name}", status_code=500, details={"reason": str(exc)})


def create_meeting(user_id: str, title: str, participants: list[dict]) -> dict:
    supabase = get_supabase_admin()

    def op():
        created = supabase.table("meetings").insert({"owner_id": user_id, "title": title}).execute()
        if not created.data:
            raise AppError("Meeting could not be created", status_code=500)

        meeting_id = created.data[0]["id"]
        if participants:
            parts_data = []
            for p in participants:
                parts_data.append({
                    "meeting_id": meeting_id,
                    "name": p.get("name") or "Unknown",
                    "email": p.get("email"),
                    "speaker_label": p.get("speaker_label"),
                })
            supabase.table("meeting_participants").insert(parts_data).execute()
        return created.data[0]

    return _safe_execute("create_meeting", op)


def delete_meeting(meeting_id: str, user_id: str) -> dict:
    supabase = get_supabase_admin()

    def op():
        meeting_result = supabase.table("meetings").select("owner_id").eq("id", meeting_id).execute()
        if not meeting_result.data:
            raise AppError("Meeting not found", status_code=404)
        if meeting_result.data[0]["owner_id"] != user_id:
            raise AppError("Only the meeting owner can delete this meeting", status_code=403)
            
        # Delete related records first to prevent foreign key constraint errors
        supabase.table("tasks").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("decisions").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("risks").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("email_drafts").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("meeting_participants").delete().eq("meeting_id", meeting_id).execute()
        
        # Finally delete the meeting itself
        supabase.table("meetings").delete().eq("id", meeting_id).execute()
        return {"success": True, "message": "Meeting deleted"}

    return _safe_execute("delete_meeting", op)


def list_meetings(user_id: str) -> list[dict]:
    supabase = get_supabase_admin()

    def op():
        return supabase.table("meetings").select("*").eq("owner_id", user_id).order("created_at", desc=True).execute().data or []

    return _safe_execute("list_meetings", op)


def get_meeting(meeting_id: str, user_id: str, user_email: str) -> dict:
    supabase = get_supabase_admin()

    def op():
        meeting_result = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_result.data:
            raise AppError("Meeting not found", status_code=404)
        meeting = meeting_result.data[0]

        is_owner = meeting.get("owner_id") == user_id
        if not is_owner:
            assigned = supabase.table("tasks").select("id").eq("meeting_id", meeting_id).eq("assigned_to_email", user_email).limit(1).execute()
            if not assigned.data:
                raise AppError("You do not have access to this meeting", status_code=403)

        meeting["participants"] = supabase.table("meeting_participants").select("*").eq("meeting_id", meeting_id).execute().data or []
        meeting["decisions"] = supabase.table("decisions").select("*").eq("meeting_id", meeting_id).order("created_at").execute().data or []
        meeting["risks"] = supabase.table("risks").select("*").eq("meeting_id", meeting_id).order("created_at").execute().data or []
        meeting["tasks"] = supabase.table("tasks").select("*").eq("meeting_id", meeting_id).order("created_at").execute().data or []
        meeting["email_drafts"] = supabase.table("email_drafts").select("*").eq("meeting_id", meeting_id).order("created_at", desc=True).execute().data or []
        meeting["is_owner"] = is_owner
        return meeting

    return _safe_execute("get_meeting", op)


async def save_audio_file(meeting_id: str, user_id: str, file: UploadFile) -> dict:
    settings = get_settings()
    supabase = get_supabase_admin()

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise AppError("Unsupported audio format", status_code=400, details={"allowed": sorted(ALLOWED_AUDIO_EXTENSIONS)})

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise AppError("Uploaded file is too large", status_code=413, details={"max_mb": settings.max_upload_mb})

    def owner_check():
        meeting = supabase.table("meetings").select("id, owner_id").eq("id", meeting_id).execute()
        if not meeting.data:
            raise AppError("Meeting not found", status_code=404)
        if meeting.data[0]["owner_id"] != user_id:
            raise AppError("Only the meeting owner can upload audio", status_code=403)

    _safe_execute("upload_owner_check", owner_check)

    # Upload to Supabase Storage bucket — no local disk dependency
    storage_path = f"{meeting_id}/{uuid4().hex}{extension}"
    content_type_map = {
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
        ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
        ".webm": "audio/webm",
    }
    content_type = content_type_map.get(extension, "audio/octet-stream")

    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        # Create a long-lived signed URL (7 days) so Speechmatics can fetch the file
        signed = supabase.storage.from_(SUPABASE_BUCKET).create_signed_url(storage_path, expires_in=604800)
        audio_url = signed.get("signedURL") or signed.get("signedUrl") or ""
    except Exception as exc:
        raise AppError("Failed to upload audio to Supabase Storage", status_code=500, details={"reason": str(exc)})

    def update():
        result = supabase.table("meetings").update({
            "audio_file_path": audio_url,
            "status": "uploaded",
            "processing_error": None,
        }).eq("id", meeting_id).execute()
        return result.data[0] if result.data else {"audio_file_path": audio_url}

    return _safe_execute("save_audio_file", update)


def set_manual_transcript(meeting_id: str, user_id: str, transcript: str) -> dict:
    supabase = get_supabase_admin()

    def op():
        meeting = supabase.table("meetings").select("id, owner_id").eq("id", meeting_id).execute()
        if not meeting.data:
            raise AppError("Meeting not found", status_code=404)
        if meeting.data[0]["owner_id"] != user_id:
            raise AppError("Only the meeting owner can set transcript", status_code=403)
        result = supabase.table("meetings").update({
            "transcript_text": transcript,
            "status": "uploaded",
            "processing_error": None,
        }).eq("id", meeting_id).execute()
        return result.data[0]

    return _safe_execute("set_manual_transcript", op)


async def process_meeting(meeting_id: str, user_id: str) -> dict:
    supabase = get_supabase_admin()

    def load():
        meeting_result = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_result.data:
            raise AppError("Meeting not found", status_code=404)
        meeting = meeting_result.data[0]
        if meeting["owner_id"] != user_id:
            raise AppError("Only the meeting owner can process this meeting", status_code=403)
        participants = supabase.table("meeting_participants").select("*").eq("meeting_id", meeting_id).execute().data or []
        return meeting, participants

    meeting, participants = _safe_execute("load_meeting_for_processing", load)

    try:
        supabase.table("meetings").update({"status": "processing", "processing_error": None}).eq("id", meeting_id).execute()

        transcript = meeting.get("transcript_text")
        if not transcript:
            audio_path = meeting.get("audio_file_path")
            if not audio_path:
                raise AppError("No audio or transcript found for this meeting", status_code=400)
            transcript = await transcribe_audio_with_speechmatics(audio_path)
            supabase.table("meetings").update({"transcript_text": transcript}).eq("id", meeting_id).execute()

        analysis = analyze_meeting_transcript(transcript, participants=participants)

        # Clear previous generated data for repeatable processing.
        supabase.table("decisions").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("risks").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("tasks").delete().eq("meeting_id", meeting_id).execute()
        supabase.table("email_drafts").delete().eq("meeting_id", meeting_id).execute()

        decision_rows = [
            {
                "meeting_id": meeting_id,
                "decision": d.get("decision", "").strip(),
                "confidence": (d.get("confidence") or "medium").lower(),
                "mentioned_by": d.get("mentioned_by"),
            }
            for d in analysis.get("decisions", [])
            if d.get("decision")
        ]
        if decision_rows:
            supabase.table("decisions").insert(decision_rows).execute()

        risk_rows = [
            {
                "meeting_id": meeting_id,
                "risk": r.get("risk", "").strip(),
                "severity": (r.get("severity") or "medium").lower(),
                "suggested_action": r.get("suggested_action"),
            }
            for r in analysis.get("risks", [])
            if r.get("risk")
        ]
        if risk_rows:
            supabase.table("risks").insert(risk_rows).execute()

        task_rows = [
            {
                "meeting_id": meeting_id,
                "title": t.get("title", "").strip() or "Untitled task",
                "description": t.get("description"),
                "assigned_to_name": t.get("assigned_to_name"),
                "assigned_to_email": t.get("assigned_to_email"),
                "deadline_text": t.get("deadline_text"),
                "priority": (t.get("priority") or "medium").lower(),
                "source_quote": t.get("source_quote"),
                "approval_status": "pending",
                "status": "not_started",
                "created_by_ai": True,
            }
            for t in analysis.get("action_items", [])
            if t.get("title")
        ]
        if task_rows:
            supabase.table("tasks").insert(task_rows).execute()

        email = analysis.get("follow_up_email") or {}
        supabase.table("email_drafts").insert({
            "meeting_id": meeting_id,
            "subject": email.get("subject") or f"Follow-up: {meeting.get('title')}",
            "body": email.get("body") or "",
            "status": "draft",
        }).execute()

        supabase.table("meetings").update({
            "status": "completed",
            "clean_transcript": analysis.get("clean_transcript"),
            "summary": analysis.get("summary"),
            "main_topics": analysis.get("main_topics") or [],
            "processing_error": None,
        }).eq("id", meeting_id).execute()

        return get_meeting(meeting_id, user_id=user_id, user_email="")

    except AppError as exc:
        supabase.table("meetings").update({"status": "failed", "processing_error": exc.message}).eq("id", meeting_id).execute()
        raise
    except Exception as exc:
        supabase.table("meetings").update({"status": "failed", "processing_error": str(exc)}).eq("id", meeting_id).execute()
        raise AppError("Meeting processing failed", status_code=500, details={"reason": str(exc)})


def update_task(task_id: str, user_id: str, user_email: str, patch: dict) -> dict:
    supabase = get_supabase_admin()
    allowed = {"title", "description", "assigned_to_name", "assigned_to_email", "deadline_text", "priority", "status", "approval_status"}
    update_data = {k: v for k, v in patch.items() if k in allowed and v is not None}

    if not update_data:
        raise AppError("No valid task fields provided", status_code=400)

    def op():
        task_result = supabase.table("tasks").select("*, meetings(owner_id)").eq("id", task_id).execute()
        if not task_result.data:
            raise AppError("Task not found", status_code=404)
        task = task_result.data[0]
        owner_id = task.get("meetings", {}).get("owner_id") if task.get("meetings") else None
        is_owner = owner_id == user_id
        is_assignee = (task.get("assigned_to_email") or "").lower() == (user_email or "").lower()

        if "approval_status" in update_data and not is_owner:
            raise AppError("Only the meeting owner can approve or reject tasks", status_code=403)

        editable_by_assignee = set(update_data.keys()).issubset({"status"})
        if not is_owner and not (is_assignee and editable_by_assignee):
            raise AppError("You do not have permission to update this task", status_code=403)

        result = supabase.table("tasks").update(update_data).eq("id", task_id).execute()
        if not result.data:
            raise AppError("Task update failed", status_code=500)
        return result.data[0]

    return _safe_execute("update_task", op)


def list_my_tasks(user_email: str) -> list[dict]:
    supabase = get_supabase_admin()

    def op():
        if not user_email:
            return []
            
        # Extract the first part of the email (e.g., "haris" from "haris.fic1@gmail.com")
        username_part = user_email.split("@")[0].lower().split(".")[0]
        
        # Fetch all approved tasks and filter locally to handle name-matching gracefully
        all_approved = supabase.table("tasks").select("*, meetings(title)").eq("approval_status", "approved").order("created_at", desc=True).execute().data or []
        
        my_tasks = []
        for t in all_approved:
            assigned_email = (t.get("assigned_to_email") or "").lower()
            assigned_name = (t.get("assigned_to_name") or "").lower()
            
            if assigned_email == user_email.lower():
                my_tasks.append(t)
            elif username_part and (username_part in assigned_name or assigned_name in username_part):
                my_tasks.append(t)
                
        return my_tasks

    return _safe_execute("list_my_tasks", op)
