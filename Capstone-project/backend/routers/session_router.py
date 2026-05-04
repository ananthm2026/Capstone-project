"""
session_router.py — Native-to-English session CRUD endpoints.
POST /api/native-to-english/session              → Create session
POST /api/native-to-english/transcription         → Add transcription to session
GET  /api/native-to-english/sessions/{user_id}    → Get all sessions for user
"""
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from database import SessionLocal
from models import NativeToEnglishSession, NativeToEnglishTranscription

router = APIRouter(prefix="/api/native-to-english", tags=["sessions"])
logger = logging.getLogger(__name__)


@router.post("/session")
async def create_n2e_session(request: dict):
    """
    Create a new Native to English session.
    Body: user_id, original_language, original_text, translated_text.
    """
    db = SessionLocal()
    try:
        user_id = request.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        session = NativeToEnglishSession(
            id=str(uuid4()),
            user_id=user_id,
            original_language=request.get("original_language", "hi-IN"),
            target_language="en-IN",
            original_text=request.get("original_text"),
            translated_text=request.get("translated_text"),
        )
        db.add(session)
        db.commit()
        return {"status": "success", "session_id": session.id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving N2E session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database save failed")
    finally:
        db.close()


@router.post("/transcription")
async def add_n2e_transcription(request: dict):
    """
    Add a transcription to an existing session.
    Body: session_id, original_transcript, tone_applied, rewritten_text,
          custom_tone_desc, confidence_score.
    """
    db = SessionLocal()
    try:
        session_id = request.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")

        transcription = NativeToEnglishTranscription(
            id=str(uuid4()),
            session_id=session_id,
            original_transcript=request.get("original_transcript", ""),
            tone_applied=request.get("tone_applied"),
            rewritten_text=request.get("rewritten_text"),
            custom_tone_desc=request.get("custom_tone_desc"),
            was_toned=bool(request.get("tone_applied")),
            confidence_score=request.get("confidence_score"),
        )
        db.add(transcription)
        db.commit()
        return {"status": "success", "transcription_id": transcription.id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving N2E transcription: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database save failed")
    finally:
        db.close()


@router.get("/sessions/{user_id}")
async def get_n2e_sessions(user_id: str):
    """Get all Native to English sessions for a user."""
    db = SessionLocal()
    try:
        sessions = (
            db.query(NativeToEnglishSession)
            .filter(NativeToEnglishSession.user_id == user_id)
            .order_by(NativeToEnglishSession.created_at.desc())
            .all()
        )

        result = []
        for session in sessions:
            transcriptions = (
                db.query(NativeToEnglishTranscription)
                .filter(NativeToEnglishTranscription.session_id == session.id)
                .order_by(NativeToEnglishTranscription.created_at)
                .all()
            )

            result.append(
                {
                    "id": session.id,
                    "original_language": session.original_language,
                    "target_language": session.target_language,
                    "original_text": session.original_text,
                    "translated_text": session.translated_text,
                    "created_at": session.created_at.isoformat(),
                    "transcriptions_count": len(transcriptions),
                    "transcriptions": [
                        {
                            "id": t.id,
                            "original_transcript": t.original_transcript,
                            "tone_applied": t.tone_applied,
                            "rewritten_text": t.rewritten_text,
                            "was_toned": t.was_toned,
                            "confidence_score": t.confidence_score,
                        }
                        for t in transcriptions
                    ],
                }
            )

        return {"status": "success", "sessions": result}
    finally:
        db.close()
