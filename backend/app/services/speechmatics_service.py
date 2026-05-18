import tempfile
import urllib.request
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError


def _format_speechmatics_result(result) -> str:
    """Return a readable transcript with speaker labels when SDK metadata is available."""
    transcript_text = (getattr(result, "transcript_text", None) or "").strip()

    # The SDK's transcript_text is usually already formatted well, especially with diarization.
    # Keep a fallback formatter for JSON-style results if transcript_text is missing/flat.
    results = getattr(result, "results", None) or []
    if results:
        lines: list[str] = []
        current_speaker: str | None = None
        current_words: list[str] = []

        for item in results:
            alternatives = getattr(item, "alternatives", None) or []
            if not alternatives:
                continue

            alt = alternatives[0]
            content = (getattr(alt, "content", None) or "").strip()
            if not content:
                continue

            speaker = getattr(alt, "speaker", None) or getattr(alt, "speaker_id", None) or "Unknown"
            speaker = str(speaker).upper().replace("SPEAKER_", "SPEAKER ").replace("S", "S", 1)

            # Punctuation tokens should stay attached to the previous word.
            if content in {".", ",", "?", "!", ":", ";", "%"}:
                if current_words:
                    current_words[-1] = current_words[-1] + content
                continue

            if current_speaker is None:
                current_speaker = speaker
            elif speaker != current_speaker:
                if current_words:
                    lines.append(f"{current_speaker}: {' '.join(current_words)}")
                current_speaker = speaker
                current_words = []

            current_words.append(content)

        if current_words and current_speaker:
            lines.append(f"{current_speaker}: {' '.join(current_words)}")

        formatted = "\n".join(lines).strip()
        if formatted:
            return formatted

    if transcript_text:
        return transcript_text

    raise AppError("Speechmatics returned an empty transcript", status_code=502)


async def transcribe_audio_with_speechmatics(audio_path: str) -> str:
    """Transcribe a meeting audio file with Speechmatics Batch API.
    
    audio_path can be either a local file path OR an http/https URL (e.g. signed Supabase URL).
    """
    settings = get_settings()
    if not settings.speechmatics_api_key:
        raise AppError("SPEECHMATICS_API_KEY is missing", status_code=500)

    try:
        from speechmatics.batch import AsyncClient, TranscriptionConfig
        try:
            from speechmatics.batch import AuthenticationError, BatchError, JobError, TimeoutError as SpeechmaticsTimeoutError
        except Exception:
            AuthenticationError = BatchError = JobError = SpeechmaticsTimeoutError = None
    except ImportError as exc:
        raise AppError(
            "Speechmatics SDK is not installed. Run: pip install -r requirements.txt",
            status_code=500,
            details={"reason": str(exc)},
        )

    # If audio_path is a URL, download to a temp file first
    is_url = audio_path.startswith("http://") or audio_path.startswith("https://")
    tmp_file = None

    try:
        if is_url:
            suffix = Path(audio_path.split("?")[0]).suffix or ".audio"
            tmp_file = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            urllib.request.urlretrieve(audio_path, tmp_file.name)
            local_path = tmp_file.name
        else:
            local_path = audio_path

        path = Path(local_path)
        if not path.exists():
            raise AppError("Audio file not found", status_code=404, details={"path": str(path)})

        client = AsyncClient(api_key=settings.speechmatics_api_key)
        try:
            config_kwargs = {"language": settings.speechmatics_language}
            if settings.speechmatics_enable_diarization:
                config_kwargs["diarization"] = "speaker"
            config = TranscriptionConfig(**config_kwargs)

            result = await client.transcribe(
                audio_file=str(path),
                transcription_config=config,
                timeout=float(settings.speechmatics_timeout_seconds),
            )
            transcript = _format_speechmatics_result(result)
            if len(transcript.strip()) < 10:
                raise AppError("Speechmatics returned an empty or too short transcript", status_code=502)
            return transcript.strip()

        except AppError:
            raise
        except Exception as exc:
            exc_name = exc.__class__.__name__
            if AuthenticationError is not None and isinstance(exc, AuthenticationError):
                raise AppError("Speechmatics authentication failed. Check SPEECHMATICS_API_KEY.", status_code=401)
            if SpeechmaticsTimeoutError is not None and isinstance(exc, SpeechmaticsTimeoutError):
                raise AppError("Speechmatics transcription timed out", status_code=504, details={"reason": str(exc)})
            if JobError is not None and isinstance(exc, JobError):
                raise AppError("Speechmatics job failed", status_code=502, details={"reason": str(exc)})
            if BatchError is not None and isinstance(exc, BatchError):
                raise AppError("Speechmatics batch request failed", status_code=502, details={"reason": str(exc)})
            raise AppError("Speechmatics transcription failed", status_code=502, details={"type": exc_name, "reason": str(exc)})
        finally:
            close = getattr(client, "close", None)
            if close:
                close_result = close()
                if hasattr(close_result, "__await__"):
                    await close_result

    finally:
        # Clean up temp file if we created one
        if tmp_file is not None:
            try:
                Path(tmp_file.name).unlink(missing_ok=True)
            except Exception:
                pass

