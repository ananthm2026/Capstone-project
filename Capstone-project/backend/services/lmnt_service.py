"""
lmnt_service.py — Voice cloning using LMNT API.
Flow: extract audio sample → clone voice → synthesize translated text → return audio path
"""
import os
import logging
import tempfile
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

LMNT_API_KEY = os.getenv("LMNT_API_KEY")
LMNT_BASE = "https://api.lmnt.com/v1"

# LMNT supported languages (as of 2024)
LMNT_LANG_MAP = {
    "en-IN": "en", "hi-IN": "hi", "kn-IN": "kn",
    "ta-IN": "ta", "te-IN": "te", "ml-IN": "ml",
    "bn-IN": "bn", "mr-IN": "mr", "gu-IN": "gu",
    "pa-IN": "pa", "or-IN": "en",  # fallback to en
}


def _headers():
    return {
        "X-API-Key": LMNT_API_KEY,
        "Authorization": f"Bearer {LMNT_API_KEY}",
    }


def clone_voice(audio_path: str, voice_name: str = "cloned_voice") -> str:
    """Create an instant voice clone. Returns voice_id."""
    if not LMNT_API_KEY:
        raise Exception("LMNT_API_KEY not set")

    logger.info(f"[lmnt] Cloning voice from: {audio_path}")

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    # Try v1 clone endpoint
    resp = requests.post(
        f"{LMNT_BASE}/ai/voice/clone",
        headers={"X-API-Key": LMNT_API_KEY},
        files={"audio_file": ("sample.wav", audio_bytes, "audio/wav")},
        data={"name": voice_name, "enhance": "true"},
        timeout=60,
    )

    logger.info(f"[lmnt] Clone response: {resp.status_code} {resp.text[:200]}")

    if resp.status_code not in (200, 201):
        raise Exception(f"LMNT clone failed {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    voice_id = (data.get("voice") or {}).get("id") or data.get("id") or data.get("voice_id")
    if not voice_id:
        raise Exception(f"LMNT: no voice_id in response: {data}")

    logger.info(f"[lmnt] Voice cloned: {voice_id}")
    return voice_id


def synthesize(text: str, voice_id: str, language: str = "en") -> str:
    """Synthesize text using a cloned voice. Returns path to WAV."""
    if not LMNT_API_KEY:
        raise Exception("LMNT_API_KEY not set")

    lang = LMNT_LANG_MAP.get(language, "en")
    logger.info(f"[lmnt] Synthesizing: voice={voice_id}, lang={lang}, text='{text[:60]}'")

    resp = requests.post(
        f"{LMNT_BASE}/ai/speech",
        headers={"X-API-Key": LMNT_API_KEY, "Content-Type": "application/json"},
        json={
            "text": text,
            "voice": voice_id,
            "language": lang,
            "format": "wav",
            "sample_rate": 24000,
        },
        timeout=120,
    )

    logger.info(f"[lmnt] Synthesis response: {resp.status_code}")

    if resp.status_code != 200:
        raise Exception(f"LMNT synthesis failed {resp.status_code}: {resp.text[:200]}")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.write(resp.content)
    tmp.close()
    logger.info(f"[lmnt] Audio generated: {tmp.name}")
    return tmp.name


def delete_voice(voice_id: str):
    """Delete cloned voice after use (GDPR cleanup)."""
    try:
        requests.delete(
            f"{LMNT_BASE}/ai/voice/{voice_id}",
            headers=_headers(),
            timeout=10,
        )
        logger.info(f"[lmnt] Voice deleted: {voice_id}")
    except Exception as e:
        logger.warning(f"[lmnt] Failed to delete voice {voice_id}: {e}")


def clone_and_speak(audio_sample_path: str, text: str, language: str) -> str:
    """
    Full pipeline: clone voice from sample → synthesize text → delete clone.
    Returns path to generated audio.
    """
    voice_id = None
    try:
        voice_id = clone_voice(audio_sample_path)
        audio_path = synthesize(text, voice_id, language)
        return audio_path
    finally:
        if voice_id:
            delete_voice(voice_id)


def is_available() -> bool:
    return bool(LMNT_API_KEY)
