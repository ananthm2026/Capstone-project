"""
video_router.py — Video translation endpoints.
POST /api/video/upload  → upload video, get video_id
POST /api/video/translate → process and return translated video
GET  /api/video/{video_id} → download translated video
"""
import os
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
import aiofiles

router = APIRouter(prefix="/api/video", tags=["video"])
logger = logging.getLogger(__name__)

TEMP_DIR = Path("temp_video")
TEMP_DIR.mkdir(exist_ok=True)

SUPPORTED_EXT = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200MB
CHUNK_SIZE = 1024 * 1024  # 1MB

# In-memory job store: video_id → { status, path, result, error }
_jobs: dict = {}


class TranslateRequest(BaseModel):
    video_id: str
    target_language: str = "hi-IN"
    voice_type: str = "female"   # male | female
    tone: str = "formal"          # formal | casual


def _cleanup(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file. Returns video_id for use in /translate."""
    filename = file.filename or "video.mp4"
    ext = Path(filename).suffix.lower()

    if ext not in SUPPORTED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Use: {', '.join(SUPPORTED_EXT)}"
        )

    video_id = str(uuid.uuid4())[:12]
    save_path = str(TEMP_DIR / f"{video_id}{ext}")

    file_size = 0
    try:
        async with aiofiles.open(save_path, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > MAX_VIDEO_SIZE:
                    raise HTTPException(status_code=413, detail="Video too large. Max 200MB.")
                await f.write(chunk)
    except HTTPException:
        _cleanup(save_path)
        raise
    except Exception as e:
        _cleanup(save_path)
        raise HTTPException(status_code=500, detail=str(e))

    _jobs[video_id] = {"status": "uploaded", "path": save_path, "result": None, "error": None}
    logger.info(f"[video] Uploaded {filename} → {video_id} ({file_size/1024:.1f}KB)")

    return {"video_id": video_id, "filename": filename, "size_kb": round(file_size / 1024, 1)}


@router.post("/translate")
async def translate_video(req: TranslateRequest, background_tasks: BackgroundTasks):
    """Start video translation. Returns immediately; poll /status/{video_id}."""
    job = _jobs.get(req.video_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video not found. Please upload first.")
    if job["status"] == "processing":
        raise HTTPException(status_code=409, detail="Already processing.")

    job["status"] = "processing"
    job["error"] = None
    job["result"] = None

    background_tasks.add_task(
        _run_translation,
        req.video_id,
        job["path"],
        req.target_language,
        req.voice_type,
        req.tone,
    )

    return {"video_id": req.video_id, "status": "processing"}


def _run_translation(video_id: str, video_path: str, target_language: str, voice_type: str, tone: str):
    """Background task — runs the full pipeline."""
    from services.video_service import process_video_translation, check_ffmpeg

    job = _jobs.get(video_id)
    if not job:
        return

    try:
        if not check_ffmpeg():
            raise RuntimeError("ffmpeg is not installed on this server.")

        result = process_video_translation(
            video_path=video_path,
            target_language=target_language,
            voice_type=voice_type,
            tone=tone,
        )

        job["status"] = "done"
        job["result"] = result
        logger.info(f"[video] {video_id} done → {result['output_path']}")

    except Exception as e:
        logger.error(f"[video] {video_id} failed: {e}")
        job["status"] = "error"
        job["error"] = str(e)


@router.get("/status/{video_id}")
def get_status(video_id: str):
    """Poll translation status."""
    job = _jobs.get(video_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video not found.")

    if job["status"] == "done" and job["result"]:
        r = job["result"]
        return {
            "status": "done",
            "video_id": video_id,
            "download_url": f"/api/video/download/{video_id}",
            "source_language": r.get("source_language"),
            "transcript": r.get("transcript"),
            "translated_text": r.get("translated_text"),
            "emotion": r.get("emotion"),
            "confidence": r.get("confidence"),
        }

    return {
        "status": job["status"],
        "video_id": video_id,
        "error": job.get("error"),
    }


@router.get("/download/{video_id}")
def download_video(video_id: str):
    """Download the translated video."""
    job = _jobs.get(video_id)
    if not job or job["status"] != "done":
        raise HTTPException(status_code=404, detail="Translated video not ready.")

    output_path = job["result"]["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="File not found on server.")

    return FileResponse(
        path=output_path,
        media_type="video/mp4",
        filename=f"translated_{video_id}.mp4",
    )
