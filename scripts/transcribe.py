from typing import Optional
import re
import time
import assemblyai as aai
from assemblyai import TranscriptionConfig, Transcriber
from tqdm import tqdm

# AssemblyAI renvoie parfois une 500 transitoire pendant le polling
# (« failed to retrieve transcript <id>: Internal server error »).
# Le job continue de tourner côté AssemblyAI : on le récupère par son id
# au lieu de refaire un upload complet.
MAX_RETRIES = 6
RETRY_BASE_DELAY = 5  # secondes, backoff exponentiel plafonné
RETRY_MAX_DELAY = 60
POLL_TIMEOUT = 60 * 60  # 1 h max d'attente sur un job

TRANSIENT_MARKERS = (
    "internal server error",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
    "timed out",
    "timeout",
    "connection reset",
    "connection aborted",
    "temporarily unavailable",
    "failed to retrieve transcript",
)

_TRANSCRIPT_ID_RE = re.compile(
    r"transcript\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


def _is_transient(error: Exception) -> bool:
    message = str(error).lower()
    return any(marker in message for marker in TRANSIENT_MARKERS)


def _extract_transcript_id(error: Exception):
    match = _TRANSCRIPT_ID_RE.search(str(error))
    return match.group(1) if match else None


def _sleep_backoff(attempt: int, reason: str):
    delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
    print(f"⏳ Erreur transitoire AssemblyAI ({reason}) — nouvelle tentative dans {delay}s")
    time.sleep(delay)


def _wait_until_done(job, transcript_id=None):
    """Attend la fin du job en tolérant les erreurs transitoires de polling."""
    deadline = time.time() + POLL_TIMEOUT
    failures = 0

    with tqdm(desc="📡 Transcription en cours", unit="step") as pbar:
        while True:
            status = job.status.value if job.status else None
            if status in ("completed", "error"):
                return job

            if time.time() > deadline:
                raise RuntimeError("❌ Transcription trop longue (timeout AssemblyAI).")

            pbar.update(1)
            time.sleep(3)

            try:
                job.refresh()
                failures = 0
            except Exception as refresh_error:
                if not _is_transient(refresh_error) or failures >= MAX_RETRIES:
                    raise
                failures += 1
                _sleep_backoff(failures, "polling")
                tid = transcript_id or getattr(job, "id", None) or _extract_transcript_id(refresh_error)
                if tid:
                    try:
                        job = aai.Transcript.get_by_id(tid)
                        failures = 0
                    except Exception:
                        pass


def transcribe_audio(audio_path: str, api_key: str, language: Optional[str] = "fr"):
    """Transcribe an audio file. `language` is an ISO code, or None to auto-detect."""
    aai.settings.api_key = api_key
    if language:
        config = TranscriptionConfig(speaker_labels=True, language_code=language)
    else:
        config = TranscriptionConfig(speaker_labels=True, language_detection=True)
    transcriber = Transcriber()

    print("⬆️ Uploading and transcribing...")

    job = None
    transcript_id = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            if transcript_id:
                # Le job existe déjà côté AssemblyAI : on le reprend au lieu de réuploader.
                job = aai.Transcript.get_by_id(transcript_id)
            else:
                job = transcriber.transcribe(audio_path, config=config)
            break
        except Exception as error:
            if not _is_transient(error) or attempt >= MAX_RETRIES:
                raise
            transcript_id = transcript_id or _extract_transcript_id(error)
            _sleep_backoff(attempt, "transcribe")

    print(f"🕐 Job ID: {job.id}")
    job = _wait_until_done(job, transcript_id=getattr(job, "id", None))

    if job.status.value == "error":
        detail = getattr(job, "error", None)
        raise RuntimeError(f"❌ Transcription échouée{f' : {detail}' if detail else '.'}")

    print("✅ Transcription terminée")
    return job
