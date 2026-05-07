"""
video_service.py — Video subtitle generation pipeline.
Flow: upload → chunk audio → transcribe each chunk → translate → generate SRT → burn into video
"""
import os
import uuid
import json
import math
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

TEMP_DIR = Path("temp_video")
TEMP_DIR.mkdir(exist_ok=True)

CHUNK_DURATION = 6.0  # seconds per subtitle segment


def check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except Exception:
        return False


def _run(cmd: list, label: str, timeout: int = 180):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed: {result.stderr[:400]}")
    return result


def get_video_duration(video_path: str) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path
    ], capture_output=True, text=True, timeout=30)
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def extract_audio_chunk(video_path: str, start: float, duration: float) -> str:
    out = str(TEMP_DIR / f"{uuid.uuid4()}_chunk.wav")
    _run([
        "ffmpeg", "-y", "-i", video_path,
        "-ss", str(start), "-t", str(duration),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        out
    ], f"chunk_{start:.1f}")
    return out


def _srt_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int((s % 1) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def _vtt_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int((s % 1) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d}.{ms:03d}"


def build_srt(segments: list) -> str:
    lines = []
    idx = 1
    for seg in segments:
        if not seg["text"].strip():
            continue
        lines += [str(idx), f"{_srt_time(seg['start'])} --> {_srt_time(seg['end'])}", seg["text"], ""]
        idx += 1
    return "\n".join(lines)


def build_vtt(segments: list) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        if not seg["text"].strip():
            continue
        lines += [f"{_vtt_time(seg['start'])} --> {_vtt_time(seg['end'])}", seg["text"], ""]
    return "\n".join(lines)


def process_video_subtitles(video_path: str, target_language: str) -> dict:
    """
    1. Get video duration
    2. Extract audio in CHUNK_DURATION second segments
    3. Transcribe each segment with Sarvam STT
    4. Translate each segment to target_language
    5. Build SRT file
    6. Burn subtitles into video with ffmpeg
    """
    from services.sarvam_client import translate_speech_to_text, translate_text

    chunk_paths = []
    srt_path = None

    try:
        duration = get_video_duration(video_path)
        logger.info(f"[subtitle] duration={duration:.1f}s target={target_language}")

        num_chunks = math.ceil(duration / CHUNK_DURATION)
        segments = []
        source_language = "en-IN"

        for i in range(num_chunks):
            start = i * CHUNK_DURATION
            end = min(start + CHUNK_DURATION, duration)
            if end - start < 0.5:
                continue

            chunk_path = extract_audio_chunk(video_path, start, end - start)
            chunk_paths.append(chunk_path)

            # Transcribe
            try:
                stt = translate_speech_to_text(chunk_path, content_type="audio/wav")
                original = stt.get("transcript", "").strip()
                if i == 0 and stt.get("source_language"):
                    source_language = stt["source_language"]
            except Exception as e:
                logger.warning(f"[subtitle] chunk {i} STT failed: {e}")
                original = ""

            if not original:
                continue

            # Translate (skip if same language)
            src_base = source_language.split("-")[0].lower()
            tgt_base = target_language.split("-")[0].lower()
            if src_base == tgt_base:
                translated = original
            else:
                try:
                    res = translate_text(
                        text=original,
                        source_language=source_language,
                        target_language=target_language,
                    )
                    translated = res.get("translated_text", res.get("text", original)) if isinstance(res, dict) else str(res)
                except Exception as e:
                    logger.warning(f"[subtitle] chunk {i} translate failed: {e}")
                    translated = original

            segments.append({"start": start, "end": end, "original": original, "text": translated})
            logger.info(f"[subtitle] [{start:.1f}-{end:.1f}s] {original[:40]} → {translated[:40]}")

        if not segments:
            raise ValueError("No speech detected. Ensure the video has clear audio.")

        uid = str(uuid.uuid4())
        srt_path = str(TEMP_DIR / f"{uid}.srt")
        vtt_path = str(TEMP_DIR / f"{uid}.vtt")
        subtitled_video_path = str(TEMP_DIR / f"subtitled_{uid}.mp4")

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(build_srt(segments))
        with open(vtt_path, "w", encoding="utf-8") as f:
            f.write(build_vtt(segments))

        # Burn subtitles into video
        logger.info(f"[subtitle] Burning subtitles into {subtitled_video_path}")
        try:
            # Note: We use absolute paths for subtitles filter if possible, or relative to CWD
            _run([
                "ffmpeg", "-y", "-i", video_path,
                "-vf", f"subtitles={srt_path}",
                "-c:a", "copy",
                subtitled_video_path
            ], "burn-in", timeout=300)
            final_video = subtitled_video_path
        except Exception as e:
            logger.error(f"[subtitle] Burn-in failed: {e}. Falling back to original.")
            final_video = video_path

        logger.info(f"[subtitle] Done: {len(segments)} segments")

        return {
            "output_path": final_video,
            "srt_path": srt_path,
            "vtt_path": vtt_path,
            "source_language": source_language,
            "transcript": " ".join(s["original"] for s in segments),
            "translated_text": " ".join(s["text"] for s in segments),
            "segment_count": len(segments),
        }

    finally:
        for p in chunk_paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        # Note: video_path (original upload) and srt/vtt files are kept for download


def generate_video_thumbnail(video_path: str) -> str:
    """Extracts a frame from the video to use as a thumbnail."""
    out = str(TEMP_DIR / f"thumb_{uuid.uuid4()}.jpg")
    try:
        # Try capturing at 1 second mark for a better shot than frame 0
        _run([
            "ffmpeg", "-y", "-ss", "00:00:01", "-i", video_path,
            "-vframes", "1", "-q:v", "2", out
        ], "thumbnail", timeout=10)
    except Exception:
        # Fallback to very beginning if 1s fails
        _run([
            "ffmpeg", "-y", "-i", video_path,
            "-vframes", "1", "-q:v", "2", out
        ], "thumbnail_fallback", timeout=10)
    return out
