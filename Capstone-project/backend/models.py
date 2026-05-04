"""
models.py — SQLAlchemy ORM models for PostgreSQL.
Synced with Clerk OAuth user data.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text, Float, ForeignKey, Boolean, Integer, Index
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id                 = Column(String(50), primary_key=True)           # Clerk user ID
    email              = Column(String(255), nullable=False, unique=True, index=True)
    first_name         = Column(String(100), nullable=True)
    last_name          = Column(String(100), nullable=True)
    avatar_url         = Column(String, nullable=True)
    created_at         = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # GDPR consent
    consent_given      = Column(Boolean, nullable=False, default=False)
    consent_timestamp  = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "email":             self.email,
            "first_name":        self.first_name,
            "last_name":         self.last_name,
            "avatar_url":        self.avatar_url,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
            "consent_given":     self.consent_given,
            "consent_timestamp": self.consent_timestamp.isoformat() if self.consent_timestamp else None,
        }


# ══════════════════════════════════════════════════════════════════════════════
# NATIVE TO ENGLISH
# ══════════════════════════════════════════════════════════════════════════════

class NativeToEnglishSession(Base):
    __tablename__ = "native_to_english_sessions"

    id                  = Column(String(50), primary_key=True)
    user_id             = Column(String(50), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_language   = Column(String(10), nullable=False)
    target_language     = Column(String(10), nullable=False, default='en-IN')
    original_text       = Column(Text, nullable=True)    # Added original text in local language script
    translated_text     = Column(Text, nullable=True)    # Added translated text
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_n2e_user_created', 'user_id', 'created_at'),
        Index('idx_n2e_lang_pair', 'original_language', 'target_language'),
    )

    transcriptions = relationship("NativeToEnglishTranscription", back_populates="session", cascade="all, delete-orphan")


class NativeToEnglishTranscription(Base):
    __tablename__ = "native_to_english_transcriptions"

    id                  = Column(String(50), primary_key=True)
    session_id          = Column(String(50), ForeignKey("native_to_english_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    original_transcript = Column(Text, nullable=False)
    tone_applied        = Column(String(50), nullable=True)
    rewritten_text      = Column(Text, nullable=True)
    custom_tone_desc    = Column(Text, nullable=True)
    was_toned           = Column(Boolean, nullable=False, default=False)
    confidence_score    = Column(Float, nullable=True)
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_n2e_session_created', 'session_id', 'created_at'),
    )

    session = relationship("NativeToEnglishSession", back_populates="transcriptions")


# ══════════════════════════════════════════════════════════════════════════════
# ENGLISH TO NATIVE
# ══════════════════════════════════════════════════════════════════════════════

class EnglishToNativeSession(Base):
    __tablename__ = "english_to_native_sessions"

    id                = Column(String(50), primary_key=True)
    user_id           = Column(String(50), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_language = Column(String(10), nullable=False, default='en-IN')
    target_language   = Column(String(10), nullable=False)
    created_at        = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_e2n_user_created', 'user_id', 'created_at'),
    )

    translations = relationship("EnglishToNativeTranslation", back_populates="session", cascade="all, delete-orphan")


class EnglishToNativeTranslation(Base):
    __tablename__ = "english_to_native_translations"

    id              = Column(String(50), primary_key=True)
    session_id      = Column(String(50), ForeignKey("english_to_native_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    input_text      = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    created_at      = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_e2n_trans_session_created', 'session_id', 'created_at'),
    )

    session = relationship("EnglishToNativeSession", back_populates="translations")

