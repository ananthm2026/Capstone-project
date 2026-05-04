import os
import re
import json
import logging
import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_REWRITE_MODEL = os.getenv("OPENROUTER_REWRITE_MODEL", "google/gemini-2.0-flash")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def _strip_md_json(raw: str) -> str:
    """Strip markdown code fences from a Gemini JSON response."""
    raw = raw.strip()
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'^```\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return raw.strip()


REWRITE_ENGINE_MASTER_PROMPT = """You are SeedlingSpeaks Rewrite Engine — a high-precision communication optimizer.

CORE RULES (non-negotiable):
- Preserve 100% of the original meaning. Do NOT add, remove, or assume any information.
- Only change tone, structure, and clarity.
- Never use generic phrases like "I hope you are doing well", "I am excited to share", "This is to inform you".
- Every output must feel specific, intentional, and written by a skilled human.
- If you cannot confidently rewrite without altering meaning, return the original text with minimal formatting improvements.
- Respect Indian professional communication patterns. Do not over-westernize language.

OUTPUT: Return ONLY the rewritten message. No explanations, no alternatives, no preamble.
"""

TONE_SYSTEM_PROMPTS = {
    "Email Formal": REWRITE_ENGINE_MASTER_PROMPT + """
DESTINATION: EMAIL FORMAL — professional language, complete sentences, proper salutations.

Rules:
- Start with "Subject:" on the first line. Subject must be specific and meaningful.
- Greeting: "Dear Sir/Madam,"
- Sign-off: "Yours sincerely," (never use [Name] or [Your Name] placeholders)
- No contractions. Authoritative, polished, precise tone.
- Write complete, well-structured paragraphs — not just one sentence.
- Opening sentence states the purpose clearly.
- Body expands with relevant context and details from the original.
- Closing includes a clear next step or call to action.
- Fix grammar, remove repetition, sharpen vague wording.
- No markdown.

FORMAT:
Subject: [specific, meaningful subject line]

Dear Sir/Madam,

[Opening — clear purpose statement]

[Body — professional context, complete sentences, structured paragraphs]

[Closing — confident next step or call to action]

Yours sincerely,""",

    "Email Casual": REWRITE_ENGINE_MASTER_PROMPT + """
DESTINATION: EMAIL CASUAL — conversational, warm, relaxed but professional.

Rules:
- Start with "Subject:" on the first line.
- Greeting: "Hi there,"
- Sign-off: "Cheers," (no name placeholder — never use [Name] or [Your Name])
- Contractions encouraged. Sound like a smart, emotionally aware human.
- Subject line must be crisp and interesting — avoid bland labels.
- No markdown.

FORMAT:
Subject: [friendly subject line]

Hi there,

[Body]

Cheers,""",

    "Slack": REWRITE_ENGINE_MASTER_PROMPT + """
DESTINATION: SLACK — casual, conversational, short, emoji-supported.

Rules:
- No greeting, no sign-off.
- 1 to 3 lines max for simple messages. Use bullets only if listing 3+ items.
- Add 1-2 relevant emojis placed naturally within the message (not just at the end).
- Casual and conversational — like a real team member messaging a colleague.
- Direct and scannable. The key point must be in the first line.
- If it's an introduction, make it warm and human: "Hey team! I'm [name] from [place], joining as [role] 👋"
- Copy-paste ready with zero editing needed.""",

    "LinkedIn": REWRITE_ENGINE_MASTER_PROMPT + """
DESTINATION: LINKEDIN — thought leadership tone, engaging, polished, scroll-stopping.

Rules:
- No wrapper text like "Here is your post:".
- MANDATORY structure:
  Line 1: A powerful hook — one short punchy sentence that stops the scroll. Make it bold, surprising, or insight-driven.
  Lines 2-5: 2-4 short paragraphs expanding the idea. Each paragraph max 2 sentences. Use line breaks between each.
  Second-to-last line: A clear insight, lesson, or takeaway.
  Last line: A call-to-action question to drive comments (e.g. "What's your take?", "Have you experienced this?")
  Final line: 3-5 relevant hashtags (e.g. #Internship #Growth #India)
- Tone: confident, authentic, human, thought-leadership. Never corporate-speak or generic.
- No markdown bold/italic. Use line breaks for rhythm.
- Even a simple introduction should be rewritten as a compelling professional story.

EXAMPLE for "Hello my name is Prakash, I am an intern from Gangavati":
Starting fresh in a new city with nothing but a name tag and a lot to prove.

I'm Prakash — an intern from Gangavati, stepping into the professional world for the first time.

Every city teaches you something. Every workplace shapes you. This is the beginning of that journey.

What was the moment that changed how you saw your career? Drop it below 👇

#Internship #CareerBeginnings #Gangavati #ProfessionalGrowth #India""",

    "WhatsApp": REWRITE_ENGINE_MASTER_PROMPT + """
DESTINATION: WHATSAPP — brief, clear, mobile-first, action-driving.

Rules:
- No wrapper text.
- Brief and clear — people read on mobile.
- Bullets (•) only for lists of 3+ items.
- Include a clear, specific call-to-action.
- Friendly but professional. One or two emojis max.""",

    "WhatsApp Business": REWRITE_ENGINE_MASTER_PROMPT + """
DESTINATION: WHATSAPP BUSINESS — brief, clear, mobile-first, conversion-focused.

Rules:
- No wrapper text.
- Brief and clear — people read on mobile.
- Bullets (•) only for lists of 3+ items.
- Include a clear, specific call-to-action.
- Friendly but professional. One or two emojis max.
- Stronger opening, cleaner structure, clearer intent.""",
}


def _is_quota_error(e) -> bool:
    msg = str(e).lower()
    return "quota" in msg or "429" in msg or "exceeded" in msg or "rate limit" in msg or "resource_exhausted" in msg


def _truncate_summary(text: str) -> str:
    """Local summary fallback when Gemini is unavailable."""
    return text[:300] + "..."


def _local_tone_rewrite(text: str, tone: str, user_override: str = None) -> str:
    """Small local fallback to keep tone rewrite functional without external fallback services."""
    if user_override:
        return text

    if tone == "Email Formal":
        return f"Subject: Message\n\nDear Sir/Madam,\n\n{text.strip()}\n\nYours sincerely,"
    if tone == "Email Casual":
        return f"Subject: Quick note\n\nHi there,\n\n{text.strip()}\n\nCheers,"
    if tone == "Slack":
        return text.strip()
    if tone == "LinkedIn":
        return f"{text.strip()}\n\nWhat do you think?\n\n#leadership #communication #growth"
    if tone in {"WhatsApp", "WhatsApp Business"}:
        return text.strip()
    return text


def _openrouter_tone_rewrite(text: str, tone_option: str, user_override: str = None, custom_vocabulary: list = None) -> str:
    """Fallback retone path using OpenRouter chat completions."""
    if not OPENROUTER_API_KEY:
        raise Exception("OPENROUTER_API_KEY is not set")

    if user_override:
        system_prompt = f"""You are an elite communication strategist and editor. Your job is to produce ONE single ready-to-send message using this custom tone: "{user_override}".

CRITICAL: Output EXACTLY ONE version. Do NOT give options, alternatives, variations, or explanations.

RULES:
- One message only. No "Option 1", no commentary before or after.
- Fully adopt the requested tone and style.
- Preserve ALL facts from the original text.
- Rewrite assertively for quality: remove awkward phrasing, improve structure, sharpen the message, and make the final version feel intentional, polished, and compelling.
- If the original is messy, repetitive, or fragmented, infer the strongest clean version without changing the meaning.
- Output is ONLY the rewritten message, nothing else."""
    else:
        system_prompt = TONE_SYSTEM_PROMPTS.get(tone_option, TONE_SYSTEM_PROMPTS["Email Formal"])

    vocab_hint = ""
    if custom_vocabulary:
        pairs = ", ".join([f'"{v["native"]}" -> keep as "{v["english"]}"' for v in custom_vocabulary[:20]])
        vocab_hint = f"\n\nCUSTOM VOCABULARY (preserve these terms exactly): {pairs}"

    prompt = f"""{system_prompt}{vocab_hint}

ORIGINAL TEXT:
{text}

Return ONLY the final rewritten output."""

    logger.info(
        f"OpenRouter rewrite request: tone='{tone_option}', model='{OPENROUTER_REWRITE_MODEL}', text='{text[:80]}'"
    )
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5174",
            "X-Title": "SeedlingSpeaks",
        },
        json={
            "model": OPENROUTER_REWRITE_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{vocab_hint}\n\nORIGINAL TEXT:\n{text}\n\nReturn ONLY the final rewritten output.".strip()},
            ],
            "max_tokens": 350,
            "temperature": 0.35,
            "top_p": 0.9,
        },
        timeout=90,
    )

    if response.status_code >= 400:
        detail = response.text[:500]
        raise Exception(f"OpenRouter retone failed: {response.status_code} {detail}")

    data = response.json()
    result = ""
    if isinstance(data, dict):
        result = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

    if not result:
        raise Exception("OpenRouter retone returned an empty response")

    return result


def summarize_transcript(text: str) -> str:
    """Returns a 2-3 sentence TL;DR summary of the transcript."""
    if not GEMINI_API_KEY:
        return _truncate_summary(text)
    prompt = f"""Summarize this transcript in 2-3 clear sentences. Be concise and capture the key points only.
Output ONLY the summary, no labels, no markdown.

TRANSCRIPT: {text}"""
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        return model.generate_content(prompt).text.strip()
    except Exception as e:
        logger.warning(f"Summarize failed: {e}")
        return _truncate_summary(text)


def generate_meeting_notes(text: str) -> dict:
    """Returns structured meeting notes."""
    empty = {"summary": "", "action_items": [], "decisions": [], "attendees": [], "follow_ups": []}
    if not GEMINI_API_KEY:
        return {**empty, "summary": _truncate_summary(text)}
    prompt = f"""Extract structured meeting notes from this transcript. Respond with ONLY a JSON object (no markdown):
{{
  "summary": "2-3 sentence overview",
  "action_items": ["action 1", "action 2"],
  "decisions": ["decision 1"],
  "attendees": ["name 1"],
  "follow_ups": ["follow-up 1"]
}}

TRANSCRIPT: {text}"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        raw = _strip_md_json(model.generate_content(prompt).text)
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Meeting notes failed: {e}")
        return {**empty, "summary": text[:200]}


def answer_question(transcript: str, question: str) -> str:
    """Answers a question about the transcript using Gemini."""
    if not GEMINI_API_KEY:
        return "AI Q&A unavailable — API key not configured."
    prompt = f"""You are a helpful assistant. Answer the question based ONLY on the transcript provided.
If the answer is not in the transcript, say "I couldn't find that in the transcript."
Be concise and direct.

TRANSCRIPT:
{transcript}

QUESTION: {question}

ANSWER:"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        return model.generate_content(prompt).text.strip()
    except Exception as e:
        logger.warning(f"Q&A failed: {e}")
        if _is_quota_error(e):
            return "Q&A unavailable — API quota exceeded. Please try again later."
        return "Could not process your question. Please try again."


def analyze_sentiment(text: str) -> dict:
    """Returns sentiment analysis."""
    if not GEMINI_API_KEY:
        return _local_sentiment(text)
    prompt = f"""Analyze the sentiment of this text and respond with ONLY a JSON object (no markdown, no explanation):
{{"sentiment": "positive", "score": 75, "summary": "one short sentence"}}
Use "positive", "neutral", or "negative" for sentiment. Score is 0-100.

TEXT: {text}"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        raw = _strip_md_json(model.generate_content(prompt).text)
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Sentiment analysis failed: {e}")
        if _is_quota_error(e):
            return _local_sentiment(text)
        return {"sentiment": "neutral", "score": 50, "summary": ""}


def _local_sentiment(text: str) -> dict:
    """Simple keyword-based sentiment fallback when API is unavailable."""
    positive_words = {"good", "great", "excellent", "happy", "love", "wonderful", "amazing", "fantastic", "best", "perfect", "thanks", "thank", "appreciate", "glad", "pleased"}
    negative_words = {"bad", "terrible", "awful", "hate", "worst", "horrible", "poor", "wrong", "fail", "failed", "issue", "problem", "error", "broken", "sorry", "unfortunately"}
    words = set(text.lower().split())
    pos = len(words & positive_words)
    neg = len(words & negative_words)
    if pos > neg:
        return {"sentiment": "positive", "score": min(60 + pos * 5, 90), "summary": "Text appears positive."}
    elif neg > pos:
        return {"sentiment": "negative", "score": max(40 - neg * 5, 10), "summary": "Text appears negative."}
    return {"sentiment": "neutral", "score": 50, "summary": "Text appears neutral."}


def back_translate_check(native_text: str, source_lang: str) -> dict:
    """Translates native text back to English and rates accuracy."""
    if not GEMINI_API_KEY:
        return {"back_translation": "", "accuracy_score": 0, "notes": "Gemini API key not configured."}
    prompt = f"""You are a translation quality checker.
1. Translate this {source_lang} text back to English.
2. Rate how accurately it preserves the original meaning (0-100).
3. Note any meaning drift in one sentence.

Respond ONLY with JSON (no markdown):
{{"back_translation": "english text here", "accuracy_score": 85, "notes": "one sentence"}}

TEXT: {native_text}"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        raw = _strip_md_json(model.generate_content(prompt).text)
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Back-translate failed: {e}")
        return {"back_translation": "", "accuracy_score": 0, "notes": ""}


def get_readability_score(text: str) -> dict:
    """Returns Flesch-Kincaid readability metrics."""
    sentences = len(re.findall(r'[.!?]+', text)) or 1
    words_list = text.split()
    words = len(words_list) or 1

    def count_syllables(word):
        word = word.lower().strip(".,!?;:")
        if len(word) <= 3:
            return 1
        count = len(re.findall(r'[aeiou]+', word))
        if word.endswith('e'):
            count -= 1
        return max(1, count)

    syllables = sum(count_syllables(w) for w in words_list)
    score = round(206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words))
    score = max(0, min(100, score))

    if score >= 90:
        grade, label = "5th grade", "Very Easy"
    elif score >= 80:
        grade, label = "6th grade", "Easy"
    elif score >= 70:
        grade, label = "7th grade", "Fairly Easy"
    elif score >= 60:
        grade, label = "8-9th grade", "Standard"
    elif score >= 50:
        grade, label = "10-12th grade", "Fairly Difficult"
    elif score >= 30:
        grade, label = "College", "Difficult"
    else:
        grade, label = "Professional", "Very Difficult"

    return {"score": score, "grade": grade, "label": label}


def get_tone_confidence(text: str, tone: str) -> dict:
    """Rates how well the rewritten text matches the intended tone."""
    if not GEMINI_API_KEY:
        return {"score": 70, "feedback": "Tone confidence unavailable — API key not configured."}
    prompt = f"""Rate how well this text matches the "{tone}" communication style on a scale of 0-100.
Be strict and precise.

Respond ONLY with JSON (no markdown):
{{"score": 82, "feedback": "one sentence explaining the rating"}}

TEXT: {text}"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        raw = _strip_md_json(model.generate_content(prompt).text)
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Tone confidence failed: {e}")
        if _is_quota_error(e):
            return {"score": 70, "feedback": "Tone confidence unavailable — API quota exceeded."}
        return {"score": 0, "feedback": ""}


def vision_translate_image(image_bytes: bytes, image_mime: str, target_language: str) -> list:
    """
    Uses Gemini Vision to detect text regions in an image and translate them.
    Returns a list of dicts: { original, translated, x, y, w, h, font_size, bg_color, text_color }
    Coordinates are normalized 0.0-1.0 fractions of image dimensions.
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY is not set")

    LANG_NAMES = {
        'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
        'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
        'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
        'en-IN': 'English',
    }
    lang_name = LANG_NAMES.get(target_language, target_language)

    prompt = f"""You are an expert OCR and translation engine. Analyze this image carefully.

Your task:
1. Read ALL visible text in the image
2. Group related text into logical blocks (e.g. a heading + its paragraph = one block, a label + value = one block)
3. Translate each block to {lang_name}
4. Return bounding box coordinates for each block

IMPORTANT grouping rules:
- Do NOT split a sentence into multiple blocks
- Do NOT create more than 15 blocks total — merge nearby related text
- A "block" should be a complete thought: a heading, a paragraph, a caption, a button label, etc.
- Ignore decorative elements, icons, and UI chrome (browser tabs, scrollbars, window controls)
- Focus on the CONTENT text, not the surrounding application UI

Respond with ONLY a JSON array (no markdown, no explanation):
[
  {{
    "original": "complete original text of this block",
    "translated": "complete translation in {lang_name}",
    "x": 0.1,
    "y": 0.05,
    "w": 0.8,
    "h": 0.08,
    "font_size": 0.04,
    "bg_color": "#ffffff",
    "text_color": "#000000"
  }}
]

Coordinate rules:
- x, y = top-left corner as fraction of image width/height (0.0 to 1.0)
- w, h = width/height as fraction of image dimensions (0.0 to 1.0)
- font_size = approximate text height as fraction of image height
- If text is already in {lang_name}, set translated = original
- Output ONLY the JSON array, nothing else"""

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        image_part = {"mime_type": image_mime, "data": image_bytes}
        response = model.generate_content([prompt, image_part])
        raw = _strip_md_json(response.text)
        result = json.loads(raw)

        cleaned = []
        for item in result:
            if not isinstance(item, dict):
                continue
            cleaned.append({
                "original":   str(item.get("original", "")),
                "translated": str(item.get("translated", "")),
                "x":          max(0.0, min(1.0, float(item.get("x", 0)))),
                "y":          max(0.0, min(1.0, float(item.get("y", 0)))),
                "w":          max(0.01, min(1.0, float(item.get("w", 0.5)))),
                "h":          max(0.01, min(1.0, float(item.get("h", 0.05)))),
                "font_size":  max(0.01, min(0.2, float(item.get("font_size", 0.03)))),
                "bg_color":   str(item.get("bg_color", "#ffffff")),
                "text_color": str(item.get("text_color", "#000000")),
            })
        return cleaned
    except Exception as e:
        error_str = str(e)
        logger.error(f"Vision translate failed: {e}")
        raise Exception(f"Vision translation failed: {error_str}")


def suggest_tone(text: str) -> str:
    """Returns the best tone option for the given text."""
    if not GEMINI_API_KEY:
        return _local_suggest_tone(text)
    prompt = f"""Based on this text, which communication tone fits best?
Choose EXACTLY ONE from: Email Formal, Email Casual, Slack, LinkedIn, WhatsApp Business
Respond with ONLY the tone name, nothing else.

TEXT: {text}"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        result = model.generate_content(prompt).text.strip()
        valid = ["Email Formal", "Email Casual", "Slack", "LinkedIn", "WhatsApp Business"]
        return result if result in valid else "Email Formal"
    except Exception as e:
        logger.warning(f"Tone suggestion failed: {e}")
        if _is_quota_error(e):
            return _local_suggest_tone(text)
        return "Email Formal"


def _local_suggest_tone(text: str) -> str:
    """Keyword-based tone suggestion fallback."""
    t = text.lower()
    if any(w in t for w in ["dear", "sincerely", "regards", "formally", "request", "kindly"]):
        return "Email Formal"
    if any(w in t for w in ["hey", "hi", "thanks", "cheers", "catch up", "quick"]):
        return "Email Casual"
    if any(w in t for w in ["slack", "thread", "channel", "dm", "ping", "standup"]):
        return "Slack"
    if any(w in t for w in ["linkedin", "professional", "network", "career", "opportunity", "excited to share"]):
        return "LinkedIn"
    if any(w in t for w in ["whatsapp", "hello", "hi there", "business", "order", "delivery", "customer"]):
        return "WhatsApp Business"
    return "Email Formal"


def rewrite_text_tone(text: str, tone_option: str, user_override: str = None, custom_vocabulary: list = None) -> str:
    """Uses Google Gemini first, then falls back to OpenRouter for retone."""
    if not GEMINI_API_KEY and OPENROUTER_API_KEY:
        logger.warning("Gemini key missing for retone. Falling back to OpenRouter.")
        return _openrouter_tone_rewrite(text, tone_option, user_override, custom_vocabulary)
    if not GEMINI_API_KEY:
        raise Exception("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set")

    if user_override:
        system_prompt = f"""You are an elite communication strategist and editor. Your job is to produce ONE single ready-to-send message using this custom tone: "{user_override}".

CRITICAL: Output EXACTLY ONE version. Do NOT give options, alternatives, variations, or explanations.

RULES:
- One message only. No "Option 1", no commentary before or after.
- Fully adopt the requested tone and style.
- Preserve ALL facts from the original text.
- Rewrite assertively for quality: remove awkward phrasing, improve structure, sharpen the message, and make the final version feel intentional, polished, and compelling.
- If the original is messy, repetitive, or fragmented, infer the strongest clean version without changing the meaning.
- Output is ONLY the rewritten message, nothing else."""
    else:
        system_prompt = TONE_SYSTEM_PROMPTS.get(tone_option, TONE_SYSTEM_PROMPTS["Email Formal"])

    vocab_hint = ""
    if custom_vocabulary:
        pairs = ", ".join([f'"{v["native"]}" -> keep as "{v["english"]}"' for v in custom_vocabulary[:20]])
        vocab_hint = f"\n\nCUSTOM VOCABULARY (preserve these terms exactly): {pairs}"

    prompt = f"""{system_prompt}{vocab_hint}

---
ORIGINAL TEXT:
{text}
---

REWRITTEN OUTPUT:"""

    logger.info(f"Gemini rewrite request: tone='{tone_option}', text='{text[:80]}'")
    model = genai.GenerativeModel('gemini-2.0-flash')

    try:
        response = model.generate_content(prompt)
        logger.info("Gemini rewrite response received.")
        result = (response.text or "").strip()
        if not result:
            logger.error("Gemini returned empty retone response. Prompt length: %d", len(prompt))
            raise Exception("Gemini returned an empty retone response")
        logger.info(f"Gemini retone result preview: '{result[:100]}'")
        return result
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        if _is_quota_error(e):
            if OPENROUTER_API_KEY:
                logger.warning("Gemini retone unavailable. Falling back to OpenRouter.")
                return _openrouter_tone_rewrite(text, tone_option, user_override, custom_vocabulary)
            raise Exception("Gemini retone unavailable: quota or rate limit reached and no OpenRouter fallback is configured")
        if hasattr(e, 'message'):
            raise Exception(f"Gemini error: {e.message}")
        raise Exception(f"Gemini retone failed: {str(e)}")


def gemini_translate_text(text: str, source_language: str, target_language: str) -> str:
    """Direct Gemini translation helper without cross-service fallback recursion."""
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not set")

    source_name = LANG_NAMES.get(source_language, source_language)
    target_name = LANG_NAMES.get(target_language, target_language)
    prompt = f"""Translate the following text from {source_name} to {target_name}.
Preserve meaning, tone, and formatting.
Return ONLY the translated text.

TEXT:
{text}"""

    model = genai.GenerativeModel('gemini-2.0-flash')
    response = model.generate_content(prompt)
    return response.text.strip()


# ── Advanced Neural Translation ───────────────────────────────────────────────
LANG_NAMES = {
    'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
    'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
    'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia', 'en-IN': 'English',
}

ADVANCED_TRANSLATION_PROMPT = """You are an advanced multilingual translation engine designed to match or exceed modern Neural Machine Translation systems.

STEP 1 — CONTEXT ANALYSIS: Analyze source language(s), domain, tone, slang, idioms, and jargon.
STEP 2 — SEMANTIC UNDERSTANDING: Understand full sentence meaning. Do NOT translate word-by-word. Resolve ambiguity using context. Handle mixed-language input (Hinglish, Tanglish, etc.).
STEP 3 — JARGON HANDLING: Preserve technical terms. Infer unknown jargon from context.
STEP 4 — SLANG NORMALIZATION: Convert slang/idioms to their true meaning, then translate naturally.
STEP 5 — TRANSLATION: Translate to {target_language}. Preserve meaning, intent, tone. Use domain-appropriate vocabulary. Sound natural to a native speaker.
STEP 6 — REFINEMENT: Improve fluency, ensure grammatical correctness, match intended tone.

GLOSSARY (preserve these terms exactly):
{glossary}

Return ONLY valid JSON (no markdown):
{{"detected_language": "", "domain": "", "tone": "", "has_slang": false, "jargon_terms": [], "final_translation": "", "confidence_score": 0}}

INPUT: {user_input}"""


def advanced_translate(
    text: str,
    target_language: str,
    glossary: dict | None = None,
) -> dict:
    """
    Advanced Gemini-powered translation with context analysis, slang handling,
    jargon preservation, and confidence scoring.

    Returns:
        {
            detected_language, domain, tone, has_slang,
            jargon_terms, final_translation, confidence_score
        }
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not set")

    lang_name = LANG_NAMES.get(target_language, target_language)
    glossary_str = ""
    if glossary:
        glossary_str = "\n".join([f'"{k}" → "{v}"' for k, v in glossary.items()])

    prompt = ADVANCED_TRANSLATION_PROMPT.format(
        target_language=lang_name,
        glossary=glossary_str or "None provided",
        user_input=text,
    )

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(prompt)
        raw = _strip_md_json(response.text)
        result = json.loads(raw)

        # Validate required fields
        if "final_translation" not in result or not result["final_translation"]:
            raise ValueError("Empty translation in response")

        logger.info(
            f"[advanced_translate] lang={target_language}, "
            f"confidence={result.get('confidence_score')}, "
            f"domain={result.get('domain')}"
        )
        return result

    except Exception as e:
        logger.error(f"[advanced_translate] failed: {e}")
        raise


def advanced_translate_text(text: str, target_language: str, glossary: dict | None = None) -> str:
    """
    Convenience wrapper — returns just the translated string.
    Falls back to basic Sarvam translation on failure.
    """
    try:
        result = advanced_translate(text, target_language, glossary)
        return result["final_translation"]
    except Exception as e:
        logger.warning(f"[advanced_translate_text] Gemini failed, falling back: {e}")
        # Fallback to Sarvam
        from services.sarvam_client import translate_text as sarvam_translate
        return sarvam_translate(text, source_language="en-IN", target_language=target_language)
