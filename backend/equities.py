import json
import os
import secrets
from datetime import datetime, timedelta
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from models import WealthAsset
from networth import create_or_update_snapshot, get_current_user_id, get_db


router = APIRouter(prefix="/equities/paytm", tags=["Indian Equities"])

PAYTM_API_HOST = "https://developer.paytmmoney.com"
PAYTM_LOGIN_URL = "https://login.paytmmoney.com/merchant-login"

# Paytm tokens are deliberately kept in memory for the MVP. They disappear when
# the backend restarts and are never written to Git or returned to the browser.
_pending_states: dict[str, tuple[int, datetime]] = {}
_user_sessions: dict[int, dict[str, str]] = {}
_session_lock = Lock()
_STATE_TTL = timedelta(minutes=10)


def _setting(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{name} is not configured on the backend",
        )
    return value


def _paytm_request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "openapi-client-src": "api",
    }
    if token:
        headers["x-jwt-token"] = token

    request = Request(
        f"{PAYTM_API_HOST}{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=headers,
        method=method,
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Paytm Money API returned HTTP {exc.code}: {detail[:300]}",
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not communicate with Paytm Money",
        ) from exc


def _session_for(user_id: int) -> dict[str, str]:
    with _session_lock:
        session = _user_sessions.get(user_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paytm Money is not connected. Start the connection again.",
        )
    return session


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").replace("₹", "").strip())
        except ValueError:
            return None
    return None


def _find_current_value(payload: Any) -> float | None:
    preferred_keys = {
        "current_value",
        "currentvalue",
        "total_current_value",
        "totalcurrentvalue",
        "holding_value",
        "holdings_value",
        "portfolio_value",
        "market_value",
    }

    if isinstance(payload, dict):
        for key, value in payload.items():
            if key.replace("-", "_").lower() in preferred_keys:
                parsed = _number(value)
                if parsed is not None:
                    return parsed
        for value in payload.values():
            found = _find_current_value(value)
            if found is not None:
                return found

    if isinstance(payload, list):
        values = [_find_current_value(item) for item in payload]
        values = [value for value in values if value is not None]
        if values:
            return sum(values)

    return None


@router.get("/connect")
def connect_paytm(
    user_id: int = Depends(get_current_user_id),
):
    api_key = _setting("PAYTM_MONEY_API_KEY")
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
        f"{PAYTM_LOGIN_URL}?apiKey={quote(api_key)}"
        f"&state={quote(state_key)}"
    )
    return {"login_url": login_url}


@router.get("/callback", response_class=HTMLResponse)
def paytm_callback(
    request_token: str | None = Query(default=None, alias="requestToken"),
    request_token_snake: str | None = Query(default=None, alias="request_token"),
    state_key: str | None = Query(default=None, alias="state"),
):
    token = request_token or request_token_snake
    if not token or not state_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paytm callback is missing request token or state",
        )

    with _session_lock:
        pending = _pending_states.pop(state_key, None)

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paytm connection request is invalid or expired",
        )

    user_id, created_at = pending
    if datetime.utcnow() - created_at > _STATE_TTL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paytm connection request has expired",
        )

    session = _paytm_request(
        "POST",
        "/accounts/v2/gettoken",
        body={
            "api_key": _setting("PAYTM_MONEY_API_KEY"),
            "api_secret_key": _setting("PAYTM_MONEY_API_SECRET"),
            "request_token": token,
        },
    )

    if not any(
        session.get(name)
        for name in ("read_access_token", "access_token")
    ):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Paytm Money did not return a usable access token",
        )

    with _session_lock:
        _user_sessions[user_id] = {
            key: value
            for key, value in session.items()
            if key in {
                "access_token",
                "read_access_token",
                "public_access_token",
            }
            and isinstance(value, str)
        }

    return HTMLResponse(
        "<h2>Paytm Money connected successfully.</h2>"
        "<p>You can close this window and return to AI Finance Manager.</p>"
    )


@router.get("/status")
def paytm_status(
    user_id: int = Depends(get_current_user_id),
):
    with _session_lock:
        connected = user_id in _user_sessions
    return {"broker": "Paytm Money", "connected": connected}


@router.get("/holdings")
def get_paytm_holdings(
    user_id: int = Depends(get_current_user_id),
):
    session = _session_for(user_id)
    read_token = session.get("read_access_token") or session.get("access_token")
    return _paytm_request(
        "GET",
        "/holdings/v1/get-user-holdings-data",
        token=read_token,
    )


@router.post("/sync")
def sync_paytm_equity(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    session = _session_for(user_id)
    read_token = session.get("read_access_token") or session.get("access_token")

    value_payload = _paytm_request(
        "GET",
        "/holdings/v1/get-holdings-value",
        token=read_token,
    )
    current_value = _find_current_value(value_payload)

    if current_value is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Paytm holdings were fetched, but the current-value field "
                "could not be recognized. Use GET /equities/paytm/holdings "
                "to inspect the broker response."
            ),
        )

    asset = (
        db.query(WealthAsset)
        .filter(
            WealthAsset.user_id == user_id,
            WealthAsset.institution == "Paytm Money",
            WealthAsset.source_type == "api",
        )
        .first()
    )

    if asset is None:
        asset = WealthAsset(
            user_id=user_id,
            category="Equity",
            asset_name="Paytm Money Equity Portfolio",
            institution="Paytm Money",
            currency="INR",
            source_type="api",
            current_value=current_value,
            notes="Automatically synchronized from Paytm Money Open API",
        )
        db.add(asset)
    else:
        asset.current_value = current_value
        asset.currency = "INR"
        asset.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(asset)
    create_or_update_snapshot(db, user_id)

    return {
        "broker": "Paytm Money",
        "asset_id": asset.id,
        "currency": "INR",
        "current_value": current_value,
        "synced_at": datetime.utcnow(),
    }


@router.delete("/disconnect")
def disconnect_paytm(
    user_id: int = Depends(get_current_user_id),
):
    with _session_lock:
        removed = _user_sessions.pop(user_id, None) is not None
    return {"broker": "Paytm Money", "disconnected": removed}
