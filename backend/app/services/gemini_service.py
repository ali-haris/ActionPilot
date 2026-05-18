from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import get_settings
from app.core.errors import AppError
from app.services.json_utils import extract_json_object


ANALYSIS_SYSTEM_PROMPT = """
You are ActionPilot, an enterprise meeting execution agent.
You convert messy meeting transcripts into approved-workflow-ready structured data.
Be conservative: do not invent facts that are not in the transcript.
If owner/deadline is unclear, set it to null and mention the uncertainty in source_quote or description.
Return only valid JSON matching the schema requested by the user.
""".strip()


def get_gemini_client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise AppError("GEMINI_API_KEY is missing", status_code=500)
    return genai.Client(api_key=settings.gemini_api_key)


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=4))
def _generate_text(prompt: str, model: str | None = None) -> str:
    settings = get_settings()
    client = get_gemini_client()
    try:
        response = client.models.generate_content(
            model=model or settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                system_instruction=ANALYSIS_SYSTEM_PROMPT,
            ),
        )
        return response.text or ""
    except Exception as exc:
        raise AppError("Gemini text generation failed", status_code=502, details={"reason": str(exc)})


def analyze_meeting_transcript(transcript: str, participants: list[dict] | None = None) -> dict:
    participant_text = "\n".join(
        f"- {p.get('name')} ({p.get('email') or 'no email'}) speaker_label={p.get('speaker_label') or 'unknown'}"
        for p in (participants or [])
    ) or "No participant list was provided."

    prompt = f"""
Analyze this meeting transcript and return ONLY valid JSON.

Known participants:
{participant_text}

Transcript:
---
{transcript}
---

JSON schema:
{{
  "clean_transcript": "string, readable cleaned transcript with speaker names if possible",
  "summary": "string, concise meeting summary",
  "main_topics": ["topic 1", "topic 2"],
  "decisions": [
    {{
      "decision": "confirmed decision",
      "confidence": "low|medium|high",
      "mentioned_by": "speaker/name or null"
    }}
  ],
  "action_items": [
    {{
      "title": "short task title",
      "description": "task details",
      "assigned_to_name": "person name or null",
      "assigned_to_email": "email if confidently matched from known participants, otherwise null",
      "deadline_text": "deadline as spoken or null",
      "priority": "low|medium|high",
      "source_quote": "short quote/evidence from transcript"
    }}
  ],
  "risks": [
    {{
      "risk": "what could go wrong",
      "severity": "low|medium|high",
      "suggested_action": "practical mitigation"
    }}
  ],
  "follow_up_email": {{
    "subject": "email subject",
    "body": "professional follow-up email body using decisions, risks, and action items"
  }}
}}

Rules:
- Do not invent owners, deadlines, emails, decisions, or tasks.
- If a task has no owner, assigned_to_name and assigned_to_email must be null.
- Match emails only from known participants when the name clearly matches.
- Keep the email draft concise.
""".strip()

    text = _generate_text(prompt)
    data = extract_json_object(text)

    data.setdefault("clean_transcript", transcript)
    data.setdefault("summary", "")
    data.setdefault("main_topics", [])
    data.setdefault("decisions", [])
    data.setdefault("action_items", [])
    data.setdefault("risks", [])
    data.setdefault("follow_up_email", {"subject": "Meeting Follow-up", "body": ""})
    return data
