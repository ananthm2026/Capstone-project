"""
voice_clone_service.py — Voice cloning using Coqui XTTS-v2.
Clones the speaker's voice from the original video audio and
generates translated speech in that same voice.
"""
import os
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# XTTS-v2 language codes
XTTS_LANG_MAP = {
    "en-IN": "en", "hi-IN": "hi", "kn-IN": "kn",
    "ta-IN": "ta", "te-IN": "te", "ml-IN": "ml",
    "bn-IN": "bn", "mr-IN": "mr", "gu-IN": "gu",
    "pa-IN": "pa", "or-IN": "or", "fr-FR": "fr",
    "de-DE": "de", "es-ES": "es", "ja-JP": "ja",
    "zh-CN": "zh-cn", "ar-SA": "ar",
}

_tts_model = None


def _load_model():
    """Lazy-load XTTS-v2 model (downloads ~1.8GB on first run)."""
    global _tts_model
    if _tts_model is not None:
        return _tts_model
    try:
        from TTS.api import TTS
        logger.info("[xtts] Loading XTTS-v2 model (first run downloads ~1.8GB)...")
        _tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        logger.info("[xtts] Model loaded successfully")
        return _tts_model
    except ImportError:
        raise RuntimeError(
            "Coqui TTS not installed. Run: pip install TTS"
        )
    except Exception as e:
        raise RuntimeError(f"Failed to load XTTS-v2 model: {e}")


def clone_and_speak(
    text: str,
    speaker_audio_path: str,
    target_language: str,
    emotion: str = "neutral",
) -> str:
    """
    Generate speech in the cloned voice of the original speaker.

    Args:
        text: Translated text to speak
        speaker_audio_path: Path to original video's extracted audio (WAV)
        target_language: Target language code (e.g. 'hi-IN')
        emotion: Detected emotion for post-processing

    Returns:
        Path to generated WAV file
    """
    lang = XTTS_LANG_MAP.get(target_language, "en")
    logger.info(f"[xtts] Cloning voice: lang={lang}, emotion={emotion}, text='{text[:60]}'")

    tts = _load_model()

    out_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    out_path = out_file.name
    out_file.close()

    tts.tts_to_file(
        text=text,
        speaker_wav=speaker_audio_path,
        language=lang,
        file_path=out_path,
    )

    logger.info(f"[xtts] Voice cloned audio: {out_path}")

    # Apply emotion-aware pitch/tempo via ffmpeg
    from services.tts_service import _apply_emotion_filter
    final_path = _apply_emotion_filter(out_path, emotion)
    if final_path != out_path and os.path.exists(out_path):
        try:
            os.remove(out_path)
        except Exception:
            pass

    return final_path


def is_available() -> bool:
    """Check if Coqui TTS is installed and importable."""
    try:
        from TTS.api import TTS  # noqa
        return True
    except (ImportError, Exception):
        return False
