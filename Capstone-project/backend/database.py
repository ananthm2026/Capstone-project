"""
database.py — PostgreSQL engine, session factory, and Base.

Reads DATABASE_URL from environment. Supports both:
  - postgres://...   (Render/Heroku style — auto-converted to postgresql+psycopg2://)
  - postgresql://... (standard SQLAlchemy style)

SSL is enabled automatically for cloud providers.
"""
import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ── Build connection URL ──────────────────────────────────────────────────────
_raw_url = os.getenv("DATABASE_URL", "")

if not _raw_url:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Add it to your .env file or Render dashboard."
    )

# Render/Heroku give postgres:// — SQLAlchemy 1.4+ requires postgresql://
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)

# Force psycopg2 driver
if _raw_url.startswith("postgresql://") and "+psycopg2" not in _raw_url:
    _raw_url = _raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)

DATABASE_URL = _raw_url

# ── Engine ────────────────────────────────────────────────────────────────────
# Use SSL only for cloud providers (Render, Supabase, Neon, etc.)
# Local postgres (localhost / 127.0.0.1) doesn't support SSL — skip it
_is_local = any(h in DATABASE_URL for h in ["localhost", "127.0.0.1"])
_connect_args = {} if _is_local else {"sslmode": "require"}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args,
)

# ── Session factory ───────────────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Declarative base (shared by all models) ───────────────────────────────────
Base = declarative_base()

# ── Dependency for FastAPI routes ─────────────────────────────────────────────
def get_session():
    """Yields a DB session and ensures it's closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── Table creation ────────────────────────────────────────────────────────────
def init_db():
    """Create all tables defined in models. Safe to call on every startup."""
    try:
        # Import models so Base knows about them before create_all
        import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        # Quick connectivity check
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        # Migrate: drop removed columns from english_to_native_translations
        _migrate_e2n_translations()
        logger.info("PostgreSQL connected and tables verified.")
    except Exception as e:
        logger.error(f"Database init failed: {e}")
        raise


def _migrate_e2n_translations():
    """Drop legacy columns (tone_applied, toned_text, was_toned) if they still exist."""
    dropped = []
    with engine.connect() as conn:
        for col in ("tone_applied", "toned_text", "was_toned"):
            try:
                conn.execute(text(
                    f"ALTER TABLE english_to_native_translations DROP COLUMN IF EXISTS {col}"
                ))
                dropped.append(col)
            except Exception:
                pass
        conn.commit()
    if dropped:
        logger.info(f"E2N migration: dropped columns {dropped}")
