import os
import requests
import logging
from http.client import IncompleteRead
from pathlib import Path
from dotenv import load_dotenv
from services.audio_utils import get_audio_duration, split_audio_into_chunks, cleanup_chunks
from services.translation_cache import get_cached, store_translation

# Load .env from the backend directory explicitly
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger(__name__)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
MAX_AUDIO_DURATION = 25  # Sarvam supports up to 30 seconds, use 25 for safety

def translate_speech_to_text(audio_file_path: str, content_type: str = "audio/wav") -> dict:
    """
    Calls Sarvam AI's speech-to-text-translate API.
    Falls back to Gemini if Sarvam fails.
    """
    if not SARVAM_API_KEY:
        logger.warning("SARVAM_API_KEY not set, trying Gemini fallback")
        return _transcribe_with_gemini(audio_file_path)

    try:
        duration = get_audio_duration(audio_file_path)
        logger.info(f"Audio duration: {duration:.2f} seconds")

        if duration <= MAX_AUDIO_DURATION:
            return _process_single_audio(audio_file_path, content_type)

        chunk_paths = split_audio_into_chunks(audio_file_path, chunk_duration_seconds=MAX_AUDIO_DURATION)
        logger.info(f"Splitting into {len(chunk_paths)} chunks...")

        from concurrent.futures import ThreadPoolExecutor
        try:
            with ThreadPoolExecutor(max_workers=min(len(chunk_paths), 10)) as executor:
                futures = [executor.submit(_process_single_audio, path, "audio/wav") for path in chunk_paths]
                results = [f.result() for f in futures]
            full_transcript = " ".join([r["transcript"] for r in results if r.get("transcript")])
            full_native = " ".join([r["native_transcript"] for r in results if r.get("native_transcript")])
            conf_scores = [r["confidence"] for r in results if r.get("confidence") is not None]
            avg_confidence = round(sum(conf_scores) / len(conf_scores), 3) if conf_scores else None
            return {"transcript": full_transcript, "native_transcript": full_native, "confidence": avg_confidence}
        finally:
            cleanup_chunks(chunk_paths)

    except Exception as e:
        logger.warning(f"Sarvam STT failed: {e}, trying Gemini fallback")
        return _transcribe_with_gemini(audio_file_path)

def _transcribe_with_gemini(audio_file_path: str) -> dict:
    """Fallback: use Google Gemini to transcribe audio when Sarvam fails."""
    try:
        GEMINI_KEY = os.getenv("GEMINI_API_KEY")
        if not GEMINI_KEY:
            raise Exception("GEMINI_API_KEY not set")

        import google.generativeai as genai
        genai.configure(api_key=GEMINI_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")

        with open(audio_file_path, "rb") as f:
            audio_bytes = f.read()

        # Determine mime type from extension
        ext = os.path.splitext(audio_file_path)[1].lower()
        mime_map = {
            ".wav": "audio/wav", ".webm": "audio/webm", ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".flac": "audio/flac",
        }
        mime_type = mime_map.get(ext, "audio/webm")

        import base64
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        response = model.generate_content([
            "Transcribe the following audio to English text. "
            "If the speaker is not speaking English, translate it to English. "
            "Return ONLY the transcribed/translated text, nothing else.",
            {"mime_type": mime_type, "data": audio_b64},
        ])

        transcript = response.text.strip()
        logger.info(f"Gemini audio transcription: {transcript[:100]}")
        return {"transcript": transcript, "confidence": None, "source_language": "en-IN"}
    except Exception as e:
        logger.error(f"Gemini audio transcription failed: {e}")
        raise Exception(f"Transcription failed: {e}")


def _convert_to_wav(audio_file_path: str) -> str | None:
    """
    Converts any audio format to 16kHz mono WAV using ffmpeg.
    Returns the new WAV path, or None if ffmpeg is unavailable.
    """
    import subprocess, tempfile
    wav_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    wav_path = wav_file.name
    wav_file.close()
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", audio_file_path,
             "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", wav_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and os.path.exists(wav_path):
            return wav_path
        logger.warning(f"ffmpeg conversion failed: {result.stderr[:200]}")
    except FileNotFoundError:
        logger.warning("ffmpeg not found — sending original audio to Sarvam")
    except Exception as e:
        logger.warning(f"ffmpeg error: {e}")
    try:
        os.unlink(wav_path)
    except Exception:
        pass
    return None


def _process_single_audio(audio_file_path: str, content_type: str) -> dict:
    """
    Processes a single audio file (must be <= 30 seconds).
    Converts to WAV first, retries up to 3 times on connection errors.
    Returns dict with 'transcript', 'native_transcript', and 'confidence' keys.
    """
    url_translate = "https://api.sarvam.ai/speech-to-text-translate"
    url_native = "https://api.sarvam.ai/speech-to-text"
    headers = {"api-subscription-key": SARVAM_API_KEY}

    # Convert to WAV for best Sarvam compatibility
    wav_path = _convert_to_wav(audio_file_path)
    send_path = wav_path if wav_path else audio_file_path
    send_ct = "audio/wav" if wav_path else content_type
    filename = os.path.basename(send_path)

    logger.info(f"Sending audio to Sarvam: file={filename}, content_type={send_ct}")

    def _make_req(url, model_name):
        last_exc = None
        for attempt in range(1, 4):  # up to 3 attempts
            try:
                with open(send_path, "rb") as f:
                    files = {"file": (filename, f, send_ct)}
                    data = {"model": model_name, "prompt": ""}
                    response = requests.post(
                        url, headers=headers, files=files, data=data,
                        timeout=90, stream=False
                    )
                return response
            except (requests.exceptions.ChunkedEncodingError,
                    requests.exceptions.ConnectionError,
                    requests.exceptions.Timeout,
                    IncompleteRead,
                    ConnectionError,
                    OSError) as e:
                last_exc = e
                logger.warning(f"Sarvam attempt {attempt}/3 failed on {url}: {e}")
                if attempt < 3:
                    import time; time.sleep(1.5 * attempt)
        raise Exception(f"Sarvam connection failed after 3 attempts on {url}: {last_exc}")

    from concurrent.futures import ThreadPoolExecutor
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_trans = executor.submit(_make_req, url_translate, "saaras:v2.5")
            fut_native = executor.submit(_make_req, url_native, "saaras:v3")
            
            resp_trans = fut_trans.result()
            resp_native = fut_native.result()
    finally:
        if wav_path:
            try: os.unlink(wav_path)
            except Exception: pass

    logger.info(f"Sarvam STT-Translate response: status={resp_trans.status_code}, body={resp_trans.text[:300]}")
    logger.info(f"Sarvam STT-Native response: status={resp_native.status_code}, body={resp_native.text[:300]}")
    
    if resp_trans.status_code == 200 and resp_native.status_code == 200:
        tbody = resp_trans.json()
        nbody = resp_native.json()
        
        transcript = tbody.get("transcript", "")
        native_transcript = nbody.get("transcript", "")
        confidence = tbody.get("confidence", None)
        
        if confidence is None:
            words = tbody.get("words", [])
            if words:
                scores = [w.get("confidence", 1.0) for w in words if "confidence" in w]
                confidence = round(sum(scores) / len(scores), 3) if scores else None
                
        return {"transcript": transcript, "native_transcript": native_transcript, "confidence": confidence}
    else:
        logger.error(f"Sarvam STT error trans_status={resp_trans.status_code}, native_status={resp_native.status_code}")
        raise Exception(f"Sarvam STT failed. TextTranslate={resp_trans.status_code}, STT={resp_native.status_code}")

def translate_text(text: str, source_language: str, target_language: str) -> str:
    """
    Translates text to the target language.
    Checks the semantic cache first — only calls Sarvam on a cache miss.
    Falls back to Gemini if Sarvam fails.
    For structured email text (contains Subject:), translates line-by-line to preserve formatting.
    """
    # ── Structured email: translate line-by-line to preserve format ───────
    is_email = text.strip().startswith("Subject:")
    if is_email:
        lines = text.split('\n')
        translated_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                translated_lines.append('')
            elif stripped.lower().startswith('subject:'):
                # Keep "Subject:" label in English, translate only the subject value
                subject_value = stripped[8:].strip()
                translated_subject = _translate_single(subject_value, source_language, target_language) if subject_value else ''
                translated_lines.append(f"Subject: {translated_subject}")
            elif stripped in ('Yours sincerely,', 'Cheers,', 'Dear Sir/Madam,', 'Hi there,',
                              'Regards,', 'Best regards,', 'Kind regards,', 'Thanks,'):
                # Keep standard salutations/closings as-is (they're universally understood)
                translated_lines.append(stripped)
            else:
                translated_lines.append(_translate_single(stripped, source_language, target_language))
        return '\n'.join(translated_lines)

    # ── General text with newlines: translate line-by-line to preserve breaks ─
    if '\n' in text:
        lines = text.split('\n')
        translated_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                translated_lines.append('')
            else:
                translated_lines.append(_translate_single(stripped, source_language, target_language))
        return '\n'.join(translated_lines)

    return _translate_single(text, source_language, target_language)


def _translate_single(text: str, source_language: str, target_language: str) -> str:
    """Translate a single chunk of text, with cache + Sarvam + Gemini fallback."""
    # ── Layer 1 & 2: cache lookup ─────────────────────────────────────────
    cached = get_cached(text, target_language)
    if cached:
        return cached

    # ── Cache miss: try Sarvam first ──────────────────────────────────────
    if SARVAM_API_KEY:
        try:
            url = "https://api.sarvam.ai/translate"
            payload = {
                "input": text,
                "source_language_code": source_language,
                "target_language_code": target_language,
                "speaker_gender": "Male",
                "mode": "formal",
                "model": "mayura:v1",
                "enable_preprocessing": True,
            }
            headers = {
                "api-subscription-key": SARVAM_API_KEY,
                "Content-Type": "application/json",
            }
            logger.info(f"Sarvam translate: src={source_language}, tgt={target_language}, text='{text[:80]}'")
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            logger.info(f"Sarvam response: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                if "translated_text" in data:
                    result = data["translated_text"]
                elif "translations" in data:
                    r = data["translations"]
                    result = r[0] if isinstance(r, list) else r
                elif "translation" in data:
                    result = data["translation"]
                else:
                    raise Exception(f"Unexpected Sarvam response: {data}")
                store_translation(text, target_language, result)
                return result
            else:
                logger.warning(f"Sarvam failed ({response.status_code}: {response.text[:200]}), falling back to Gemini")
        except Exception as e:
            logger.warning(f"Sarvam error: {e}, falling back to Gemini")

    # ── Fallback: Gemini ──────────────────────────────────────────────────
    try:
        from services.gemini_client import gemini_translate_text
        logger.info(f"Using Gemini fallback for {target_language}")
        result = gemini_translate_text(text, source_language, target_language)
        store_translation(text, target_language, result)
        return result
    except Exception as e:
        logger.error(f"Gemini fallback also failed: {e}")
        # Return original text rather than crashing — caller can handle gracefully
        return text
