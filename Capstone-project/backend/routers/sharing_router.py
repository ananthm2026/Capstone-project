"""
sharing_router.py — External sharing & export endpoints.
POST /api/send/email       → Send translated text via email
POST /api/send/slack       → Send message to Slack
POST /api/send/linkedin    → Share post to LinkedIn
POST /api/share/create     → Create shareable read-only link
GET  /api/share/{link_id}  → Retrieve shared content
POST /api/export           → Export history as CSV or TXT
"""
import io
import csv
import uuid
import time
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.email_service import send_email, format_email_body
from services.slack_service import send_to_slack, format_slack_message
from services.linkedin_service import (
    share_to_linkedin,
    format_linkedin_post,
    mock_linkedin_share,
)

router = APIRouter(prefix="/api", tags=["sharing"])
logger = logging.getLogger(__name__)

# ── In-memory share link store (UUID → {text, title, created_at}) ──
_share_store: dict = {}


# ── Request models ────────────────────────────────────────────────────────────

class EmailRequest(BaseModel):
    text: str
    to_email: str
    subject: str = "Message from Voice Translation App"
    tone: Optional[str] = None
    language: Optional[str] = None
    use_sendgrid: bool = False
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None


class SlackRequest(BaseModel):
    text: str
    webhook_url: Optional[str] = None
    channel: Optional[str] = None
    tone: Optional[str] = None
    language: Optional[str] = None
    use_api: bool = False


class LinkedInRequest(BaseModel):
    text: str
    tone: Optional[str] = None
    language: Optional[str] = None
    add_hashtags: bool = True
    access_token: Optional[str] = None
    person_urn: Optional[str] = None
    use_mock: bool = True


class ShareLinkRequest(BaseModel):
    text: str
    title: str = ""


class ExportRequest(BaseModel):
    entries: list
    format: str = "csv"  # csv or txt


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send/email")
async def handle_send_email(request: EmailRequest):
    """Sends translated text via email (SMTP or SendGrid)."""
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if not request.to_email or "@" not in request.to_email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    try:
        logger.info(f"Sending email to {request.to_email}")
        plain_text, html_body = format_email_body(
            request.text, tone=request.tone, language=request.language
        )
        result = send_email(
            to_email=request.to_email,
            subject=request.subject,
            body=plain_text,
            html_body=html_body,
            use_sendgrid=request.use_sendgrid,
            smtp_username=request.smtp_username,
            smtp_password=request.smtp_password,
        )
        return result
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send/slack")
async def handle_send_slack(request: SlackRequest):
    """Sends translated text to Slack (webhook or API)."""
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        logger.info("Sending message to Slack")
        formatted_text = format_slack_message(
            request.text, tone=request.tone, language=request.language
        )
        result = send_to_slack(
            text=formatted_text,
            channel=request.channel,
            webhook_url=request.webhook_url,
            use_api=request.use_api,
        )
        return result
    except Exception as e:
        logger.error(f"Slack send error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send/linkedin")
async def handle_send_linkedin(request: LinkedInRequest):
    """Shares translated text to LinkedIn."""
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        logger.info("Sharing post to LinkedIn")
        formatted_text = format_linkedin_post(
            request.text,
            tone=request.tone,
            language=request.language,
            add_hashtags=request.add_hashtags,
        )
        if request.use_mock:
            result = mock_linkedin_share(formatted_text)
        else:
            result = share_to_linkedin(
                text=formatted_text,
                access_token=request.access_token,
                person_urn=request.person_urn,
            )
        return result
    except Exception as e:
        logger.error(f"LinkedIn share error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/share/create")
async def create_share_link(request: ShareLinkRequest):
    """Creates a shareable read-only link for a transcript/message."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    link_id = str(uuid.uuid4())[:8]
    _share_store[link_id] = {
        "text": request.text,
        "title": request.title,
        "created_at": time.time(),
    }
    return {"link_id": link_id, "url": f"/share/{link_id}"}


@router.get("/share/{link_id}")
async def get_share_link(link_id: str):
    """Returns the shared content for a given link ID."""
    item = _share_store.get(link_id)
    if not item:
        raise HTTPException(
            status_code=404, detail="Share link not found or expired"
        )
    return item


@router.post("/export")
async def handle_export(request: ExportRequest):
    """Exports history entries as CSV or plain text."""
    if request.format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Timestamp", "Language", "Confidence", "Transcript"])
        for e in request.entries:
            conf = (
                f"{round(e.get('confidence', 0) * 100)}%"
                if e.get("confidence")
                else "N/A"
            )
            writer.writerow(
                [e.get("timestamp", ""), e.get("lang", ""), conf, e.get("text", "")]
            )
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=transcripts.csv"},
        )
    else:
        lines = []
        for e in request.entries:
            lines.append(f"[{e.get('timestamp', '')}] ({e.get('lang', '')})")
            lines.append(e.get("text", ""))
            lines.append("")
        content = "\n".join(lines)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=transcripts.txt"},
        )
