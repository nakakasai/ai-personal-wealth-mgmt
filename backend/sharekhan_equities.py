import os
import secrets
from datetime import datetime, timedelta
from threading import Lock
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from SharekhanApi.sharekhanConnect import SharekhanConnect

from networth import get_current_user_id


router = APIRouter(prefix="/equities/sharekhan", tags=["Indian Equities"])

_SHAREKHAN_LOGIN_URL = "https://api.sharekhan.com/skapi/auth/login.html"
_STATE_TTL = timedelta(minutes=10)
_pending_states: dict[str, tuple[int, datetime]] = {}
_user_sessions: dict[int, dict[str, str]] = {}
_session_lock = Lock()


def _setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{name} is not configured on the backend",
        )
    return value


def _find_string(payload: Any, names: set[str]) -> str | None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key.lower() in names and isinstance(value, (str, int)):
                text = str(value).strip()
                if text:
                    return text
        for value in payload.values():
            result = _find_string(value, names)
            if result:
                return result
    elif isinstance(payload, list):
        for value in payload:
            result = _find_string(value, names)
            if result:
                return result
    return None


def _session_for(user_id: int) -> dict[str, str]:
    with _session_lock:
        session = _user_sessions.get(user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sharekhan is not connected. Start the connection again.",
        )
    return session


@router.get("/connect")
def connect_sharekhan(user_id: int = Depends(get_current_user_id)):
    api_key = _setting("SHAREKHAN_API_KEY")
    state_key = secrets.token_urlsafe(32)

    with _session_lock:
        now = datetime.utcnow()
        expired = [
            key
            for key, (_, created_at) in _pending_states.items()
            if now - created_at > _STATE_TTL
        ]
        for key in expired:
            _pending_states.pop(key, None)
        _pending_states[state_key] = (user_id, now)

    login_url = (
        f"{_SHAREKHAN_LOGIN_URL}?api_key={quote(api_key)}"
        f"&state={quote(state_key)}"
    )
    vendor_key = os.getenv("SHAREKHAN_VENDOR_KEY", "").strip()
    version_id = os.getenv("SHAREKHAN_VERSION_ID", "").strip()
    if vendor_key:
        login_url += f"&vendor_key={quote(vendor_key)}"
    if version_id:
        login_url += f"&version_id={quote(version_id)}"
    return {"broker": "Sharekhan", "login_url": login_url}


@router.get("/callback", response_class=RedirectResponse)
def sharekhan_callback(
    request_token: str | None = Query(default=None, alias="requestToken"),
    request_token_snake: str | None = Query(default=None, alias="request_token"),
    state_key: str | None = Query(default=None, alias="state"),
):
    token = request_token or request_token_snake
    if not token or not state_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sharekhan callback is missing request token or state",
        )

    with _session_lock:
        pending = _pending_states.pop(state_key, None)
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sharekhan connection request is invalid or expired",
        )

    user_id, created_at = pending
    if datetime.utcnow() - created_at > _STATE_TTL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sharekhan connection request has expired",
        )

    api_key = _setting("SHAREKHAN_API_KEY")
    secret_key = _setting("SHAREKHAN_SECURE_KEY")
    vendor_key = os.getenv("SHAREKHAN_VENDOR_KEY", "").strip() or None
    version_id = os.getenv("SHAREKHAN_VERSION_ID", "").strip() or None

    try:
        client = SharekhanConnect(api_key=api_key)
        if version_id:
            encrypted_token = client.generate_session(token, secret_key)
        else:
            encrypted_token = client.generate_session_without_versionId(
                token, secret_key
            )
        response = client.get_access_token(
            api_key,
            encrypted_token,
            state_key,
            vendorkey=vendor_key,
            versionId=version_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Sharekhan token exchange failed: {str(exc)[:250]}",
        ) from exc

    access_token = _find_string(
        response,
        {"accesstoken", "access_token", "token", "jwt"},
    )
    customer_id = _find_string(
        response,
        {"customerid", "customer_id", "userid", "user_id", "clientid", "client_id"},
    )
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Sharekhan did not return a usable access token",
        )

    with _session_lock:
        _user_sessions[user_id] = {
            "access_token": access_token,
            "customer_id": customer_id or "",
        }

    frontend_url = os.getenv(
        "SHAREKHAN_FRONTEND_URL", "http://localhost:3000"
    ).rstrip("/")
    return RedirectResponse(
        url=f"{frontend_url}?sharekhan=connected",
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.get("/status")
def sharekhan_status(user_id: int = Depends(get_current_user_id)):
    with _session_lock:
        session = _user_sessions.get(user_id)
    return {
        "broker": "Sharekhan",
        "connected": bool(session),
        "customer_id_available": bool(session and session.get("customer_id")),
    }


@router.get("/holdings/raw")
def get_sharekhan_holdings_raw(
    customer_id: str | None = Query(default=None),
    user_id: int = Depends(get_current_user_id),
):
    session = _session_for(user_id)
    resolved_customer_id = customer_id or session.get("customer_id")
    if not resolved_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Sharekhan did not return the customer ID. "
                "Provide it once using ?customer_id=YOUR_ID."
            ),
        )

    try:
        client = SharekhanConnect(
            api_key=_setting("SHAREKHAN_API_KEY"),
            access_token=session["access_token"],
            vendor_key=os.getenv("SHAREKHAN_VENDOR_KEY", "").strip() or None,
        )
        response = client.holdings(resolved_customer_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Sharekhan holdings request failed: {str(exc)[:250]}",
        ) from exc

    return {
        "broker": "Sharekhan",
        "customer_id": resolved_customer_id,
        "raw": response,
    }


@router.delete("/disconnect")
def disconnect_sharekhan(user_id: int = Depends(get_current_user_id)):
    with _session_lock:
        removed = _user_sessions.pop(user_id, None) is not None
    return {"broker": "Sharekhan", "disconnected": removed}
