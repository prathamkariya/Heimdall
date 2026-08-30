from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models import User
from app.schemas import (
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    get_user_by_email,
    hash_password,
    revoke_all_user_tokens,
    revoke_refresh_token,
    revoke_refresh_token_by_token_only,
    rotate_refresh_token,
)
from app.services.watchlist_service import seed_default_watchlist

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def register(request: Request, payload: UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user.
    Returns 409 if email or username already exists.
    Password is bcrypt-hashed before storage.
    """
    # Check email uniqueness
    if get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    # Check username uniqueness
    existing_username = db.query(User).filter(User.username == payload.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # FIX-04: seed a default watchlist so new users aren't silently locked out of the SSE stream
    seed_default_watchlist(db, user.id)
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def login(request: Request, response: Response, payload: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user and return access + refresh token pair.
    Returns 401 for any invalid credential (deliberately vague message).
    """
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(db, user.id)

    token_res = TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=14 * 24 * 60 * 60
    )
    
    return token_res


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access token.
    The presented refresh token is rotated (revoked) on use.
    Returns 401 if the refresh token is invalid, expired, or already revoked.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    result = rotate_refresh_token(db, refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    new_access_token, new_refresh = result

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,          # True for production (HTTPS)
        samesite="lax",
        max_age=14 * 24 * 60 * 60  # 14 days
    )

    return TokenResponse(
        access_token=new_access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Revoke the refresh token from the cookie, if present.

    Does NOT require a valid access token — a user with an expired access token
    but a still-valid refresh-token cookie must still be able to log out and
    invalidate their session. Possession of the raw refresh token cookie itself
    proves the caller's identity sufficiently for revocation.

    Returns 204 whether or not a token was found (avoid info leaks).
    """
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        revoke_refresh_token_by_token_only(db, refresh_token)
    response.delete_cookie("refresh_token")
    # Always return 204 — don't reveal whether token existed


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Revoke ALL refresh tokens for the current user (logout from all devices).
    Requires valid access token.
    """
    revoke_all_user_tokens(db, current_user.id)
    response.delete_cookie("refresh_token")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.post("/sse-token", tags=["auth"])
def get_sse_token(current_user: User = Depends(get_current_user)):
    """Issue a short-lived (60s), purpose-scoped token for the SSE stream endpoint.

    The browser EventSource API cannot send custom headers, so the SSE endpoint
    accepts the token via a ?token= query param. Using a separate, very-short-lived
    token (rather than reusing the 30-minute access token) limits the exposure
    window if the URL is logged by a proxy or lands in browser history.

    The returned token is only valid for GET /alerts/stream/live and expires in 60s.
    """
    from datetime import timezone

    from jose import jwt as jose_jwt
    expire = datetime.now(timezone.utc) + timedelta(seconds=60)
    payload = {
        "sub": str(current_user.id),
        "type": "sse",
        "exp": expire,
    }
    token = jose_jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return {"sse_token": token, "expires_in": 60}
