"""
services/auth.py — JWT auth + user CRUD backed by PostgreSQL via SQLAlchemy.

API contracts are unchanged:
  create_user(name, email, password) -> dict
  authenticate_user(email, password) -> dict
  get_user_by_id(user_id)            -> Optional[dict]
  create_token(user_id, email)       -> str
  decode_token(token)                -> dict  (raises ValueError on failure)
"""
import os
import hashlib
import hmac
import time
import json
import base64
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from database import SessionLocal
from models import User

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY         = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
ALGORITHM          = "HS256"
TOKEN_EXPIRE_HOURS = 72

# ── Password hashing (SHA-256 + random salt) ──────────────────────────────────
def hash_password(password: str) -> str:
    salt = base64.b64encode(os.urandom(16)).decode()
    h    = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${h}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$", 1)
        return hmac.compare_digest(
            hashlib.sha256((salt + password).encode()).hexdigest(), h
        )
    except Exception:
        return False

# ── JWT (pure stdlib — no python-jose) ───────────────────────────────────────
def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))

def create_token(user_id: int, email: str) -> str:
    header  = _b64url_encode(json.dumps({"alg": ALGORITHM, "typ": "JWT"}).encode())
    exp     = int(time.time()) + TOKEN_EXPIRE_HOURS * 3600
    payload = _b64url_encode(json.dumps({"sub": str(user_id), "email": email, "exp": exp}).encode())
    sig_in  = f"{header}.{payload}".encode()
    sig     = _b64url_encode(hmac.new(SECRET_KEY.encode(), sig_in, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"

def decode_token(token: str) -> dict:
    """Returns payload dict or raises ValueError."""
    try:
        header, payload, sig = token.split(".")
    except ValueError:
        raise ValueError("Malformed token")
    sig_in   = f"{header}.{payload}".encode()
    expected = _b64url_encode(hmac.new(SECRET_KEY.encode(), sig_in, hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise ValueError("Invalid token signature")
    data = json.loads(_b64url_decode(payload))
    if data.get("exp", 0) < time.time():
        raise ValueError("Token expired")
    return data

# ── User CRUD (PostgreSQL via SQLAlchemy) ─────────────────────────────────────
def create_user(name: str, email: str, password: str) -> dict:
    db = SessionLocal()
    try:
        user = User(
            name=name.strip(),
            email=email.lower().strip(),
            password=hash_password(password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"New user created: {user.email}")
        return {"id": user.id, "name": user.name, "email": user.email}
    except IntegrityError:
        db.rollback()
        raise ValueError("Email already registered")
    except Exception as e:
        db.rollback()
        logger.error(f"create_user error: {e}")
        raise
    finally:
        db.close()

def authenticate_user(email: str, password: str) -> dict:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower().strip()).first()
        if not user or not verify_password(password, user.password):
            raise ValueError("Invalid email or password")
        logger.info(f"User authenticated: {user.email}")
        return {"id": user.id, "name": user.name, "email": user.email}
    finally:
        db.close()

def get_user_by_id(user_id: int) -> Optional[dict]:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        return user.to_dict() if user else None
    finally:
        db.close()
