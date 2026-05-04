"""
diarization_service.py — Speaker diarization using Sarvam AI's diarized_transcript field.
Splits transcript into per-speaker segments with emotion detection.
"""
import os
import logging
import re

logger = logging.getLogger(__name__)


def parse_diarized_transcript(sarvam_response: dict) -> list[dict]:
    """
    Parse Sarvam's diarized_transcript into speaker segments.
    Returns list of: { speaker: "Person 1", text: "...", emotion: "neutral" }
    """
    diarized = sarvam_response.get("diarized_transcript")

    if diarized and isinstance(diarized, list):
        segments = []
        for seg in diarized:
            speaker_label = seg.get("speaker_id") or seg.get("speaker") or "Person 1"
            # Normalize speaker label
            if isinstance(speaker_label, int):
                speaker_label = f"Person {speaker_label + 1}"
            elif not str(speaker_label).startswith("Person"):
                speaker_label = f"Person {speaker_label}"
            text = seg.get("transcript") or seg.get("text") or ""
            if text.strip():
                segments.append({
                    "speaker": speaker_label,
                    "text": text.strip(),
                    "emotion": "neutral",
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 0),
                })
        if segments:
            return segments

    # Fallback: parse from plain transcript if diarization not available
    transcript = sarvam_response.get("transcript", "")
    return _parse_from_text(transcript)


def _parse_from_text(transcript: str) -> list[dict]:
    """
    Try to detect speaker turns from text patterns like:
    'Person 1: ...' or 'Speaker A: ...' or just return as single speaker.
    """
    # Try to detect labeled speakers
    pattern = re.compile(r'((?:Person|Speaker|Participant)\s*\d+|[A-Z][a-z]+)\s*:\s*(.+?)(?=(?:Person|Speaker|Participant)\s*\d+\s*:|[A-Z][a-z]+\s*:|$)', re.DOTALL)
    matches = pattern.findall(transcript)

    if len(matches) >= 2:
        return [{"speaker": m[0].strip(), "text": m[1].strip(), "emotion": "neutral", "start": 0, "end": 0}
                for m in matches if m[1].strip()]

    # Single speaker fallback
    if transcript.strip():
        return [{"speaker": "Person 1", "text": transcript.strip(), "emotion": "neutral", "start": 0, "end": 0}]
    return []


def detect_emotions_for_segments(segments: list[dict], gemini_key: str = None) -> list[dict]:
    """Add emotion detection to each segment using Gemini."""
    if not gemini_key or not segments:
        return segments

    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel("gemini-2.0-flash")

        # Batch all segments in one call
        texts = "\n".join([f"{i+1}. {s['text'][:200]}" for i, s in enumerate(segments)])
        prompt = (
            f"For each numbered text below, detect the emotion. "
            f"Reply with ONLY a comma-separated list of emotions in order, "
            f"choosing from: happy, neutral, serious, sad, angry, excited.\n\n{texts}"
        )
        resp = model.generate_content(prompt)
        emotions = [e.strip().lower() for e in resp.text.strip().split(",")]
        valid = {"happy", "neutral", "serious", "sad", "angry", "excited"}

        for i, seg in enumerate(segments):
            if i < len(emotions) and emotions[i] in valid:
                seg["emotion"] = emotions[i]
    except Exception as e:
        logger.warning(f"[diarization] Emotion detection failed: {e}")

    return segments


def assign_speaker_voices(segments: list[dict]) -> list[dict]:
    """
    Assign Sarvam TTS voices to each speaker.
    If gender was detected by audio analysis, use it.
    Otherwise alternate male/female.
    """
    MALE_VOICES   = ["abhilash", "karun", "arvind", "amol"]
    FEMALE_VOICES = ["anushka",  "vidya", "pavithra", "meera"]

    speaker_map      = {}
    male_voice_idx   = 0
    female_voice_idx = 0

    for seg in segments:
        sp     = seg["speaker"]
        gender = seg.get("gender", "")  # set by audio diarization if available

        if sp not in speaker_map:
            if not gender:
                # Alternate male/female if no audio gender info
                gender = "male" if len(speaker_map) % 2 == 0 else "female"

            if gender == "female":
                voice = FEMALE_VOICES[female_voice_idx % len(FEMALE_VOICES)]
                female_voice_idx += 1
            else:
                voice = MALE_VOICES[male_voice_idx % len(MALE_VOICES)]
                male_voice_idx += 1

            speaker_map[sp] = {"sarvam": voice, "gtts_gender": gender}

        # Only set voice if not already set by audio diarization
        if not seg.get("voice") or not seg["voice"].get("sarvam"):
            seg["voice"]   = speaker_map[sp]
        if not seg.get("gender"):
            seg["gender"]  = speaker_map[sp]["gtts_gender"]

    return segments
