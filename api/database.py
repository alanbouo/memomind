"""
Database models and setup for user management
"""
from sqlalchemy import create_engine, inspect, text, Column, Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from pathlib import Path
import os

# Database setup - supports both SQLite (dev) and PostgreSQL (production)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Production: Use PostgreSQL or other database from environment
    # Fix for PostgreSQL URLs from some providers (postgres:// -> postgresql://)
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Test connections before using them
        pool_recycle=60,     # Recycle connections after 1 minute
        pool_size=3,
        max_overflow=5,
        pool_timeout=30,
        connect_args={
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5
        }
    )
else:
    # Development: Use SQLite
    DB_PATH = Path("voice_transcript.db")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///./{DB_PATH}"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    """User model for authentication"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Integer, default=1)
    
    # Relationships
    transcripts = relationship("Transcript", back_populates="user")
    settings = relationship("UserSettings", back_populates="user", uselist=False)


class Transcript(Base):
    """Transcript model for storing audio transcriptions"""
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    transcript_id = Column(String, unique=True, index=True, nullable=False)  # e.g., "uid_filename"
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    text_content = Column(Text, nullable=False)  # Full transcript text
    json_content = Column(Text, nullable=True)  # Full JSON from AssemblyAI
    created_at = Column(DateTime, default=datetime.utcnow)
    # "processing" while the audio is being transcribed in the background, then
    # "completed" or "failed" (with `error`).
    status = Column(String, default="completed", nullable=False)
    error = Column(Text, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="transcripts")
    chat_messages = relationship("ChatMessage", back_populates="transcript", cascade="all, delete-orphan")
    speaker_mappings = relationship("SpeakerMapping", back_populates="transcript", cascade="all, delete-orphan")


class ChatMessage(Base):
    """Chat message model for AI conversations about transcripts"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id"), nullable=False)
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    transcript = relationship("Transcript", back_populates="chat_messages")


class SpeakerMapping(Base):
    """Mapping for renaming speakers in a transcript"""
    __tablename__ = "speaker_mappings"

    id = Column(Integer, primary_key=True, index=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id"), nullable=False)
    original_label = Column(String, nullable=False)  # e.g., "A", "B", "Speaker A"
    display_name = Column(String, nullable=False)    # e.g., "John Doe"
    
    # Relationships
    transcript = relationship("Transcript", back_populates="speaker_mappings")


class LoginCode(Base):
    """One-time e-mail sign-in code (only a keyed hash of the code is stored)"""
    __tablename__ = "login_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    code_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0)
    used = Column(Integer, default=0)  # 0 = still valid, 1 = used or burned


class PasswordResetToken(Base):
    """Token for password reset requests"""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Integer, default=0)  # 0 = not used, 1 = used
    
    # Relationships
    user = relationship("User")


class UserSettings(Base):
    """User settings for customizing the application"""
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # AI Chat settings
    system_prompt_template = Column(Text, nullable=True)  # Template with {transcript} placeholder
    default_user_prompt = Column(Text, nullable=True)  # Default first user message
    ai_model = Column(String, default="gpt-4o-mini")  # AI model selection
    response_length = Column(String, default="medium")  # short/medium/detailed
    temperature = Column(String, default="0.7")  # AI creativity (0-1)
    
    # Transcription settings
    default_quality = Column(String, default="medium")  # low/medium/high
    default_language = Column(String, nullable=True)  # null = auto-detect
    
    # Display settings
    theme = Column(String, default="system")  # light/dark/system
    date_format = Column(String, default="us")  # us/eu
    font_size = Column(String, default="medium")  # small/medium/large
    
    # Relationships
    user = relationship("User", back_populates="settings")


# Columns added after the first release: create_all() never alters an existing
# table, so add what is missing. (table, column, DDL type and default)
_ADDED_COLUMNS = [
    ("transcripts", "status", "VARCHAR NOT NULL DEFAULT 'completed'"),
    ("transcripts", "error", "TEXT"),
]


def _add_missing_columns():
    inspector = inspect(engine)
    for table, column, ddl in _ADDED_COLUMNS:
        if table not in inspector.get_table_names():
            continue
        if column in {c["name"] for c in inspector.get_columns(table)}:
            continue
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        print(f"[DB] Added column {table}.{column}", flush=True)


def init_db():
    """Initialize database and create tables"""
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
