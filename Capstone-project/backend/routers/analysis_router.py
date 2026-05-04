"""
analysis_router.py — Text analysis & intelligence endpoints.
POST /api/analyze-sentiment  → Sentiment analysis
POST /api/suggest-tone       → Tone suggestion
POST /api/summarize          → Transcript summarization
POST /api/meeting-notes      → Structured meeting notes extraction
POST /api/qa                 → Q&A over transcript
POST /api/readability        → Flesch-Kincaid readability score
POST /api/tone-confidence    → Tone match confidence rating
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.gemini_client import (
    analyze_sentiment,
    suggest_tone,
    summarize_transcript,
    generate_meeting_notes,
    answer_question,
    get_readability_score,
    get_tone_confidence,
)

router = APIRouter(prefix="/api", tags=["analysis"])
logger = logging.getLogger(__name__)


class SentimentRequest(BaseModel):
    text: str


class ToneSuggestRequest(BaseModel):
    text: str


class SummarizeRequest(BaseModel):
    text: str


class MeetingNotesRequest(BaseModel):
    text: str


class QARequest(BaseModel):
    transcript: str
    question: str


class ReadabilityRequest(BaseModel):
    text: str


class ToneConfidenceRequest(BaseModel):
    text: str
    tone: str


@router.post("/analyze-sentiment")
async def handle_sentiment(request: SentimentRequest):
    """Returns sentiment analysis: positive/neutral/negative with score and summary."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        return analyze_sentiment(request.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggest-tone")
async def handle_suggest_tone(request: ToneSuggestRequest):
    """Returns the best tone for the given text."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        tone = suggest_tone(request.text)
        return {"suggested_tone": tone}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summarize")
async def handle_summarize(request: SummarizeRequest):
    """Returns a 2-3 sentence TL;DR of the transcript."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        return {"summary": summarize_transcript(request.text)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/meeting-notes")
async def handle_meeting_notes(request: MeetingNotesRequest):
    """Returns structured meeting notes from a transcript."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        return generate_meeting_notes(request.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qa")
async def handle_qa(request: QARequest):
    """Answers a question about the transcript."""
    if not request.transcript.strip() or not request.question.strip():
        raise HTTPException(
            status_code=400, detail="Transcript and question are required"
        )
    try:
        return {"answer": answer_question(request.transcript, request.question)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/readability")
async def handle_readability(request: ReadabilityRequest):
    """Returns Flesch-Kincaid readability score for the given text."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    return get_readability_score(request.text)


@router.post("/tone-confidence")
async def handle_tone_confidence(request: ToneConfidenceRequest):
    """Rates how well the rewritten text matches the intended tone."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        return get_tone_confidence(request.text, request.tone)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
