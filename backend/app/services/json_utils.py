import json
import re
from app.core.errors import AppError


def extract_json_object(text: str) -> dict:
    if not text or not text.strip():
        raise AppError("Gemini returned an empty response", status_code=502)

    cleaned = text.strip()

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    else:
        first = cleaned.find("{")
        last = cleaned.rfind("}")
        if first != -1 and last != -1 and last > first:
            cleaned = cleaned[first:last + 1]

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AppError("Could not parse Gemini JSON response", status_code=502, details={"json_error": str(exc), "raw": text[:1000]})
