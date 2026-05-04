"""
Translation Cache — two-layer lookup for all Indian languages.

Layer 1: Exact match  — sha256(text + lang) → instant, zero cost
Layer 2: Semantic match — multilingual sentence embeddings + cosine similarity
         Model: paraphrase-multilingual-MiniLM-L12-v2
         Supports: hi, bn, ta, te, ml, mr, gu, kn, pa, or + English

Flow:
  get_cached(text, lang)
    → exact hit  → return immediately
    → semantic hit (sim >= threshold) → return
    → None       → caller hits Sarvam → store_translation(...)
"""

import sqlite3
import hashlib
import logging
import os
from datetime import datetime
from threading import Thread
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "translation_cache.db")

# Multilingual model — covers all 10 Indian languages + English
# Downloads ~120 MB on first use, cached in Docker layer after that
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

_model = None


def _get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading sentence-transformers model: {MODEL_NAME}")
            _model = SentenceTransformer(MODEL_NAME)
            logger.info("Embedding model ready.")
        except Exception as e:
            logger.warning(f"Could not load embedding model (semantic cache disabled): {e}")
            _model = False  # sentinel — don't retry
    return _model if _model is not False else None


def _warmup():
    """Load the model in a background thread at startup so first request is fast."""
    def _load():
        _get_model()
    Thread(target=_load, daemon=True).start()

_warmup()


def _init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS translation_cache (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key    TEXT UNIQUE NOT NULL,
            source_text  TEXT NOT NULL,
            target_lang  TEXT NOT NULL,
            translation  TEXT NOT NULL,
            embedding    BLOB,
            hit_count    INTEGER DEFAULT 0,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            last_used    TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lang ON translation_cache(target_lang)")
    conn.commit()
    conn.close()


_init_db()


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_key(text: str, lang: str) -> str:
    return hashlib.sha256(f"{text.strip().lower()}|{lang}".encode()).hexdigest()


def _embed(text: str) -> Optional[np.ndarray]:
    model = _get_model()
    if model is None:
        return None
    try:
        return model.encode(text, normalize_embeddings=True).astype(np.float32)
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return None


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    # Both are already L2-normalised → dot product == cosine similarity
    return float(np.dot(a, b))


# ── public API ────────────────────────────────────────────────────────────────

def get_cached(text: str, lang: str, threshold: float = 0.92) -> Optional[str]:
    """
    Returns a cached translation or None.
    Layer 1: exact hash — always runs, instant.
    Layer 2: semantic similarity — only runs if model is already loaded (non-blocking).
    """
    conn = sqlite3.connect(DB_PATH)
    now = datetime.utcnow().isoformat()
    try:
        # ── Layer 1: exact hash match ─────────────────────────────────────
        key = _make_key(text, lang)
        row = conn.execute(
            "SELECT translation FROM translation_cache WHERE cache_key = ?", (key,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE translation_cache SET hit_count = hit_count+1, last_used=? WHERE cache_key=?",
                (now, key),
            )
            conn.commit()
            logger.info(f"Cache HIT (exact) lang={lang} text='{text[:60]}'")
            return row[0]

        # ── Layer 2: semantic — only if model already in memory ───────────
        # _model is None (not loaded yet) or False (failed) → skip, don't block
        if not _model:
            return None

        query_emb = _embed(text)
        if query_emb is None:
            return None

        rows = conn.execute(
            "SELECT cache_key, translation, embedding FROM translation_cache "
            "WHERE target_lang=? AND embedding IS NOT NULL",
            (lang,),
        ).fetchall()

        best_sim, best_trans, best_key = 0.0, None, None
        for r_key, r_trans, r_blob in rows:
            if not r_blob:
                continue
            r_emb = np.frombuffer(r_blob, dtype=np.float32)
            sim = _cosine(query_emb, r_emb)
            if sim > best_sim:
                best_sim, best_trans, best_key = sim, r_trans, r_key

        if best_sim >= threshold and best_trans:
            conn.execute(
                "UPDATE translation_cache SET hit_count = hit_count+1, last_used=? WHERE cache_key=?",
                (now, best_key),
            )
            conn.commit()
            logger.info(f"Cache HIT (semantic {best_sim:.3f}) lang={lang} text='{text[:60]}'")
            return best_trans

        return None
    finally:
        conn.close()


def store_translation(text: str, lang: str, translation: str) -> None:
    """Persist a new translation. Embedding is computed in a background thread."""
    key = _make_key(text, lang)
    now = datetime.utcnow().isoformat()

    # Write the translation immediately (no embedding yet)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO translation_cache
                (cache_key, source_text, target_lang, translation, embedding, created_at, last_used)
            VALUES (?, ?, ?, ?, NULL, ?, ?)
            """,
            (key, text.strip(), lang, translation, now, now),
        )
        conn.commit()
        logger.info(f"Cache STORE lang={lang} text='{text[:60]}'")
    finally:
        conn.close()

    # Compute and attach embedding in background — doesn't block the response
    def _attach_embedding():
        emb = _embed(text)
        if emb is None:
            return
        c = sqlite3.connect(DB_PATH)
        try:
            c.execute(
                "UPDATE translation_cache SET embedding=? WHERE cache_key=?",
                (emb.tobytes(), key),
            )
            c.commit()
        finally:
            c.close()

    Thread(target=_attach_embedding, daemon=True).start()


def get_stats() -> dict:
    conn = sqlite3.connect(DB_PATH)
    try:
        total = conn.execute("SELECT COUNT(*) FROM translation_cache").fetchone()[0]
        hits  = conn.execute("SELECT COALESCE(SUM(hit_count),0) FROM translation_cache").fetchone()[0]
        langs = conn.execute(
            "SELECT target_lang, COUNT(*), COALESCE(SUM(hit_count),0) "
            "FROM translation_cache GROUP BY target_lang"
        ).fetchall()
        return {
            "total_entries": total,
            "total_hits": hits,
            "by_language": {r[0]: {"entries": r[1], "hits": r[2]} for r in langs},
        }
    finally:
        conn.close()


def clear_cache(lang: Optional[str] = None) -> int:
    """Delete cache entries. Returns number of rows deleted."""
    conn = sqlite3.connect(DB_PATH)
    try:
        if lang:
            cur = conn.execute("DELETE FROM translation_cache WHERE target_lang=?", (lang,))
        else:
            cur = conn.execute("DELETE FROM translation_cache")
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()
