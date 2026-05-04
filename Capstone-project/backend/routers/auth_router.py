"""
Auth router — Clerk OAuth integration with /api/auth/sync-user endpoint
User data is synced to Neon PostgreSQL on Clerk signup completion.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator, field_serializer
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer()

# ── Request / Response models ─────────────────────────────────────────────────
class SyncUserRequest(BaseModel):
    """Request body when frontend syncs Clerk user to database after signup"""
    id: str                          # Clerk user ID
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    consent_given: bool = False      # GDPR consent

    @field_validator("email")
    @classmethod
    def email_valid(cls, v):
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v.lower().strip()

class UserResponse(BaseModel):
    id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    avatar_url: Optional[str]
    created_at: Optional[datetime] = None
    consent_given: bool = False
    consent_timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True

    @field_serializer('created_at', 'consent_timestamp')
    def serialize_dt(self, value, _info):
        return value.isoformat() if value else None

class ConsentUpdateRequest(BaseModel):
    consent_given: bool

# ── Database helpers ──────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/sync-user", response_model=UserResponse)
def sync_user(req: SyncUserRequest, db: Session = Depends(get_db)):
    """
    Sync Clerk user data to Neon database.
    Called from frontend after Clerk signup completes.
    Creates user if doesn't exist; updates if already exists.
    """
    try:
        print(f"[SYNC-USER] Syncing user: {req.id} ({req.email})")
        
        # Check if user exists
        existing_user = db.query(User).filter(User.id == req.id).first()
        
        if existing_user:
            # Update existing user
            print(f"[SYNC-USER] User {req.id} exists, updating...")
            existing_user.email = req.email
            existing_user.first_name = req.first_name
            existing_user.last_name = req.last_name
            existing_user.avatar_url = req.avatar_url
            # Only update consent if explicitly provided as True (don't overwrite existing consent)
            if req.consent_given and not existing_user.consent_given:
                existing_user.consent_given = True
                existing_user.consent_timestamp = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing_user)
            return existing_user
        else:
            # Create new user
            print(f"[SYNC-USER] Creating new user {req.id}")
            new_user = User(
                id=req.id,
                email=req.email,
                first_name=req.first_name,
                last_name=req.last_name,
                avatar_url=req.avatar_url,
                consent_given=req.consent_given,
                consent_timestamp=datetime.now(timezone.utc) if req.consent_given else None,
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            return new_user
    except Exception as e:
        db.rollback()
        print(f"[SYNC-USER] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to sync user: {str(e)}")

@router.get("/me", response_model=UserResponse)
def get_me(db: Session = Depends(get_db), credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    """
    Get current authenticated user from Clerk token.
    Clerk token (JWT) contains the user ID in the 'sub' claim.
    """
    try:
        from jwt import decode
        import os
        
        token = credentials.credentials
        # Decode Clerk token without verification (Clerk validates on their side)
        # In production, verify against Clerk's JWKS
        payload = decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found in database")
        
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

@router.patch("/consent", response_model=UserResponse)
def update_consent(
    req: ConsentUpdateRequest,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(bearer)
):
    """Update GDPR consent for the authenticated user."""
    try:
        from jwt import decode
        token = credentials.credentials
        payload = decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.consent_given = req.consent_given
        user.consent_timestamp = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)
        return user
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check-user")
def check_user_exists(email: str, db: Session = Depends(get_db)):
    """
    Check if a user with the given email already exists.
    Used during signup to prevent duplicate accounts.
    Returns {"exists": true/false}
    """
    try:
        email_lower = email.lower().strip()
        user = db.query(User).filter(User.email == email_lower).first()
        
        if user:
            print(f"[CHECK-USER] User with email {email_lower} exists")
            return {"exists": True, "message": "User already exists"}
        else:
            print(f"[CHECK-USER] User with email {email_lower} does not exist")
            return {"exists": False, "message": "User not found"}
    except Exception as e:
        print(f"[CHECK-USER] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/debug/users")
def debug_list_all_users(db: Session = Depends(get_db)):
    """DEBUG ENDPOINT: List all users in database (remove in production)"""
    try:
        users = db.query(User).all()
        print(f"[DEBUG] Total users in database: {len(users)}")
        return {
            "total_users": len(users),
            "users": [user.to_dict() for user in users]
        }
    except Exception as e:
        return {"error": str(e), "total_users": 0, "users": []}

@router.get("/debug/user/{user_id}")
def debug_get_user(user_id: str, db: Session = Depends(get_db)):
    """DEBUG ENDPOINT: Check if a specific user exists in database (remove in production)"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            print(f"[DEBUG] Found user {user_id}")
            return {"exists": True, "user": user.to_dict()}
        else:
            print(f"[DEBUG] User {user_id} not found")
            return {"exists": False, "user": None}
    except Exception as e:
        return {"exists": False, "error": str(e)}


