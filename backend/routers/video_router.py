"""
video_router.py — Video subtitle generation endpoints.
POST /api/video/upload          → upload video, get video_id
POST /api/video/subtitle        → start subtitle generation job
GET  /api/video/status/{id}     → poll job status
GET  /api/video/download/{id}   → download subtitled video
GET  /api/video/srt/{id}        → download SRT file
"""
import os
import uuid
import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import aiofiles

router = APIRouter(prefix="/api/video", tags=["video"])
logger = logging.getLogger(__name__)

TEMP_DIR = Path("temp_video")
TEMP_DIR.mkdir(exist_ok=True)

SUPPORTED_EXT = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200 MB
CHUNK_SIZE = 1024 * 1024            # 1 MB read chunks

_jobs: dict = {}


class SubtitleRequest(BaseModel):
    video_id: str
    target_language: str = "hi-IN"


def _cleanup(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    filename = file.filename or "video.mp4"
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXT:
        raise HTTPException(400, f"Unsupported format '{ext}'. Use: {', '.join(SUPPORTED_EXT)}")

    video_id = str(uuid.uuid4())[:12]
    save_path = str(TEMP_DIR / f"{video_id}{ext}")
    file_size = 0

    try:
        async with aiofiles.open(save_path, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > MAX_VIDEO_SIZE:
                    raise HTTPException(413, "Video too large. Max 200MB.")
                await f.write(chunk)
    except HTTPException:
        _cleanup(save_path)
        raise
    except Exception as e:
        _cleanup(save_path)
        raise HTTPException(500, str(e))

    _jobs[video_id] = {"status": "uploaded", "path": save_path, "result": None, "error": None}
    logger.info(f"[video] uploaded {filename} → {video_id} ({file_size/1024:.1f}KB)")
    return {"video_id": video_id, "filename": filename, "size_kb": round(file_size / 1024, 1)}


@router.post("/subtitle")
async def start_subtitle_job(req: SubtitleRequest):
    job = _jobs.get(req.video_id)
    if not job:
        raise HTTPException(404, "Video not found. Upload first.")
    if job["status"] == "processing":
        raise HTTPException(409, "Already processing.")

    job.update({"status": "processing", "error": None, "result": None,
                "target_language": req.target_language})

    asyncio.create_task(_run_job(req.video_id, job["path"], req.target_language))
    return {"video_id": req.video_id, "status": "processing"}


async def _run_job(video_id: str, video_path: str, target_language: str):
    job = _jobs.get(video_id)
    if not job:
        return
    try:
        from services.video_service import process_video_subtitles, check_ffmpeg, generate_video_thumbnail
        if not check_ffmpeg():
            raise RuntimeError("ffmpeg is not installed on this server.")
        result = await asyncio.to_thread(process_video_subtitles, video_path, target_language)
        
        # Generate thumbnail
        thumb_path = await asyncio.to_thread(generate_video_thumbnail, video_path)
        result["thumbnail_path"] = thumb_path
        
        job["status"] = "done"
        job["result"] = result
        logger.info(f"[video] {video_id} done → {result['output_path']}")
    except Exception as e:
        logger.error(f"[video] {video_id} failed: {e}")
        job["status"] = "error"
        job["error"] = str(e)


@router.get("/status/{video_id}")
def get_status(video_id: str):
    job = _jobs.get(video_id)
    if not job:
        raise HTTPException(404, "Video not found.")
    if job["status"] == "done" and job["result"]:
        r = job["result"]
        return {
            "status": "done",
            "video_id": video_id,
            "download_url": f"/api/video/download/{video_id}",
            "srt_url": f"/api/video/srt/{video_id}",
            "thumbnail_url": f"/api/video/thumbnail/{video_id}",
            "source_language": r.get("source_language"),
            "transcript": r.get("transcript"),
            "translated_text": r.get("translated_text"),
            "segment_count": r.get("segment_count"),
        }
    return {"status": job["status"], "video_id": video_id, "error": job.get("error")}


@router.get("/download/{video_id}")
def download_video(video_id: str):
    job = _jobs.get(video_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "Subtitled video not ready.")
    path = job["result"]["output_path"]
    if not os.path.exists(path):
        raise HTTPException(404, "File not found on server.")
    return FileResponse(path=path, media_type="video/mp4", filename=f"subtitled_{video_id}.mp4")


@router.get("/thumbnail/{video_id}")
def get_thumbnail(video_id: str):
    job = _jobs.get(video_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "Thumbnail not ready.")
    thumb_path = job["result"].get("thumbnail_path", "")
    if not thumb_path or not os.path.exists(thumb_path):
        raise HTTPException(404, "Thumbnail file not found.")
    return FileResponse(path=thumb_path, media_type="image/jpeg")


@router.get("/srt/{video_id}")
def download_srt(video_id: str):
    job = _jobs.get(video_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "SRT not ready.")
    srt_path = job["result"].get("srt_path", "")
    if not srt_path or not os.path.exists(srt_path):
        raise HTTPException(404, "SRT file not found.")
    return FileResponse(path=srt_path, media_type="text/plain", filename=f"subtitles_{video_id}.srt")


@router.get("/vtt/{video_id}")
def get_vtt(video_id: str):
    job = _jobs.get(video_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "VTT not ready.")
    vtt_path = job["result"].get("vtt_path", "")
    if not vtt_path or not os.path.exists(vtt_path):
        raise HTTPException(404, "VTT file not found.")
    from fastapi.responses import Response
    with open(vtt_path, "r", encoding="utf-8") as f:
        content = f.read()
    return Response(content=content, media_type="text/vtt", headers={"Access-Control-Allow-Origin": "*"})
