# ActionPilot Backend

Run:

```bash
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Protected endpoints require a Supabase access token in:

```http
Authorization: Bearer <access_token>
```


Audio transcription uses Speechmatics Batch API. Add `SPEECHMATICS_API_KEY` to `.env`; Gemini is used for transcript analysis only.
