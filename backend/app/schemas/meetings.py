from pydantic import BaseModel, Field
from typing import Any


class ParticipantIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    speaker_label: str | None = None


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    participants: list[ParticipantIn] = []


class TranscriptPayload(BaseModel):
    transcript: str = Field(min_length=10)


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to_name: str | None = None
    assigned_to_email: str | None = None
    deadline_text: str | None = None
    priority: str | None = None
    status: str | None = None
    approval_status: str | None = None


class MeetingAnalysisResult(BaseModel):
    clean_transcript: str
    summary: str
    main_topics: list[str]
    decisions: list[dict[str, Any]]
    action_items: list[dict[str, Any]]
    risks: list[dict[str, Any]]
    follow_up_email: dict[str, str]
