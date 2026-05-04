"""
audio_diarization.py — Real audio-based speaker diarization.

Uses librosa to:
1. Detect silence gaps → split audio into speech segments
2. Extract pitch (F0) per segment → detect gender (male/female)
3. Cluster speakers by voice similarity (pitch + spectral centroid)
4. Assign up to 5 distinct speakers

Gender detection:
  - Male:   fundamental frequency ~85–180 Hz
  - Female: fundamental frequency ~165–255 Hz
  - Overlap zone: use spectral centroid as tiebreaker
"""
import os
import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# Sarvam TTS voices mapped by gender
MALE_VOICES   = ["abhilash", "karun", "arvind", "amol"]
FEMALE_VOICES = ["anushka", "vidya", "pavithra", "meera"]


def _load_audio(path: str):
    """Load audio as mono float32 array. Returns (samples, sample_rate)."""
    import librosa
    y, sr = librosa.load(path, sr=16000, mono=True)
    return y, sr


def _detect_speech_segments(y, sr, min_silence_ms=400, min_speech_ms=300):
    """
    Split audio into speech segments using energy-based VAD.
    Returns list of (start_sample, end_sample).
    """
    import librosa
    frame_len  = int(sr * 0.025)   # 25ms frames
    hop_len    = int(sr * 0.010)   # 10ms hop
    rms        = librosa.feature.rms(y=y, frame_length=frame_len, hop_length=hop_len)[0]
    threshold  = np.percentile(rms, 30) * 2.5  # adaptive threshold

    min_silence_frames = int(min_silence_ms / 10)
    min_speech_frames  = int(min_speech_ms  / 10)

    is_speech = rms > threshold
    segments  = []
    in_speech = False
    start     = 0
    silence_count = 0

    for i, s in enumerate(is_speech):
        if s:
            if not in_speech:
                start = i
                in_speech = True
            silence_count = 0
        else:
            if in_speech:
                silence_count += 1
                if silence_count >= min_silence_frames:
                    seg_len = i - silence_count - start
                    if seg_len >= min_speech_frames:
                        s_sample = librosa.frames_to_samples(start,     hop_length=hop_len)
                        e_sample = librosa.frames_to_samples(i - silence_count, hop_length=hop_len)
                        segments.append((s_sample, e_sample))
                    in_speech = False
                    silence_count = 0

    if in_speech:
        e_sample = len(y)
        seg_len  = librosa.samples_to_frames(e_sample - start, hop_length=hop_len)
        if seg_len >= min_speech_frames:
            segments.append((librosa.frames_to_samples(start, hop_length=hop_len), e_sample))

    return segments


def _extract_features(y_seg, sr):
    """
    Extract voice features for a speech segment.
    Returns dict with: mean_pitch, pitch_std, spectral_centroid, energy
    """
    import librosa

    # Pitch via YIN algorithm
    f0 = librosa.yin(y_seg, fmin=60, fmax=400, sr=sr)
    voiced = f0[(f0 > 60) & (f0 < 400)]
    mean_pitch = float(np.median(voiced)) if len(voiced) > 5 else 0.0
    pitch_std  = float(np.std(voiced))    if len(voiced) > 5 else 0.0

    # Spectral centroid
    sc = librosa.feature.spectral_centroid(y=y_seg, sr=sr)[0]
    mean_sc = float(np.mean(sc))

    # RMS energy
    energy = float(np.mean(librosa.feature.rms(y=y_seg)[0]))

    # MFCCs (first 13) for speaker similarity
    mfcc = librosa.feature.mfcc(y=y_seg, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1)

    return {
        "mean_pitch":       mean_pitch,
        "pitch_std":        pitch_std,
        "spectral_centroid": mean_sc,
        "energy":           energy,
        "mfcc":             mfcc_mean,
    }


def _detect_gender(features: dict) -> str:
    """
    Detect gender from pitch and spectral centroid.
    Returns 'male' or 'female'.
    """
    pitch = features["mean_pitch"]
    sc    = features["spectral_centroid"]

    if pitch == 0:
        # No pitch detected — use spectral centroid as fallback
        return "female" if sc > 2000 else "male"

    if pitch < 150:
        return "male"
    elif pitch > 200:
        return "female"
    else:
        # Overlap zone 150-200 Hz — use spectral centroid
        return "female" if sc > 2200 else "male"


def _cosine_similarity(a, b):
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _cluster_speakers(seg_features: list[dict], similarity_threshold=0.92) -> list[int]:
    """
    Cluster segments into speakers using MFCC cosine similarity.
    Returns list of speaker IDs (0-indexed) for each segment.
    """
    speaker_ids    = []
    speaker_protos = []  # prototype MFCC per speaker

    for feat in seg_features:
        mfcc = feat["mfcc"]
        if not speaker_protos:
            speaker_protos.append(mfcc.copy())
            speaker_ids.append(0)
            continue

        # Find best matching speaker
        best_sim = -1
        best_idx = -1
        for idx, proto in enumerate(speaker_protos):
            sim = _cosine_similarity(mfcc, proto)
            if sim > best_sim:
                best_sim = sim
                best_idx = idx

        if best_sim >= similarity_threshold:
            # Update prototype with running average
            speaker_protos[best_idx] = (speaker_protos[best_idx] * 0.7 + mfcc * 0.3)
            speaker_ids.append(best_idx)
        else:
            # New speaker (cap at 5)
            if len(speaker_protos) < 5:
                speaker_protos.append(mfcc.copy())
                speaker_ids.append(len(speaker_protos) - 1)
            else:
                # Assign to closest existing speaker
                speaker_ids.append(best_idx)

    return speaker_ids


def diarize_audio_file(audio_path: str, transcript: str, full_transcript_segments: list = None) -> list[dict]:
    """
    Main entry point. Returns list of:
    {
      speaker: "Person 1",
      gender: "male" | "female",
      text: "...",
      emotion: "neutral",
      start: float,
      end: float,
      voice: { sarvam: "abhilash", gtts_gender: "male" }
    }
    """
    try:
        import librosa
    except ImportError:
        logger.warning("[audio_diarize] librosa not installed, falling back to text-based")
        return []

    try:
        y, sr = _load_audio(audio_path)
        duration = len(y) / sr
        logger.info(f"[audio_diarize] Audio: {duration:.1f}s, sr={sr}")

        # Detect speech segments
        speech_segs = _detect_speech_segments(y, sr)
        logger.info(f"[audio_diarize] Found {len(speech_segs)} speech segments")

        if not speech_segs:
            return []

        # Extract features per segment
        seg_features = []
        for s, e in speech_segs:
            seg_audio = y[s:e]
            if len(seg_audio) < sr * 0.1:  # skip < 100ms
                seg_features.append(None)
                continue
            feat = _extract_features(seg_audio, sr)
            feat["start"] = s / sr
            feat["end"]   = e / sr
            seg_features.append(feat)

        valid_feats = [(i, f) for i, f in enumerate(seg_features) if f is not None]
        if not valid_feats:
            return []

        # Cluster into speakers
        indices, feats = zip(*valid_feats)
        speaker_ids = _cluster_speakers(list(feats))

        # Detect gender per unique speaker
        speaker_gender = {}
        speaker_feat_acc = {}
        for feat, spk_id in zip(feats, speaker_ids):
            if spk_id not in speaker_feat_acc:
                speaker_feat_acc[spk_id] = []
            speaker_feat_acc[spk_id].append(feat)

        for spk_id, feat_list in speaker_feat_acc.items():
            # Average pitch across all segments for this speaker
            pitches = [f["mean_pitch"] for f in feat_list if f["mean_pitch"] > 0]
            scs     = [f["spectral_centroid"] for f in feat_list]
            avg_feat = {
                "mean_pitch":        np.median(pitches) if pitches else 0,
                "spectral_centroid": np.mean(scs),
            }
            speaker_gender[spk_id] = _detect_gender(avg_feat)
            logger.info(f"[audio_diarize] Speaker {spk_id+1}: gender={speaker_gender[spk_id]}, "
                        f"pitch={avg_feat['mean_pitch']:.0f}Hz")

        # Assign TTS voices based on detected gender
        male_voice_idx   = 0
        female_voice_idx = 0
        speaker_voice    = {}
        for spk_id in sorted(speaker_gender.keys()):
            gender = speaker_gender[spk_id]
            if gender == "male":
                voice = MALE_VOICES[male_voice_idx % len(MALE_VOICES)]
                male_voice_idx += 1
            else:
                voice = FEMALE_VOICES[female_voice_idx % len(FEMALE_VOICES)]
                female_voice_idx += 1
            speaker_voice[spk_id] = {"sarvam": voice, "gtts_gender": gender}

        # Now map audio segments → transcript text
        # Use Gemini to align transcript with timed segments
        n_speakers = len(speaker_gender)
        seg_times  = [(feats[i]["start"], feats[i]["end"]) for i in range(len(feats))]
        seg_spk    = [f"Person {speaker_ids[i]+1}" for i in range(len(feats))]

        # Build result: align transcript text to audio segments via Gemini
        result = _align_transcript_to_segments(
            transcript, seg_times, seg_spk, speaker_gender, speaker_voice, n_speakers
        )
        return result

    except Exception as e:
        logger.error(f"[audio_diarize] Failed: {e}", exc_info=True)
        return []


def _align_transcript_to_segments(
    transcript: str,
    seg_times: list,
    seg_speakers: list,
    speaker_gender: dict,
    speaker_voice: dict,
    n_speakers: int,
) -> list[dict]:
    """
    Use Gemini to split transcript text according to the audio-detected speaker pattern.
    We know WHO spoke WHEN from audio — Gemini just assigns the text.
    """
    import os, json
    GEMINI_KEY = os.getenv("GEMINI_API_KEY")

    # Build speaker sequence from audio (e.g. [P1, P1, P2, P3, P1, P2])
    speaker_sequence = seg_speakers  # already ordered by time

    # Build gender info string for Gemini
    gender_info = ", ".join([
        f"Person {i+1} is {speaker_gender.get(i, 'unknown')}"
        for i in range(n_speakers)
    ])

    if GEMINI_KEY and transcript.strip():
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_KEY)
            model = genai.GenerativeModel("gemini-2.0-flash")

            # Tell Gemini the exact speaker order detected from audio
            seq_str = " → ".join(speaker_sequence[:30])  # first 30 turns

            prompt = f"""You are a transcript alignment expert.

Audio analysis detected {n_speakers} speakers with this speaking order:
{seq_str}

Gender info: {gender_info}

Split this transcript into {len(speaker_sequence)} segments following EXACTLY the speaker order above.
Each segment should be a natural speech unit (sentence or phrase).

Return ONLY a JSON array:
[
  {{"speaker": "Person 1", "text": "...", "emotion": "neutral"}},
  ...
]

Rules:
- Follow the speaker order EXACTLY as given above
- Distribute the transcript text proportionally
- Detect emotion: happy, neutral, serious, sad, angry, excited
- No markdown, no explanation

Transcript:
{transcript}"""

            resp = model.generate_content(prompt)
            raw  = resp.text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            parsed = json.loads(raw.strip())

            if isinstance(parsed, list) and parsed:
                results = []
                for i, seg in enumerate(parsed):
                    spk_label = str(seg.get("speaker", "Person 1"))
                    spk_num   = int(''.join(filter(str.isdigit, spk_label)) or "1") - 1
                    spk_num   = max(0, min(spk_num, n_speakers - 1))
                    gender    = speaker_gender.get(spk_num, "male")
                    voice     = speaker_voice.get(spk_num, {"sarvam": "abhilash", "gtts_gender": "male"})
                    start     = seg_times[i][0] if i < len(seg_times) else 0
                    end       = seg_times[i][1] if i < len(seg_times) else 0
                    results.append({
                        "speaker": f"Person {spk_num + 1}",
                        "gender":  gender,
                        "text":    str(seg.get("text", "")).strip(),
                        "emotion": str(seg.get("emotion", "neutral")).lower(),
                        "start":   round(start, 2),
                        "end":     round(end, 2),
                        "voice":   voice,
                    })
                return [r for r in results if r["text"]]
        except Exception as e:
            logger.warning(f"[audio_diarize] Gemini alignment failed: {e}")

    # Fallback: simple proportional split
    import re
    sentences = re.split(r'(?<=[.!?])\s+', transcript)
    sentences = [s.strip() for s in sentences if s.strip()]
    results   = []
    for i, sent in enumerate(sentences):
        spk_label = speaker_sequence[i % len(speaker_sequence)]
        spk_num   = int(''.join(filter(str.isdigit, spk_label)) or "1") - 1
        gender    = speaker_gender.get(spk_num, "male")
        voice     = speaker_voice.get(spk_num, {"sarvam": "abhilash", "gtts_gender": "male"})
        results.append({
            "speaker": spk_label,
            "gender":  gender,
            "text":    sent,
            "emotion": "neutral",
            "start":   seg_times[i][0] if i < len(seg_times) else 0,
            "end":     seg_times[i][1] if i < len(seg_times) else 0,
            "voice":   voice,
        })
    return results
