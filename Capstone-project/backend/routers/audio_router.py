"""
audio_router.py — Audio processing endpoints.
POST /api/translate-audio      → Transcribe audio to English + native
POST /api/diarize-audio        → Speaker diarization
POST /api/synthesize-conversation → TTS per speaker segment
POST /api/text-to-speech       → Text-to-speech conversion
"""
import os
import logging
import base64

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import aiofiles

from services.sarvam_client import translate_speech_to_text
from services.tts_service import (
    text_to_speech_gtts,
    text_to_speech_sarvam,
    get_gtts_language_code,
)
from services.diarization_service import assign_speaker_voices

router = APIRouter(prefix="/api", tags=["audio"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
CHUNK_SIZE = 1024 * 1024  # 1MB


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    use_sarvam: bool = False
    speaker: str = "meera"


def _resolve_content_type(content_type: str, filename: str) -> str:
    """Map generic content types to specific audio MIME types based on extension."""
    if content_type != "application/octet-stream":
        return content_type
    ext_map = {
        ".webm": "audio/webm",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/x-m4a",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }
    for ext, mime in ext_map.items():
        if filename.endswith(ext):
            return mime
    return "audio/webm"


@router.post("/translate-audio")
async def handle_audio_translation(file: UploadFile = File(...)):
    """
    Receives audio in local language, translates to English using Sarvam.
    Also returns native_transcript and confidence score.
    """
    original_filename = file.filename or "recording.webm"
    content_type = _resolve_content_type(
        file.content_type or "audio/webm", original_filename
    )

    logger.info(
        f"Received audio: filename={original_filename}, content_type={content_type}"
    )

    os.makedirs("temp_audio", exist_ok=True)
    # Use unique filename to prevent race conditions with concurrent requests
    import uuid
    unique_id = uuid.uuid4().hex[:8]
    ext = os.path.splitext(original_filename)[1] or ".webm"
    temp_path = f"temp_audio/{unique_id}{ext}"
    file_size = 0

    try:
        async with aiofiles.open(temp_path, "wb") as buffer:
            while chunk := await file.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size is {MAX_FILE_SIZE / (1024*1024)}MB",
                    )
                await buffer.write(chunk)

        logger.info(f"File saved: {temp_path}, size: {file_size / 1024:.2f}KB")

        result = translate_speech_to_text(temp_path, content_type=content_type)
        english_transcript = result.get("transcript", "")
        native_transcript = result.get("native_transcript", "")
        confidence = result.get("confidence", None)

        if not english_transcript or not english_transcript.strip():
            raise HTTPException(
                status_code=422,
                detail="Could not transcribe audio. Please speak clearly and try again.",
            )

        return {
            "transcript": english_transcript,
            "native_transcript": native_transcript,
            "confidence": confidence,
            "file_size": file_size,
            "filename": original_filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"translate-audio error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/diarize-audio")
async def handle_diarize_audio(
    file: UploadFile = File(None),
    speaker_count: int = Form(0),
    transcript: str = Form(""),
):
    """
    Diarize audio into speaker segments.
    - If 'transcript' form field is provided, skip STT and use it directly.
    - If 'file' is provided, transcribe it first.
    """
    full_transcript = transcript.strip()

    # Only process audio file if no transcript was provided
    if not full_transcript and file is not None:
        original_filename = file.filename or "recording.webm"
        content_type = file.content_type or "audio/webm"
        os.makedirs("temp_audio", exist_ok=True)
        temp_path = f"temp_audio/diarize_{original_filename}"
        try:
            async with aiofiles.open(temp_path, "wb") as f:
                while chunk := await file.read(1024 * 1024):
                    await f.write(chunk)

            stt = translate_speech_to_text(temp_path, content_type=content_type)
            full_transcript = stt.get("transcript", "").strip()
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    if not full_transcript:
        raise HTTPException(
            status_code=422,
            detail="Could not transcribe audio — speak clearly and try again",
        )

    try:
        # Audio-based diarization only works if we have a temp file
        temp_path_for_diarize = locals().get("temp_path", "")
        from services.audio_diarization import diarize_audio_file

        segments_raw = (
            diarize_audio_file(temp_path_for_diarize, full_transcript)
            if temp_path_for_diarize and os.path.exists(temp_path_for_diarize)
            else []
        )
        method = "audio" if segments_raw else "gemini"

        # Fallback to Gemini text-based if audio diarization failed
        if not segments_raw:
            logger.warning(
                "[diarize] Audio diarization returned no segments, falling back to Gemini text split"
            )
            method = "gemini"
            GEMINI_KEY = os.getenv("GEMINI_API_KEY")
            segments_raw = []

            if GEMINI_KEY:
                try:
                    import google.generativeai as genai

                    genai.configure(api_key=GEMINI_KEY)
                    model = genai.GenerativeModel("gemini-2.0-flash")

                    if speaker_count >= 2:
                        speaker_instruction = (
                            f"IMPORTANT: There are EXACTLY {speaker_count} speakers. "
                            f"You MUST use exactly {speaker_count} different people: "
                            f"{', '.join([f'Person {i+1}' for i in range(speaker_count)])}."
                        )
                    else:
                        speaker_instruction = "Identify how many distinct speakers there are (2 to 5)."

                    prompt = f"""You are an expert conversation analyst.

{speaker_instruction}

Split this transcript into individual speaker turns.
- Every sentence belongs to exactly one speaker
- Short responses like "yes", "okay" are often a different speaker
- Questions are usually answered by a different speaker
- Detect emotion per segment: happy, neutral, serious, sad, angry, excited
- Return ONLY a valid JSON array

Format:
[
  {{"speaker": "Person 1", "text": "...", "emotion": "neutral"}},
  {{"speaker": "Person 2", "text": "...", "emotion": "happy"}}
]

Transcript:
{full_transcript}"""

                    resp = model.generate_content(prompt)
                    raw = resp.text.strip()
                    if raw.startswith("```"):
                        raw = raw.split("```")[1]
                        if raw.startswith("json"):
                            raw = raw[4:]
                    import json

                    parsed = json.loads(raw.strip())
                    if isinstance(parsed, list) and parsed:
                        for seg in parsed:
                            sp = str(seg.get("speaker", "Person 1")).strip()
                            num = int(
                                "".join(filter(str.isdigit, sp)) or "1"
                            )
                            num = min(num, 5)
                            segments_raw.append(
                                {
                                    "speaker": f"Person {num}",
                                    "text": str(seg.get("text", "")).strip(),
                                    "emotion": str(
                                        seg.get("emotion", "neutral")
                                    ).lower(),
                                    "gender": "male",
                                }
                            )
                        segments_raw = [s for s in segments_raw if s["text"]]
                except Exception as e:
                    logger.warning(f"[diarize] Gemini fallback failed: {e}")

        # Last resort: sentence split
        if not segments_raw:
            method = "fallback"
            import re

            n_sp = max(2, min(5, speaker_count if speaker_count >= 2 else 2))
            sentences = re.split(r"(?<=[.!?])\s+", full_transcript)
            sentences = [s.strip() for s in sentences if s.strip()]
            for i, sent in enumerate(sentences):
                segments_raw.append(
                    {
                        "speaker": f"Person {(i % n_sp) + 1}",
                        "text": sent,
                        "emotion": "neutral",
                        "gender": "male" if i % 2 == 0 else "female",
                    }
                )

        # Assign voices
        for seg in segments_raw:
            if "voice" not in seg:
                seg["voice"] = {}
        segments = assign_speaker_voices(segments_raw)

        # Compute per-speaker confidence
        speaker_counts = {}
        for s in segments:
            speaker_counts[s["speaker"]] = speaker_counts.get(s["speaker"], 0) + 1
        total = len(segments)
        for s in segments:
            count = speaker_counts[s["speaker"]]
            s["confidence"] = round(min(0.95, 0.6 + (count / total) * 0.35), 2)

        return {
            "transcript": full_transcript,
            "segments": segments,
            "speaker_count": len(set(s["speaker"] for s in segments)),
            "method": method,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"diarize-audio error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/synthesize-conversation")
async def handle_synthesize_conversation(request: dict):
    """
    Generate TTS audio for each speaker segment in the target language.
    Returns base64 audio per segment.
    """
    segments = request.get("segments", [])
    target_language = request.get("target_language", "hi-IN")
    results = []

    for seg in segments:
        translated_text = seg.get("translated_text") or seg.get("text", "")
        emotion = seg.get("emotion", "neutral")
        voice_info = seg.get("voice", {})
        speaker = voice_info.get("sarvam", "anushka")
        gender = voice_info.get("gtts_gender", "female")

        audio_path = None
        try:
            audio_path = text_to_speech_sarvam(translated_text, target_language, speaker)
        except Exception:
            try:
                gtts_lang = get_gtts_language_code(target_language)
                audio_path = text_to_speech_gtts(
                    translated_text, gtts_lang, emotion=emotion, gender=gender
                )
            except Exception as e:
                results.append({"speaker": seg.get("speaker"), "error": str(e)})
                continue

        if audio_path and os.path.exists(audio_path):
            with open(audio_path, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode()
            os.remove(audio_path)
            results.append(
                {
                    "speaker": seg.get("speaker"),
                    "audio": audio_b64,
                    "emotion": emotion,
                }
            )

    return {"segments": results}


@router.post("/text-to-speech")
async def handle_text_to_speech(request: TTSRequest):
    """
    Converts text to speech and returns an audio file.
    Uses gTTS by default, set use_sarvam=true for Sarvam AI TTS.
    """
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > 5000:
        raise HTTPException(
            status_code=400, detail="Text too long. Maximum 5000 characters."
        )

    temp_audio_path = None

    try:
        logger.info(
            f"TTS request: language={request.language}, use_sarvam={request.use_sarvam}, speaker={request.speaker}"
        )

        if request.use_sarvam:
            temp_audio_path = text_to_speech_sarvam(
                text=request.text,
                language=request.language,
                speaker_gender=request.speaker,
            )
            logger.info(f"Sarvam TTS succeeded with speaker={request.speaker}")
        else:
            gtts_lang = get_gtts_language_code(request.language)
            temp_audio_path = text_to_speech_gtts(request.text, gtts_lang)

        return FileResponse(
            path=temp_audio_path,
            media_type="audio/wav" if request.use_sarvam else "audio/mpeg",
            filename="speech.wav" if request.use_sarvam else "speech.mp3",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {e}")
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        raise HTTPException(status_code=500, detail=str(e))
