# ActionPilot

**ActionPilot** is an AI meeting execution agent. Users upload meeting audio or paste a transcript, the backend transcribes it with Speechmatics and analyzes it with Gemini, and the portal creates meeting summaries, decisions, risks, action items, in-portal to-dos, and follow-up email drafts.

## Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** FastAPI + Python
- **Database/Auth:** Supabase Auth + Supabase Postgres
- **Speech-to-text:** Speechmatics Batch API for audio transcription and speaker diarization
- **LLM:** Gemini API for meeting analysis

## Core Features

- Email/password auth with Supabase
- Meeting creation and audio upload
- Speechmatics audio transcription with speaker diarization
- Gemini transcript analysis into structured JSON
- Summary, decisions, action items, risks, and follow-up email draft
- Manager review and approval/rejection of AI-generated tasks
- User-specific **My To-Do List** inside the portal
- Task status updates: Not Started, In Progress, Completed
- Basic error handling on frontend and backend

## Folder Structure

```txt
backend/       FastAPI API server
frontend/      React Vite app