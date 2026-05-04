import os
import logging
import subprocess
from gtts import gTTS
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# Emotion → ffmpeg audio filter params
# atempo: speech rate (0.5–2.0), pitch via asetrate+atempo trick
EMOTION_PROFILES = {
    'happy':    {'tempo': 1.15, 'pitch_semitones': +2},
    'excited':  {'tempo': 1.30, 'pitch_semitones': +4},
    'sad':      {'tempo': 0.80, 'pitch_semitones': -3},
    'angry':    {'tempo': 1.25, 'pitch_semitones': +2},
    'serious':  {'tempo': 0.88, 'pitch_semitones': -2},
    'neutral':  {'tempo': 1.00, 'pitch_semitones':  0},
}

# Gender pitch offset — gTTS is female by default, shift down for male
GENDER_PITCH = {
    'male':   -7,   # shift down 7 semitones → clearly male
    'female':  0,   # no change
}


def _apply_emotion_filter(input_path: str, emotion: str, gender: str = 'female') -> str:
    """Apply pitch + tempo adjustments for emotion and gender using ffmpeg."""
    profile = EMOTION_PROFILES.get(emotion, EMOTION_PROFILES['neutral'])
    tempo = profile['tempo']
    # Combine emotion pitch + gender pitch
    semitones = profile['pitch_semitones'] + GENDER_PITCH.get(gender, 0)

    # Skip if no change needed
    if tempo == 1.0 and semitones == 0:
        return input_path

    output_path = input_path.replace('.mp3', '_emo.mp3').replace('.wav', '_emo.wav')

    # Pitch shift via asetrate (changes sample rate to shift pitch) + atempo to correct speed
    sample_rate = 22050
    pitch_factor = 2 ** (semitones / 12)
    new_rate = int(sample_rate * pitch_factor)

    # Build filter chain: pitch shift + tempo
    # atempo only accepts 0.5–2.0, chain two if needed
    if tempo <= 2.0 and tempo >= 0.5:
        tempo_filter = f"atempo={tempo:.3f}"
    elif tempo > 2.0:
        tempo_filter = f"atempo=2.0,atempo={tempo/2:.3f}"
    else:
        tempo_filter = f"atempo=0.5,atempo={tempo*2:.3f}"

    filter_chain = f"asetrate={new_rate},{tempo_filter},aresample={sample_rate}"

    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-af", filter_chain,
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"[tts] Emotion filter applied ({emotion}): tempo={tempo}, pitch={semitones:+d}st")
            return output_path
        else:
            logger.warning(f"[tts] Emotion filter failed, using original: {result.stderr[:200]}")
            return input_path
    except Exception as e:
        logger.warning(f"[tts] ffmpeg emotion filter error: {e}")
        return input_path


def text_to_speech_gtts(text: str, language: str = "en", emotion: str = "neutral", gender: str = "female") -> str:
    """
    Converts text to speech using gTTS, then applies emotion-aware
    pitch/tempo + gender pitch adjustments via ffmpeg.
    """
    try:
        logger.info(f"[tts] Generating speech: lang={language}, emotion={emotion}, gender={gender}, text='{text[:50]}'")

        tts = gTTS(text=text, lang=language, slow=False)
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        temp_path = temp_file.name
        temp_file.close()
        tts.save(temp_path)

        # Apply emotion + gender filter
        final_path = _apply_emotion_filter(temp_path, emotion, gender)

        if final_path != temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

        logger.info(f"[tts] Audio ready: {final_path}")
        return final_path

    except Exception as e:
        logger.error(f"[tts] TTS error: {e}")
        raise Exception(f"Failed to generate speech: {str(e)}")


def text_to_speech_sarvam(text: str, language: str = "en-IN", speaker_gender: str = "meera") -> str:
    """Sarvam AI TTS — high quality Indian language voices."""
    import requests
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
    SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
    if not SARVAM_API_KEY:
        raise Exception("SARVAM_API_KEY is not set")

    # Sarvam confirmed available speakers (from API error message)
    # Female: anushka, manisha, vidya, arya, ritu, priya, neha, pooja, simran, kavya
    # Male: abhilash, karun, hitesh, aditya, rahul, rohan
    FEMALE_SPEAKERS = {"default": "anushka"}
    MALE_SPEAKERS   = {"default": "abhilash"}

    is_female = speaker_gender.lower() in ("female", "f")
    speaker = FEMALE_SPEAKERS["default"] if is_female else MALE_SPEAKERS["default"]

    # Split text into chunks ≤500 chars (Sarvam limit)
    chunks = [text[i:i+500] for i in range(0, len(text), 500)]
    all_audio = b""

    for chunk in chunks:
        if not chunk.strip():
            continue
        payload = {
            "inputs": [chunk],
            "target_language_code": language,
            "speaker": speaker,
            "pitch": 0,
            "pace": 1.0,
            "loudness": 1.5,
            "speech_sample_rate": 22050,
            "enable_preprocessing": True,
            "model": "bulbul:v2",
        }
        headers = {"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"}
        logger.info(f"[sarvam-tts] lang={language}, speaker={speaker}, chunk={len(chunk)}chars")
        resp = requests.post("https://api.sarvam.ai/text-to-speech", json=payload, headers=headers, timeout=30)

        if resp.status_code != 200:
            payload["model"] = "bulbul:v1"
            resp = requests.post("https://api.sarvam.ai/text-to-speech", json=payload, headers=headers, timeout=30)

        if resp.status_code == 200:
            import base64
            data = resp.json()
            audios = data.get("audios", [])
            if audios:
                all_audio += base64.b64decode(audios[0])
            else:
                raise Exception(f"Sarvam TTS: no audio in response: {data}")
        else:
            raise Exception(f"Sarvam TTS {resp.status_code}: {resp.text[:200]}")

    if not all_audio:
        raise Exception("Sarvam TTS: no audio generated")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.write(all_audio)
    tmp.close()
    logger.info(f"[sarvam-tts] Generated: {tmp.name}")
    return tmp.name


# Language code mapping for gTTS
GTTS_LANGUAGE_MAP = {
    "en": "en",
    "en-IN": "en",
    "hi-IN": "hi",
    "bn-IN": "bn",
    "ta-IN": "ta",
    "te-IN": "te",
    "ml-IN": "ml",
    "mr-IN": "mr",
    "gu-IN": "gu",
    "kn-IN": "kn",
    "pa-IN": "pa",
    "or-IN": "or",
}


def get_gtts_language_code(language_code: str) -> str:
    """
    Maps language codes to gTTS compatible codes.
    """
    return GTTS_LANGUAGE_MAP.get(language_code, "en")
