# api/app.py
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi import BackgroundTasks, FastAPI, UploadFile, File, Form, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from pathlib import Path
import shutil, uuid, os, re
from datetime import datetime, timedelta
import secrets
import threading
from dotenv import load_dotenv

from utils.convert import convert_to_mp3
from utils.transcript_format import enrich_utterances, render_transcript_text, segment_utterances
from scripts.transcribe import transcribe_audio
from scripts.export import save_transcript_json, save_transcript_txt
from api import webhooks
from api.oidc import OIDCError, verify_id_token, verified_email
from api.database import init_db, get_db, SessionLocal, User, Transcript, ChatMessage, SpeakerMapping, UserSettings, LoginCode, TranscriptTag, PushToken
from api.emailcode import (
    CODE_TTL_MINUTES, MAX_ATTEMPTS, MAX_CODES_PER_HOUR, RESEND_COOLDOWN_SECONDS,
    codes_match, generate_code, hash_code, send_login_code,
)
from api.auth import (
    create_access_token, 
    create_refresh_token,
    decode_token
)
from api import llm, push
import json
import jwt

load_dotenv()

# Initialize database
init_db()

app = FastAPI(title="MemoMind API", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Directories
INPUT_DIR = Path("inputs")
OUTPUT_DIR = Path("outputs")
INPUT_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/email/verify")

QUALITY_PRESETS = {
    "high": "128k",
    "medium": "96k",
    "low": "64k"
}

# Pydantic models
class SocialLogin(BaseModel):
    provider: str  # "google" | "apple"
    id_token: str

class EmailCodeRequest(BaseModel):
    email: EmailStr

class EmailCodeVerify(BaseModel):
    email: EmailStr
    code: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    email: str
    created_at: str



def authenticate_token(token: str = Depends(oauth2_scheme)):
    """Validate JWT token and return email"""
    try:
        payload = decode_token(token)
        email = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_user_by_email(db: Session, email: str):
    """Get user from database by email"""
    return db.query(User).filter(User.email == email).first()

def sign_in_email(db: Session, email: str, source: str) -> dict:
    """Find or create the account for a verified email and return fresh tokens.

    Every way in (Google, Apple, e-mail code) lands here, so the same address
    always reaches the same account.
    """
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        # There are no passwords any more; the column is non-null, so store a
        # value no password check could ever match.
        user = User(email=email, hashed_password="!")
        db.add(user)
        db.commit()
        db.refresh(user)
        webhooks.dispatch(webhooks.EVENT_USER_REGISTERED, {
            "user": {
                "id": user.id,
                "email": user.email,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            },
            "source": source,
        })

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    return {
        "access_token": create_access_token(user.email),
        "refresh_token": create_refresh_token(user.email),
        "token_type": "bearer",
    }


@app.post("/auth/social")
def social_login(data: SocialLogin, db: Session = Depends(get_db)):
    """Sign in (or sign up) with a Google / Apple ID token."""
    try:
        claims = verify_id_token(data.provider, data.id_token)
        email = verified_email(claims)
    except OIDCError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return sign_in_email(db, email, data.provider)


@app.post("/auth/email/request")
def request_email_code(data: EmailCodeRequest, db: Session = Depends(get_db)):
    """E-mail a one-time sign-in code. Same answer whether or not an account exists."""
    email = data.email.strip().lower()
    now = datetime.utcnow()

    recent = db.query(LoginCode).filter(
        LoginCode.email == email,
        LoginCode.created_at > now - timedelta(hours=1),
    ).order_by(LoginCode.created_at.desc()).all()
    if recent and (now - recent[0].created_at).total_seconds() < RESEND_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait a minute before asking for another code")
    if len(recent) >= MAX_CODES_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many codes requested, try again later")

    # A new code replaces any earlier one.
    db.query(LoginCode).filter(LoginCode.email == email, LoginCode.used == 0).update({"used": 1})
    code = generate_code()
    db.add(LoginCode(
        email=email,
        code_hash=hash_code(email, code),
        expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
    ))
    db.commit()

    # Send in the background so SMTP latency never blocks the request.
    threading.Thread(target=send_login_code, args=(email, code)).start()
    return {"message": "If the address is valid, a code is on its way."}


@app.post("/auth/email/verify")
def verify_email_code(data: EmailCodeVerify, db: Session = Depends(get_db)):
    """Exchange an e-mailed code for tokens (creating the account if needed)."""
    email = data.email.strip().lower()
    invalid = HTTPException(status_code=400, detail="Invalid or expired code")

    entry = db.query(LoginCode).filter(
        LoginCode.email == email,
        LoginCode.used == 0,
        LoginCode.expires_at > datetime.utcnow(),
    ).order_by(LoginCode.created_at.desc()).first()
    if not entry:
        raise invalid

    entry.attempts += 1
    if entry.attempts > MAX_ATTEMPTS or not codes_match(email, data.code, entry.code_hash):
        if entry.attempts >= MAX_ATTEMPTS:
            entry.used = 1  # too many wrong guesses: burn the code
        db.commit()
        raise invalid

    entry.used = 1
    db.commit()
    return sign_in_email(db, email, "email")


@app.post("/refresh")
async def refresh_token_endpoint(refresh_token: str = Form(...)):
    """Refresh access token using refresh token"""
    try:
        # JWT is cryptographically signed - just validate signature and expiry
        payload = decode_token(refresh_token)
        email = payload.get("sub")
        
        if not email:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        new_access_token = create_access_token(email)
        return {"access_token": new_access_token, "token_type": "bearer"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@app.get("/me", response_model=UserResponse)
async def get_current_user(
    email: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Get current user information"""
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user.id,
        email=user.email,
        created_at=user.created_at.isoformat()
    )


# A transcription still "processing" after this long is considered lost (the
# server was restarted mid-job); it is then reported as failed.
STALE_PROCESSING = timedelta(minutes=60)


MIN_SUMMARY_CHARS = 200  # shorter than this, there is nothing to summarise


def _auto_title_and_summary(row: Transcript, original_name: str) -> None:
    """Give a fresh transcript a title and a summary. Never fails the transcription."""
    owner = row.user
    if owner and owner.settings and not owner.settings.auto_summary:
        return
    if not os.getenv("ANTHROPIC_API_KEY") or len(row.text_content or "") < MIN_SUMMARY_CHARS:
        return
    try:
        result = llm.summarize(row.text_content)
    except Exception as e:
        print(f"[SUMMARY] Skipped: {e}", flush=True)
        return
    row.summary = result["summary"]
    # Leave a name the user chose while the audio was being processed alone.
    if result["title"] and row.filename == original_name:
        row.filename = result["title"]


def run_transcription(transcript_pk: int, input_path: Path, quality: str, language: Optional[str],
                      api_key: str, webhook_context: dict, requested_at: datetime) -> None:
    """Convert, transcribe and store the result on an existing "processing" row.

    Raises on failure after marking the row failed, so a synchronous caller can
    report the error; background callers just let it end here.
    """
    base_name = input_path.stem
    mp3_path = OUTPUT_DIR / f"{base_name}.mp3"
    json_path = OUTPUT_DIR / f"{base_name}.json"
    txt_path = OUTPUT_DIR / f"{base_name}.txt"
    db = SessionLocal()  # own session: this may outlive the request that started it
    try:
        convert_to_mp3(input_path, mp3_path, bitrate=QUALITY_PRESETS[quality])
        job = transcribe_audio(str(mp3_path), api_key, language=language)
        save_transcript_json(job, json_path)
        save_transcript_txt(job, txt_path)

        # Always use the utterances format, for consistency with speaker mappings
        if hasattr(job, 'utterances') and job.utterances:
            transcript_text = "\n".join([f"{utt.speaker}: {utt.text}" for utt in job.utterances])
        else:
            transcript_text = job.text if hasattr(job, 'text') else ""

        row = db.query(Transcript).filter(Transcript.id == transcript_pk).first()
        if row is None:
            return  # deleted by the user while it was processing
        original_name = webhook_context.get("filename")
        row.text_content = transcript_text
        row.json_content = json.dumps(job.json_response) if hasattr(job, 'json_response') else None
        _auto_title_and_summary(row, original_name)
        row.status = "completed"
        row.error = None
        db.commit()

        webhooks.dispatch(webhooks.EVENT_TRANSCRIPTION_COMPLETED, {
            **webhook_context,
            "database_id": transcript_pk,
            "duration_seconds": round((datetime.utcnow() - requested_at).total_seconds(), 2),
            "word_count": len(transcript_text.split()) if transcript_text else 0,
            "utterance_count": len(job.utterances) if getattr(job, "utterances", None) else 0,
        })
    except Exception as e:
        db.rollback()
        row = db.query(Transcript).filter(Transcript.id == transcript_pk).first()
        if row is not None:
            row.status = "failed"
            row.error = str(e)[:2000]
            db.commit()
        webhooks.dispatch(webhooks.EVENT_TRANSCRIPTION_FAILED, {**webhook_context, "error": str(e)})
        raise
    finally:
        db.close()
        # The transcript lives in the database: drop every audio file.
        for path in (input_path, mp3_path, json_path, txt_path):
            try:
                path.unlink(missing_ok=True)
            except Exception as cleanup_error:
                print(f"Warning: Failed to cleanup {path}: {cleanup_error}")


def _notify_finished(transcript_pk: int, ok: bool) -> None:
    """Tell the user's devices that a background transcription ended. Never raises."""
    db = SessionLocal()
    try:
        row = db.query(Transcript).filter(Transcript.id == transcript_pk).first()
        if row is None:
            return
        title = "Transcription terminée" if ok else "Échec de la transcription"
        body = row.filename or ""
        user_id = row.user_id
    except Exception as e:
        print(f"[PUSH] Skipped: {e}", flush=True)
        return
    finally:
        db.close()
    try:
        push.notify_user(user_id, title, body, {"transcriptId": transcript_pk})
    except Exception as e:
        print(f"[PUSH] Skipped: {e}", flush=True)


def _run_in_background(transcript_pk: int, *args) -> None:
    try:
        run_transcription(transcript_pk, *args)
    except Exception as e:
        print(f"[TRANSCRIBE] Background job failed: {e}", flush=True)
        _notify_finished(transcript_pk, False)
    else:
        _notify_finished(transcript_pk, True)


@app.post("/transcribe")
async def transcribe_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    quality: str = Form("high"),
    # background=true: answer as soon as the upload is stored and transcribe in
    # the background (poll GET /transcripts/{id}/status). Default: wait for the result.
    background: bool = Form(False),
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    api_key = os.getenv("AAI_API_KEY")
    if not api_key:
        return JSONResponse(status_code=500, content={"error": "AAI_API_KEY missing in .env"})

    if quality not in QUALITY_PRESETS:
        return JSONResponse(status_code=400, content={"error": "Invalid quality value"})

    requesting_user = get_user_by_email(db, user)
    if not requesting_user:
        raise HTTPException(
            status_code=401,
            detail="User session expired or invalid. Please log out and log back in."
        )

    uid = uuid.uuid4().hex[:8]
    input_path = INPUT_DIR / f"{uid}_{file.filename}"
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    requested_at = datetime.utcnow()
    base_name = input_path.stem
    webhook_context = {
        "request_id": base_name,
        "filename": file.filename,
        "quality": quality,
        "size_bytes": input_path.stat().st_size if input_path.exists() else None,
        "is_guest": False,
        "requested_at": requested_at.isoformat(),
        "user": {"id": requesting_user.id, "email": user},
    }
    webhooks.dispatch(webhooks.EVENT_TRANSCRIPTION_REQUESTED, webhook_context)

    # The entry exists from the moment the upload lands, so it can be renamed and
    # shown as "in progress" while the transcription runs.
    row = Transcript(
        transcript_id=base_name,
        user_id=requesting_user.id,
        filename=file.filename,
        text_content="",
        status="processing",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # The user's preferred language; unset means auto-detect.
    language = (requesting_user.settings.default_language if requesting_user.settings else None) or None
    job_args = (row.id, input_path, quality, language, api_key, webhook_context, requested_at)

    if background:
        background_tasks.add_task(_run_in_background, *job_args)
        return {"id": base_name, "database_id": row.id, "status": "processing"}

    try:
        run_transcription(*job_args)
    except Exception as e:
        # Synchronous callers get the error back, so don't leave a failed row behind.
        db.query(Transcript).filter(Transcript.id == row.id).delete()
        db.commit()
        return JSONResponse(status_code=500, content={"error": str(e)})
    return {
        "id": base_name,
        "text_file": f"/transcripts/{base_name}?format=txt",
        "json_file": f"/transcripts/{base_name}?format=json",
        "database_id": row.id,
    }


@app.post("/transcribe/guest")
async def transcribe_guest(
    file: UploadFile = File(...),
    quality: str = Form("medium")
):
    """
    Guest transcription endpoint - no authentication required.
    Limitations:
    - Max file size: 5MB
    - No history saved
    - Default prompts only
    """
    GUEST_MAX_SIZE = 5 * 1024 * 1024  # 5MB
    
    api_key = os.getenv("AAI_API_KEY") or os.getenv("ASSEMBLYAI_API_KEY")
    if not api_key:
        return JSONResponse(status_code=500, content={"error": "API key not configured"})

    if quality not in QUALITY_PRESETS:
        quality = "medium"

    # Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > GUEST_MAX_SIZE:
        return JSONResponse(
            status_code=400, 
            content={
                "error": f"File too large for guest mode. Maximum size is 5MB. Please create an account for files up to 100MB.",
                "upgrade_required": True
            }
        )

    # Generate unique ID for this guest transcription
    unique_id = f"guest_{uuid.uuid4().hex[:12]}"
    input_path = INPUT_DIR / f"{unique_id}{Path(file.filename).suffix}"

    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    requested_at = datetime.utcnow()
    webhook_context = {
        "request_id": input_path.stem,
        "filename": file.filename,
        "quality": quality,
        "size_bytes": file_size,
        "is_guest": True,
        "requested_at": requested_at.isoformat(),
        "user": None,
    }
    webhooks.dispatch(webhooks.EVENT_TRANSCRIPTION_REQUESTED, webhook_context)

    try:
        base_name = input_path.stem
        mp3_path = OUTPUT_DIR / f"{base_name}.mp3"

        convert_to_mp3(input_path, mp3_path, bitrate=QUALITY_PRESETS[quality])
        job = transcribe_audio(str(mp3_path), api_key)

        # Extract transcript text and timestamped utterances
        utterances = []
        if hasattr(job, 'utterances') and job.utterances:
            utterances = enrich_utterances(segment_utterances([
                {
                    "speaker": utt.speaker,
                    "text": utt.text,
                    "start": utt.start,
                    "end": utt.end,
                    # Word timings let a monologue be split into segments
                    "words": [
                        {"text": w.text, "start": w.start, "end": w.end}
                        for w in (getattr(utt, "words", None) or [])
                    ],
                }
                for utt in job.utterances
            ]))
            transcript_text = "\n".join([f"{utt.speaker}: {utt.text}" for utt in job.utterances])
        else:
            transcript_text = job.text if hasattr(job, 'text') else ""

        # Cleanup files immediately (no persistence for guests)
        try:
            if input_path.exists():
                input_path.unlink()
            if mp3_path.exists():
                mp3_path.unlink()
        except Exception as cleanup_error:
            print(f"Warning: Failed to cleanup guest files: {cleanup_error}")

        webhooks.dispatch(webhooks.EVENT_TRANSCRIPTION_COMPLETED, {
            **webhook_context,
            "duration_seconds": round((datetime.utcnow() - requested_at).total_seconds(), 2),
            "word_count": len(transcript_text.split()) if transcript_text else 0,
            "utterance_count": len(utterances),
        })

        return {
            "id": base_name,
            "text": transcript_text,
            "utterances": utterances,
            "json_response": job.json_response if hasattr(job, 'json_response') else None,
            "is_guest": True,
            "upgrade_message": "Create an account to save transcripts, access history, and customize AI prompts!"
        }
    except Exception as e:
        try:
            if input_path.exists():
                input_path.unlink()
        except:
            pass
        webhooks.dispatch(webhooks.EVENT_TRANSCRIPTION_FAILED, {
            **webhook_context,
            "error": str(e),
        })
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/chat/guest")
async def chat_with_transcript_guest(
    message: str = Form(...),
    transcript_text: str = Form(...)
):
    """
    Guest chat endpoint - uses default prompts only.
    Transcript text must be provided since guests have no saved transcripts.
    """
    try:
        ai_response = llm.reply(
            llm.system_blocks(transcript_text),
            [{"role": "user", "content": message}],
        )
        return {
            "response": ai_response,
            "is_guest": True,
            "upgrade_message": "Create an account to save chat history and customize AI prompts!"
        }
    except llm.ChatNotConfigured:
        return JSONResponse(status_code=500, content={"error": "AI chat is not configured"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/transcripts/list")
async def list_transcripts(
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """List all transcripts for the current user"""
    db_user = get_user_by_email(db, user)
    if not db_user:
        raise HTTPException(
            status_code=401, 
            detail="User session expired or invalid. Please log out and log back in."
        )
    
    # A job that never finished (server restarted mid-run) would stay "processing" forever.
    db.query(Transcript).filter(
        Transcript.user_id == db_user.id,
        Transcript.status == "processing",
        Transcript.created_at < datetime.utcnow() - STALE_PROCESSING,
    ).update({"status": "failed", "error": "The transcription was interrupted. Please try again."})
    db.commit()

    transcripts = db.query(Transcript).filter(Transcript.user_id == db_user.id).order_by(
        Transcript.pinned.desc(), Transcript.created_at.desc()
    ).all()
    
    return [
        {
            "id": t.id,
            "tags": [tag.tag for tag in t.tags],
            "pinned": bool(t.pinned),
            "summary": t.summary,
            "status": t.status or "completed",
            "error": t.error,
            "transcript_id": t.transcript_id,
            "filename": t.filename,
            "created_at": t.created_at.isoformat(),
            "word_count": len(t.text_content.split()) if t.text_content else 0,
            "preview": t.text_content[:150] + "..." if t.text_content and len(t.text_content) > 150 else (t.text_content or ""),
            "content": t.text_content or "",
            "speakers": [m.display_name for m in t.speaker_mappings]
        }
        for t in transcripts
    ]


@app.get("/transcripts/{transcript_id}/status")
def get_transcript_status(
    transcript_id: int,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Light status check, for polling while a transcription runs in the background."""
    db_user = get_user_by_email(db, user)
    row = db.query(Transcript).filter(
        Transcript.id == transcript_id, Transcript.user_id == db_user.id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if row.status == "processing" and row.created_at < datetime.utcnow() - STALE_PROCESSING:
        row.status, row.error = "failed", "The transcription was interrupted. Please try again."
        db.commit()
    return {
        "id": row.id,
        "status": row.status or "completed",
        "error": row.error,
        "filename": row.filename,
        "tags": [t.tag for t in row.tags],
        "pinned": bool(row.pinned),
        "summary": row.summary,
    }


@app.post("/transcripts/{transcript_id}/summary")
def generate_transcript_summary(
    transcript_id: int,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """(Re)generate the summary, for transcripts made before summaries existed. The name is left alone."""
    db_user = get_user_by_email(db, user)
    row = db.query(Transcript).filter(
        Transcript.id == transcript_id, Transcript.user_id == db_user.id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if row.status != "completed" or len(row.text_content or "") < MIN_SUMMARY_CHARS:
        raise HTTPException(status_code=400, detail="This transcript is too short to summarise")
    try:
        row.summary = llm.summarize(row.text_content)["summary"]
    except llm.ChatNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"[SUMMARY] Failed: {e}", flush=True)
        raise HTTPException(status_code=502, detail="The summary could not be generated, try again")
    db.commit()
    return {"summary": row.summary}


class TranscriptUpdate(BaseModel):
    filename: Optional[str] = None
    pinned: Optional[bool] = None


def _owned_transcript(db: Session, user: str, transcript_id: int) -> Transcript:
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return transcript


@app.patch("/transcripts/{transcript_id}")
async def update_transcript(
    transcript_id: int,
    update: TranscriptUpdate,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Rename a transcript and/or pin it to the top of the history"""
    transcript = _owned_transcript(db, user, transcript_id)

    if update.filename is not None:
        if not update.filename.strip():
            raise HTTPException(status_code=422, detail="The name can't be empty")
        transcript.filename = update.filename.strip()
    if update.pinned is not None:
        transcript.pinned = 1 if update.pinned else 0
    db.commit()

    return {"status": "success", "filename": transcript.filename, "pinned": bool(transcript.pinned)}


MAX_TAGS = 20
MAX_TAG_LENGTH = 30


def normalize_tags(tags) -> list:
    """Trim, collapse spaces, lower-case, drop blanks and duplicates, cap the count."""
    seen, out = set(), []
    for raw in tags:
        tag = " ".join(str(raw).split())[:MAX_TAG_LENGTH].lower()
        if tag and tag not in seen:
            seen.add(tag)
            out.append(tag)
    return out[:MAX_TAGS]


class TagsUpdate(BaseModel):
    tags: list[str]


@app.put("/transcripts/{transcript_id}/tags")
async def set_transcript_tags(
    transcript_id: int,
    data: TagsUpdate,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Replace the tags of a transcript"""
    transcript = _owned_transcript(db, user, transcript_id)
    tags = normalize_tags(data.tags)
    transcript.tags = [TranscriptTag(tag=tag) for tag in tags]
    db.commit()
    return {"tags": tags}


@app.get("/tags")
async def list_tags(
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Every tag the user has used, with how many transcripts carry it (for suggestions)"""
    db_user = get_user_by_email(db, user)
    rows = db.query(TranscriptTag.tag, func.count(TranscriptTag.id)).join(
        Transcript, Transcript.id == TranscriptTag.transcript_id
    ).filter(Transcript.user_id == db_user.id).group_by(TranscriptTag.tag).all()
    return sorted(({"tag": tag, "count": count} for tag, count in rows), key=lambda r: (-r["count"], r["tag"]))


class BulkDelete(BaseModel):
    ids: list[int]


@app.post("/transcripts/delete")
async def delete_transcripts(
    data: BulkDelete,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Delete several transcripts at once (ids that aren't the user's are ignored)"""
    db_user = get_user_by_email(db, user)
    owned = db.query(Transcript).filter(
        Transcript.user_id == db_user.id, Transcript.id.in_(data.ids)
    ).all()
    for transcript in owned:
        db.query(ChatMessage).filter(ChatMessage.transcript_id == transcript.id).delete()
        db.query(SpeakerMapping).filter(SpeakerMapping.transcript_id == transcript.id).delete()
        db.delete(transcript)  # tags go with it (cascade)
    db.commit()
    return {"deleted": len(owned)}


@app.delete("/transcripts/{transcript_id}")
async def delete_transcript(
    transcript_id: int,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Delete a transcript and all associated data"""
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    
    # Delete associated chat messages
    db.query(ChatMessage).filter(ChatMessage.transcript_id == transcript_id).delete()
    
    # Delete speaker mappings
    db.query(SpeakerMapping).filter(SpeakerMapping.transcript_id == transcript_id).delete()
    
    # Delete the transcript
    db.delete(transcript)
    db.commit()
    
    return {"status": "success", "message": "Transcript deleted"}


@app.get("/transcripts/{transcript_id}")
def get_transcript(
    transcript_id: str,
    format: str = "txt",
    timestamps: bool = False,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Download transcript with speaker names applied.

    With ?timestamps=true the TXT export is rebuilt from the stored utterances
    so each line is prefixed with "[MM:SS]".
    """
    # Try to parse as database ID first
    db_user = get_user_by_email(db, user)
    transcript = None
    
    # Check if it's a numeric ID (database_id)
    if transcript_id.isdigit():
        transcript = db.query(Transcript).filter(
            Transcript.id == int(transcript_id),
            Transcript.user_id == db_user.id
        ).first()
    
    # If not found, try as transcript_id (filename-based)
    if not transcript:
        transcript = db.query(Transcript).filter(
            Transcript.transcript_id == transcript_id,
            Transcript.user_id == db_user.id
        ).first()
    
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    
    # Get speaker mappings
    speaker_mappings = db.query(SpeakerMapping).filter(
        SpeakerMapping.transcript_id == transcript.id
    ).all()
    
    if format == "json":
        # For JSON, parse and replace speaker names in utterances
        if not transcript.json_content:
            raise HTTPException(status_code=404, detail="JSON content not found")
        
        json_data = json.loads(transcript.json_content)
        
        # Apply mappings to utterances if they exist
        if 'utterances' in json_data:
            for utt in json_data['utterances']:
                for mapping in speaker_mappings:
                    if utt.get('speaker') == mapping.original_label:
                        utt['speaker'] = mapping.display_name
        
        return JSONResponse(content=json_data)
    else:
        # For TXT, apply mappings to text content
        transcript_text = transcript.text_content

        if timestamps and transcript.json_content:
            # Rebuild the text from utterances so timestamps can be inlined
            try:
                json_data = json.loads(transcript.json_content)
                utterances = json_data.get('utterances') or []
                if utterances:
                    mappings = {m.original_label: m.display_name for m in speaker_mappings}
                    return PlainTextResponse(
                        content=render_transcript_text(
                            segment_utterances(utterances), mappings, include_timestamps=True
                        )
                    )
            except json.JSONDecodeError:
                pass  # Fall through to the plain text version below

        for mapping in speaker_mappings:
            # Replace speaker labels at start of lines
            pattern = re.compile(r'^' + re.escape(mapping.original_label) + r':', flags=re.MULTILINE)
            transcript_text = pattern.sub(mapping.display_name + ':', transcript_text)
        
        # Return as plain text
        return PlainTextResponse(content=transcript_text)


class ChatRequest(BaseModel):
    message: str
    # Ask the same question again: the previous answer (and question) are dropped first.
    regenerate: bool = False


class ChatResponse(BaseModel):
    content: str
    role: str
    created_at: str


class ImportedTranscript(BaseModel):
    filename: Optional[str] = None
    text: str
    json_response: Optional[dict] = None  # the guest result's full transcript JSON (keeps timestamps and words)


MAX_IMPORT_CHARS = 2_000_000


@app.post("/transcripts/import")
async def import_transcript(
    body: ImportedTranscript,
    email: str = Depends(authenticate_token),
    db: Session = Depends(get_db),
):
    """Save a transcript produced in guest mode into the account that was just created"""
    json_content = json.dumps(body.json_response) if body.json_response else None
    if not body.text.strip() or len(body.text) + len(json_content or "") > MAX_IMPORT_CHARS:
        raise HTTPException(status_code=400, detail="Nothing to import, or too large")
    user = get_user_by_email(db, email)
    name = (body.filename or "").strip()[:200] or "Transcription"
    row = Transcript(
        transcript_id=f"import_{uuid.uuid4().hex[:12]}",
        user=user,  # the relationship, so the auto-summary setting is honoured
        filename=name,
        text_content=body.text,
        json_content=json_content,
        status="completed",
    )
    _auto_title_and_summary(row, name)
    db.add(row)
    db.commit()
    return {"database_id": row.id}


class SpeakerUpdate(BaseModel):
    original_label: str
    display_name: str


class SettingsUpdate(BaseModel):
    # AI Chat settings
    system_prompt_template: Optional[str] = None
    default_user_prompt: Optional[str] = None
    ai_model: Optional[str] = None
    response_length: Optional[str] = None
    temperature: Optional[str] = None
    # Transcription settings
    default_quality: Optional[str] = None
    default_language: Optional[str] = None
    # Display settings
    theme: Optional[str] = None
    date_format: Optional[str] = None
    font_size: Optional[str] = None
    auto_summary: Optional[bool] = None


@app.get("/settings")
async def get_settings(
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Get user settings"""
    db_user = get_user_by_email(db, user)
    if not db_user.settings:
        # Return defaults if no settings exist
        return {
            "system_prompt_template": None,
            "default_user_prompt": None,
            "ai_model": "gpt-4o-mini",
            "response_length": "medium",
            "temperature": "0.7",
            "default_quality": "medium",
            "default_language": None,
            "auto_summary": True,
            "theme": "system",
            "date_format": "us",
            "font_size": "medium"
        }
    
    return {
        "system_prompt_template": db_user.settings.system_prompt_template,
        "default_user_prompt": db_user.settings.default_user_prompt,
        "ai_model": db_user.settings.ai_model or "gpt-4o-mini",
        "response_length": db_user.settings.response_length or "medium",
        "temperature": db_user.settings.temperature or "0.7",
        "default_quality": db_user.settings.default_quality or "medium",
        "default_language": db_user.settings.default_language,
        "auto_summary": bool(db_user.settings.auto_summary) if db_user.settings.auto_summary is not None else True,
        "theme": db_user.settings.theme or "system",
        "date_format": db_user.settings.date_format or "us",
        "font_size": db_user.settings.font_size or "medium"
    }


@app.put("/settings")
async def update_settings(
    settings: SettingsUpdate,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Update user settings"""
    db_user = get_user_by_email(db, user)
    
    if not db_user.settings:
        user_settings = UserSettings(user_id=db_user.id)
        db.add(user_settings)
        db_user.settings = user_settings
    
    # Update only provided fields
    if settings.system_prompt_template is not None:
        db_user.settings.system_prompt_template = settings.system_prompt_template or None
    if settings.default_user_prompt is not None:
        db_user.settings.default_user_prompt = settings.default_user_prompt or None
    if settings.ai_model is not None:
        db_user.settings.ai_model = settings.ai_model
    if settings.response_length is not None:
        db_user.settings.response_length = settings.response_length
    if settings.temperature is not None:
        db_user.settings.temperature = settings.temperature
    if settings.default_quality is not None:
        db_user.settings.default_quality = settings.default_quality
    if settings.default_language is not None:
        db_user.settings.default_language = settings.default_language or None
    if settings.auto_summary is not None:
        db_user.settings.auto_summary = 1 if settings.auto_summary else 0
    if settings.theme is not None:
        db_user.settings.theme = settings.theme
    if settings.date_format is not None:
        db_user.settings.date_format = settings.date_format
    if settings.font_size is not None:
        db_user.settings.font_size = settings.font_size
    
    db.commit()
    
    return {"status": "success"}


@app.get("/transcripts/{transcript_id}/utterances")
async def get_transcript_utterances(
    transcript_id: int,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Get utterances and speaker mappings for a transcript"""
    # Verify transcript belongs to user
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    
    # Get speaker mappings
    mappings = {m.original_label: m.display_name for m in transcript.speaker_mappings}
    
    # Parse JSON content
    utterances = []
    if transcript.json_content:
        try:
            data = json.loads(transcript.json_content)
            if 'utterances' in data and data['utterances']:
                # Split monologues into regular segments, then add speaker
                # names and formatted timestamps to each one
                utterances = enrich_utterances(
                    segment_utterances(data['utterances']), mappings
                )
        except json.JSONDecodeError:
            pass

    return {
        "utterances": utterances,
        "speakers": mappings,
        "summary": transcript.summary,
    }


@app.put("/transcripts/{transcript_id}/speakers")
async def update_speaker_mapping(
    transcript_id: int,
    speaker_update: SpeakerUpdate,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Update speaker name mapping"""
    # Verify transcript belongs to user
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    
    # Check if mapping exists
    mapping = db.query(SpeakerMapping).filter(
        SpeakerMapping.transcript_id == transcript_id,
        SpeakerMapping.original_label == speaker_update.original_label
    ).first()
    
    if mapping:
        mapping.display_name = speaker_update.display_name
    else:
        mapping = SpeakerMapping(
            transcript_id=transcript_id,
            original_label=speaker_update.original_label,
            display_name=speaker_update.display_name
        )
        db.add(mapping)
        
    db.commit()
    
    return {"status": "success", "display_name": speaker_update.display_name}


def _chat_context(db: Session, user: str, transcript_id: int, message: str, regenerate: bool = False):
    """Save the user's message and build what the model needs: (system blocks, messages)."""
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    if regenerate:
        last = db.query(ChatMessage).filter(ChatMessage.transcript_id == transcript_id).order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(2).all()
        # Drop the last answer and the question it answered.
        if len(last) == 2 and last[0].role == "assistant" and last[1].role == "user":
            for m in last:
                db.delete(m)
            db.commit()

    # The most recent turns, oldest first (the new message is the last one).
    db.add(ChatMessage(transcript_id=transcript_id, role="user", content=message))
    db.commit()
    recent = db.query(ChatMessage).filter(
        ChatMessage.transcript_id == transcript_id
    ).order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(20).all()
    history = llm.clean_history([{"role": m.role, "content": m.content} for m in reversed(recent)])

    # Show speakers under the names the user gave them.
    transcript_text = transcript.text_content or ""
    for mapping in db.query(SpeakerMapping).filter(SpeakerMapping.transcript_id == transcript_id).all():
        # Only at the start of a line, so the same words inside speech are left alone.
        pattern = re.compile(r'^' + re.escape(mapping.original_label) + r':', flags=re.MULTILINE)
        transcript_text = pattern.sub(mapping.display_name + ':', transcript_text)

    settings = db_user.settings
    system = llm.system_blocks(
        transcript_text,
        template=(settings.system_prompt_template if settings else "") or "",
        length=(settings.response_length if settings else "medium") or "medium",
    )
    return system, history


def _save_reply(transcript_id: int, content: str) -> ChatMessage:
    """Store the assistant's answer with a session of its own (streams outlive the request's)."""
    session = SessionLocal()
    try:
        row = ChatMessage(transcript_id=transcript_id, role="assistant", content=content)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row
    finally:
        session.close()


@app.post("/chat/{transcript_id}", response_model=ChatResponse)
async def chat_with_transcript(
    transcript_id: int,
    chat_request: ChatRequest,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Send a chat message and get the AI's answer about the transcript"""
    system, history = _chat_context(db, user, transcript_id, chat_request.message, chat_request.regenerate)
    try:
        content = llm.reply(system, history)
    except llm.ChatNotConfigured as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"❌ Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"AI error: {e}")

    row = _save_reply(transcript_id, content)
    return ChatResponse(content=content, role="assistant", created_at=row.created_at.isoformat())


@app.post("/chat/{transcript_id}/stream")
def chat_with_transcript_stream(
    transcript_id: int,
    chat_request: ChatRequest,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Same as POST /chat/{id}, streamed as newline-delimited JSON:
    {"t": "text"} chunks, then {"done": true, "created_at": ...} or {"error": "..."}."""
    system, history = _chat_context(db, user, transcript_id, chat_request.message, chat_request.regenerate)

    def events():
        parts = []
        try:
            for chunk in llm.stream_reply(system, history):
                parts.append(chunk)
                yield json.dumps({"t": chunk}) + "\n"
        except llm.ChatNotConfigured as e:
            yield json.dumps({"error": str(e)}) + "\n"
            return
        except Exception as e:
            print(f"❌ Chat stream error: {e}")
            yield json.dumps({"error": f"AI error: {e}"}) + "\n"
            return
        finally:
            # A reader that leaves early still keeps what was generated so far.
            if parts:
                row = _save_reply(transcript_id, "".join(parts))
                created = row.created_at.isoformat()
            else:
                created = None
        yield json.dumps({"done": True, "created_at": created}) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.get("/chat/{transcript_id}/history")
async def get_chat_history(
    transcript_id: int,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Get chat history for a transcript"""
    # Verify transcript belongs to user
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    
    messages = db.query(ChatMessage).filter(
        ChatMessage.transcript_id == transcript_id
    ).order_by(ChatMessage.created_at).all()
    
    return [
        {
            "id": msg.id,
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat()
        }
        for msg in messages
    ]


@app.delete("/chat/{transcript_id}/history")
async def clear_chat_history(
    transcript_id: int,
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Clear chat history for a transcript"""
    # Verify transcript belongs to user
    db_user = get_user_by_email(db, user)
    transcript = db.query(Transcript).filter(
        Transcript.id == transcript_id,
        Transcript.user_id == db_user.id
    ).first()
    
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    
    # Delete all chat messages
    db.query(ChatMessage).filter(ChatMessage.transcript_id == transcript_id).delete()
    db.commit()
    
    return {"message": "Chat history cleared"}


# ============== Account Management ==============

@app.get("/account/export")
async def export_all_data(
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Export all user transcripts as JSON"""
    import zipfile
    import io
    from fastapi.responses import StreamingResponse
    
    db_user = get_user_by_email(db, user)
    transcripts = db.query(Transcript).filter(Transcript.user_id == db_user.id).all()
    
    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for transcript in transcripts:
            # Add text file
            txt_filename = f"{transcript.filename}.txt"
            zip_file.writestr(txt_filename, transcript.text_content or "")
            
            # Add JSON file if available
            if transcript.json_content:
                json_filename = f"{transcript.filename}.json"
                zip_file.writestr(json_filename, transcript.json_content)
        
        # Add metadata file
        metadata = {
            "exported_at": datetime.utcnow().isoformat(),
            "user_email": db_user.email,
            "total_transcripts": len(transcripts),
            "transcripts": [
                {
                    "id": t.id,
                    "filename": t.filename,
                    "tags": [tag.tag for tag in t.tags],
                    "created_at": t.created_at.isoformat()
                }
                for t in transcripts
            ]
        }
        zip_file.writestr("metadata.json", json.dumps(metadata, indent=2))
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=memomind_export_{datetime.utcnow().strftime('%Y%m%d')}.zip"
        }
    )


class PushRegistration(BaseModel):
    token: str
    platform: Optional[str] = None


@app.post("/push/register")
async def register_push(body: PushRegistration, email: str = Depends(authenticate_token), db: Session = Depends(get_db)):
    """Opt this device in to a notification when a transcription ends"""
    if not push.is_expo_token(body.token):
        raise HTTPException(status_code=400, detail="Invalid push token")
    user = get_user_by_email(db, email)
    row = db.query(PushToken).filter(PushToken.token == body.token).first()
    if row is None:
        db.add(PushToken(user_id=user.id, token=body.token, platform=body.platform))
    else:  # the device changed hands: the token now belongs to this user
        row.user_id = user.id
        row.platform = body.platform
    db.commit()
    return {"status": "success"}


@app.post("/push/unregister")
async def unregister_push(body: PushRegistration, email: str = Depends(authenticate_token), db: Session = Depends(get_db)):
    user = get_user_by_email(db, email)
    db.query(PushToken).filter(PushToken.token == body.token, PushToken.user_id == user.id).delete()
    db.commit()
    return {"status": "success"}


@app.delete("/account")
async def delete_account(
    user: str = Depends(authenticate_token),
    db: Session = Depends(get_db)
):
    """Delete user account and all associated data"""
    db_user = get_user_by_email(db, user)
    
    # Delete all user data (cascades will handle related records)
    db.delete(db_user)
    db.commit()
    
    return {"status": "success", "message": "Account deleted successfully"}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
