"""
slack_router.py — Slack /n2e slash command integration.
POST /api/slack/n2e        → Unified text + voice translation command
POST /api/slack/n2e/voice  → Push-to-talk via React frontend
"""
import os
import logging
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import aiofiles

from services.sarvam_client import translate_speech_to_text, translate_text
from services.slack_service import handle_n2e_command

router = APIRouter(prefix="/api/slack", tags=["slack"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
CHUNK_SIZE = 1024 * 1024  # 1MB


class SlackN2ERequest(BaseModel):
    """Unified Slack /n2e translation request (handles both text and voice)."""
    command: str = "/n2e"
    text: Optional[str] = None
    file_url: Optional[str] = None
    user_id: Optional[str] = None
    team_id: Optional[str] = None
    channel_id: Optional[str] = None
    response_url: Optional[str] = None
    bot_token: Optional[str] = None
    source_language: str = "en-IN"
    target_language: str = "en"


@router.post("/n2e")
async def handle_slack_n2e(request: SlackN2ERequest):
    """
    Unified Slack slash command handler for /n2e.
    Handles BOTH text and voice translation.
    """
    if not request.text and not request.file_url:
        raise HTTPException(
            status_code=400,
            detail="Please provide either text or upload an audio file",
        )

    try:
        logger.info(
            f"Slack /n2e command: text={'provided' if request.text else 'None'}, "
            f"file_url={'provided' if request.file_url else 'None'}"
        )
        response = handle_n2e_command(
            text=request.text,
            file_url=request.file_url,
            source_language=request.source_language,
            target_language=request.target_language,
        )
        return response
    except Exception as e:
        logger.error(f"Slack /n2e command error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/n2e/voice")
async def handle_n2e_voice(
    audio: UploadFile = File(...),
    source_language: str = "en-IN",
    target_language: str = "en",
):
    """
    Push-to-talk endpoint for /n2e command via React frontend.
    Receives voice audio, transcribes, and translates.
    """
    original_filename = audio.filename or "recording.webm"
    content_type = audio.content_type or "audio/webm"

    if content_type == "application/octet-stream":
        ext_map = {".webm": "audio/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg"}
        for ext, mime in ext_map.items():
            if original_filename.endswith(ext):
                content_type = mime
                break
        else:
            content_type = "audio/webm"

    logger.info(
        f"Push-to-talk: {original_filename}, {source_language} → {target_language}"
    )

    os.makedirs("temp_audio", exist_ok=True)
    temp_path = f"temp_audio/push2talk_{original_filename}"

    try:
        file_size = 0
        async with aiofiles.open(temp_path, "wb") as buffer:
            while chunk := await audio.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size is {MAX_FILE_SIZE / (1024*1024)}MB",
                    )
                await buffer.write(chunk)

        logger.info(f"Push-to-talk audio saved: {temp_path} ({file_size / 1024:.2f}KB)")

        # Step 1: Speech to text
        stt_result = translate_speech_to_text(temp_path, content_type=content_type)
        transcript = stt_result.get("transcript", "").strip()

        if not transcript:
            raise HTTPException(
                status_code=400,
                detail="Could not transcribe audio. Please try again.",
            )

        logger.info(f"Transcript: {transcript}")

        # Step 2: Translate text
        translation_result = translate_text(
            transcript, source_language, target_language
        )
        translation = translation_result.get("translated_text", "").strip()

        if not translation:
            raise HTTPException(
                status_code=500, detail="Translation failed. Please try again."
            )

        logger.info(f"Translation: {translation}")

        return {
            "transcript": transcript,
            "translation": translation,
            "source_language": source_language,
            "target_language": target_language,
            "response_type": "in_channel",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Push-to-talk error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass
