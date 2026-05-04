"""
e2n_router.py — English-to-Native session & translation endpoints.
POST /api/english-to-native/session                → Create E2N session
POST /api/english-to-native/translation            → Save a translation within a session
GET  /api/english-to-native/sessions/{user_id}     → Get all E2N sessions for a user
"""
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from database import SessionLocal
from models import EnglishToNativeSession, EnglishToNativeTranslation

router = APIRouter(prefix="/api/english-to-native", tags=["english-to-native"])
logger = logging.getLogger(__name__)


@router.post("/session")
async def create_e2n_session(request: dict):
    """
    Create a new English-to-Native session.
    Body: user_id, target_language, original_language (optional, defaults to en-IN).
    """
    db = SessionLocal()
    try:
        user_id = request.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        target_language = request.get("target_language")
        if not target_language:
            raise HTTPException(status_code=400, detail="target_language is required")

        session = EnglishToNativeSession(
            id=str(uuid4()),
            user_id=user_id,
            original_language=request.get("original_language", "en-IN"),
            target_language=target_language,
        )
        db.add(session)
        db.commit()
        return {"status": "success", "session_id": session.id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving E2N session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database save failed")
    finally:
        db.close()


@router.post("/translation")
async def add_e2n_translation(request: dict):
    """
    Save a translation within an existing E2N session.
    Body: session_id, input_text, translated_text, tone_applied (optional), toned_text (optional).
    """
    db = SessionLocal()
    try:
        session_id = request.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")

        translation = EnglishToNativeTranslation(
            id=str(uuid4()),
            session_id=session_id,
            input_text=request.get("input_text", ""),
            translated_text=request.get("translated_text", ""),
        )
        db.add(translation)
        db.commit()
        return {"status": "success", "translation_id": translation.id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving E2N translation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database save failed")
    finally:
        db.close()


@router.get("/sessions/{user_id}")
async def get_e2n_sessions(user_id: str):
    """Get all English-to-Native sessions for a user."""
    db = SessionLocal()
    try:
        sessions = (
            db.query(EnglishToNativeSession)
            .filter(EnglishToNativeSession.user_id == user_id)
            .order_by(EnglishToNativeSession.created_at.desc())
            .all()
        )

        result = []
        for session in sessions:
            translations = (
                db.query(EnglishToNativeTranslation)
                .filter(EnglishToNativeTranslation.session_id == session.id)
                .order_by(EnglishToNativeTranslation.created_at)
                .all()
            )

            result.append(
                {
                    "id": session.id,
                    "original_language": session.original_language,
                    "target_language": session.target_language,
                    "created_at": session.created_at.isoformat() if session.created_at else None,
                    "translations_count": len(translations),
                    "translations": [
                        {
                            "id": t.id,
                            "input_text": t.input_text,
                            "translated_text": t.translated_text,
                            "created_at": t.created_at.isoformat() if t.created_at else None,
                        }
                        for t in translations
                    ],
                }
            )

        return {"status": "success", "sessions": result}
    finally:
        db.close()
