"""
video_service.py — Video translation pipeline.
Flow: upload → extract audio → transcribe → translate → TTS → merge → return video
"""
import os
import uuid
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

TEMP_DIR = Path("temp_video")
TEMP_DIR.mkdir(exist_ok=True)

SUPPORTED_VIDEO = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

LANG_CODES = {
    "en-IN": "en", "hi-IN": "hi", "kn-IN": "kn",
    "ta-IN": "ta", "te-IN": "te", "ml-IN": "ml",
    "bn-IN": "bn", "mr-IN": "mr", "gu-IN": "gu",
    "pa-IN": "pa", "or-IN": "or",
}


def _run(cmd: list[str], label: str):
    """Run a subprocess command, raise on failure."""
    logger.info(f"[video] {label}: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed: {result.stderr[:300]}")
    return result


def check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except Exception:
        return False


def extract_audio(video_path: str) -> str:
    """Extract audio from video as WAV 16kHz mono — format Sarvam requires."""
    audio_path = str(TEMP_DIR / f"{uuid.uuid4()}.wav")
    _run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-af", "highpass=f=200,lowpass=f=3000",  # voice frequency filter
        audio_path
    ], "extract_audio")
    return audio_path


def merge_audio_video(video_path: str, audio_path: str) -> str:
    """Replace video audio with new TTS audio."""
    out_path = str(TEMP_DIR / f"translated_{uuid.uuid4()}.mp4")
    _run([
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        out_path
    ], "merge_audio_video")
    return out_path


def detect_emotion_from_text(text: str) -> str:
    """Use Gemini to detect emotion from transcript text."""
    try:
        import google.generativeai as genai
        from pathlib import Path
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=Path(__file__).parent / ".env")
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            return "neutral"
        genai.configure(api_key=key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = (
            "Detect the primary emotion in this text. "
            "Reply with exactly one word from: happy, neutral, serious, sad, angry, excited.\n\n"
            f"Text: {text[:500]}"
        )
        response = model.generate_content(prompt)
        emotion = response.text.strip().lower().split()[0]
        valid = {"happy", "neutral", "serious", "sad", "angry", "excited"}
        return emotion if emotion in valid else "neutral"
    except Exception as e:
        logger.warning(f"Emotion detection (text) failed: {e}")
        return "neutral"


def detect_emotion_from_audio(audio_path: str) -> str:
    """
    Detect emotion from audio using acoustic features:
    - RMS energy (loudness) → angry/excited vs sad/neutral
    - Speech rate (zero crossing rate) → excited/happy vs sad/serious
    - Pitch variance → emotional vs monotone
    """
    try:
        import wave, struct, math

        with wave.open(audio_path, "rb") as wf:
            framerate = wf.getframerate()
            frames = wf.readframes(wf.getnframes())

        samples = [struct.unpack("<h", frames[i:i+2])[0]
                   for i in range(0, min(len(frames)-1, framerate * 10 * 2), 2)]

        if len(samples) < 1000:
            return "neutral"

        n = len(samples)

        # 1. RMS energy (loudness)
        rms = math.sqrt(sum(s*s for s in samples) / n)
        max_val = 32768
        energy_ratio = rms / max_val  # 0.0 to 1.0

        # 2. Zero crossing rate (speech rate proxy)
        zcr = sum(1 for i in range(1, n) if (samples[i] >= 0) != (samples[i-1] >= 0)) / n

        # 3. Pitch variance (emotional expressiveness)
        chunk = 512
        chunk_rms = [math.sqrt(sum(samples[i+j]**2 for j in range(chunk)) / chunk)
                     for i in range(0, n - chunk, chunk)]
        if chunk_rms:
            mean_rms = sum(chunk_rms) / len(chunk_rms)
            variance = sum((r - mean_rms)**2 for r in chunk_rms) / len(chunk_rms)
            pitch_var = math.sqrt(variance) / (mean_rms + 1e-6)
        else:
            pitch_var = 0

        logger.info(f"[emotion-audio] energy={energy_ratio:.3f}, zcr={zcr:.4f}, pitch_var={pitch_var:.3f}")

        # Decision rules based on acoustic features
        if energy_ratio > 0.15 and zcr > 0.12:
            emotion = "angry"
        elif energy_ratio > 0.12 and pitch_var > 0.8:
            emotion = "excited"
        elif energy_ratio > 0.08 and zcr > 0.09:
            emotion = "happy"
        elif energy_ratio < 0.04 and zcr < 0.06:
            emotion = "sad"
        elif energy_ratio < 0.06 and pitch_var < 0.4:
            emotion = "serious"
        else:
            emotion = "neutral"

        logger.info(f"[emotion-audio] → {emotion}")
        return emotion

    except Exception as e:
        logger.warning(f"[emotion-audio] Detection failed: {e}")
        return "neutral"


def detect_gender_from_audio(audio_path: str) -> str:
    """
    Detect speaker gender using fundamental frequency via autocorrelation.
    Male: F0 < 165 Hz, Female: F0 >= 165 Hz
    """
    try:
        sample_path = audio_path.replace(".wav", "_sample.wav")
        r = subprocess.run([
            "ffmpeg", "-y", "-i", audio_path,
            "-t", "10", "-ar", "16000", "-ac", "1", sample_path
        ], capture_output=True, timeout=10)

        if r.returncode != 0:
            logger.warning(f"[gender] ffmpeg sample extraction failed: {r.stderr[:100]}")
            return "male"

        import wave, struct
        with wave.open(sample_path, "rb") as wf:
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            frames = wf.readframes(n_frames)

        try:
            os.remove(sample_path)
        except Exception:
            pass

        # Decode samples
        samples = [struct.unpack("<h", frames[i:i+2])[0]
                   for i in range(0, min(len(frames) - 1, framerate * 3 * 2), 2)]

        if len(samples) < 1000:
            logger.warning("[gender] Not enough samples, defaulting to male")
            return "male"

        # Autocorrelation pitch detection
        min_lag = int(framerate / 300)   # 300 Hz upper bound
        max_lag = int(framerate / 60)    # 60 Hz lower bound
        step = 4  # speed up by sampling every 4th

        best_lag = min_lag
        best_corr = float('-inf')
        n = len(samples)

        for lag in range(min_lag, min(max_lag, n // 2)):
            corr = sum(samples[i] * samples[i + lag]
                       for i in range(0, min(2000, n - lag), step))
            if corr > best_corr:
                best_corr = corr
                best_lag = lag

        f0 = framerate / best_lag
        gender = "female" if f0 >= 165 else "male"
        logger.info(f"[gender] F0={f0:.1f}Hz best_lag={best_lag} → {gender}")
        return gender

    except Exception as e:
        logger.warning(f"[gender] Detection failed: {e}, defaulting to male")
        return "male"


def process_video_translation(
    video_path: str,
    target_language: str,
    voice_type: str = "female",
    tone: str = "formal",
) -> dict:
    """
    Full pipeline:
    1. Extract audio
    2. Transcribe (Sarvam)
    3. Translate (Sarvam)
    4. Detect emotion (Gemini)
    5. TTS (gTTS / Sarvam)
    6. Merge back into video
    """
    audio_path = None
    tts_path = None

    try:
        # 1. Extract audio
        audio_path = extract_audio(video_path)
        logger.info(f"[video] Audio extracted: {audio_path}")

        # 2. Transcribe
        from services.sarvam_client import translate_speech_to_text
        stt = translate_speech_to_text(audio_path, content_type="audio/wav")
        transcript = stt.get("transcript", "").strip()
        source_language = stt.get("source_language", "en-IN")
        confidence = stt.get("confidence", None)

        if not transcript:
            raise ValueError("Could not transcribe audio — please ensure the video has clear speech.")

        logger.info(f"[video] Transcript ({source_language}): {transcript[:100]}")

        # 3. Translate (skip if same language)
        src_base = source_language.split("-")[0].lower()
        tgt_base = target_language.split("-")[0].lower()

        if src_base == tgt_base:
            translated_text = transcript
            logger.info("[video] Source and target language are the same — skipping translation")
        else:
            from services.sarvam_client import translate_text
            translated = translate_text(
                text=transcript,
                source_language=source_language,
                target_language=target_language,
            )
            if isinstance(translated, dict):
                translated_text = translated.get("translated_text", translated.get("text", ""))
            else:
                translated_text = str(translated)

        logger.info(f"[video] Translated ({target_language}): {translated_text[:100]}")

        # 4. Detect emotion — combine audio + text signals
        audio_emotion = detect_emotion_from_audio(audio_path)
        text_emotion = detect_emotion_from_text(transcript)

        # Audio signal is more reliable — use it as primary, text as tiebreaker
        if audio_emotion != "neutral":
            emotion = audio_emotion
        else:
            emotion = text_emotion
        logger.info(f"[video] Emotion: audio={audio_emotion}, text={text_emotion} → final={emotion}")

        # 4b. Auto-detect speaker gender from audio (overrides user selection)
        detected_gender = detect_gender_from_audio(audio_path)
        logger.info(f"[video] Detected gender: {detected_gender} (user selected: {voice_type})")
        effective_voice = detected_gender  # always use detected gender

        # 5. TTS — LMNT voice cloning (primary) → Sarvam TTS → gTTS fallback
        from services.tts_service import get_gtts_language_code, text_to_speech_gtts
        tts_path = None

        # Try LMNT voice cloning first
        try:
            from services.lmnt_service import is_available as lmnt_available, clone_and_speak as lmnt_clone
            if lmnt_available():
                logger.info("[video] Using LMNT voice cloning")
                tts_path = lmnt_clone(
                    audio_sample_path=audio_path,
                    text=translated_text,
                    language=target_language,
                )
                logger.info(f"[video] LMNT voice clone succeeded: {tts_path}")
        except Exception as lmnt_err:
            logger.warning(f"[video] LMNT failed ({lmnt_err}), trying Sarvam TTS")

        # Try Sarvam TTS
        if not tts_path:
            try:
                from services.tts_service import text_to_speech_sarvam
                tts_path = text_to_speech_sarvam(
                    text=translated_text,
                    language=target_language,
                    speaker_gender=effective_voice,
                )
                logger.info(f"[video] Sarvam TTS succeeded ({effective_voice}): {tts_path}")
            except Exception as sarvam_err:
                logger.warning(f"[video] Sarvam TTS failed ({sarvam_err}), using gTTS")

        # gTTS fallback with gender + emotion
        if not tts_path:
            gtts_lang = get_gtts_language_code(target_language)
            tts_path = text_to_speech_gtts(translated_text, gtts_lang, emotion=emotion, gender=effective_voice)

        logger.info(f"[video] TTS audio ({emotion}, {effective_voice}): {tts_path}")

        # 6. Merge
        output_path = merge_audio_video(video_path, tts_path)
        logger.info(f"[video] Output: {output_path}")

        return {
            "output_path": output_path,
            "source_language": source_language,
            "transcript": transcript,
            "translated_text": translated_text,
            "emotion": emotion,
            "confidence": confidence,
            "detected_gender": detected_gender,
        }

    finally:
        # Clean up intermediate files
        for p in [audio_path, tts_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
