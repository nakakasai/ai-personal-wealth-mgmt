import json
import os
import secrets
from datetime import datetime, timedelta
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
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
_FX_TTL = timedelta(hours=12)
_fx_cache: dict[str, Any] = {}
ECB_FX_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"


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


def _number(value: Any, default: float = 0) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").replace("₹", "").strip())
        except ValueError:
            return default
    return default



def _inr_to_jpy_rate() -> tuple[float, str]:
    cached_at = _fx_cache.get("cached_at")
    if (
        cached_at
        and datetime.utcnow() - cached_at < _FX_TTL
        and _fx_cache.get("rate")
    ):
        return _fx_cache["rate"], _fx_cache["rate_date"]

    request = Request(
        ECB_FX_URL,
        headers={"User-Agent": "AI-Finance-Manager/1.0"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=15) as response:
            root = ElementTree.fromstring(response.read())
    except (HTTPError, URLError, TimeoutError, ElementTree.ParseError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not retrieve the INR/JPY reference rate from ECB",
        ) from exc

    rates: dict[str, float] = {}
    rate_date = ""
    for element in root.iter():
        currency = element.attrib.get("currency")
        rate = element.attrib.get("rate")
        if currency and rate:
            rates[currency] = float(rate)
        if element.attrib.get("time"):
            rate_date = element.attrib["time"]

    if "INR" not in rates or "JPY" not in rates:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ECB response did not contain INR and JPY rates",
        )

    # ECB rates are quoted as units per EUR. Cross-rate:
    # JPY/INR = (JPY/EUR) / (INR/EUR).
    inr_to_jpy = rates["JPY"] / rates["INR"]
    _fx_cache.update(
        rate=inr_to_jpy,
        rate_date=rate_date,
        cached_at=datetime.utcnow(),
    )
    return inr_to_jpy, rate_date

def _paytm_holdings(user_id: int) -> list[dict[str, Any]]:
    session = _session_for(user_id)
    read_token = session.get("read_access_token") or session.get("access_token")
    payload = _paytm_request(
        "GET",
        "/holdings/v1/get-user-holdings-data",
        token=read_token,
    )

    results = payload.get("data", {}).get("results", [])
    if not isinstance(results, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Paytm Money returned an unexpected holdings response",
        )
    return results


def _normalize_holding(item: dict[str, Any]) -> dict[str, Any]:
    # quantity represents the complete demat holding. remaining_quantity is the
    # currently available-to-sell portion and can exclude utilized/pledged units.
    quantity = _number(item.get("quantity"))
    cost_price = _number(item.get("cost_price"))
    last_price = _number(item.get("last_traded_price"))
    invested_value = quantity * cost_price
    current_value = quantity * last_price
    gain_loss = current_value - invested_value
    gain_loss_percentage = (
        gain_loss / invested_value * 100 if invested_value else 0
    )

    exchange = item.get("exchange")
    symbol = (
        item.get("nse_symbol")
        if exchange == "NSE"
        else item.get("bse_symbol")
    ) or item.get("nse_symbol") or item.get("bse_symbol")

    return {
        "name": item.get("display_name") or symbol or "Unknown security",
        "symbol": symbol,
        "exchange": exchange,
        "isin": item.get("isin_code"),
        "sector": item.get("sector"),
        "quantity": quantity,
        "available_quantity": _number(item.get("remaining_quantity")),
        "cost_price": round(cost_price, 4),
        "last_price": round(last_price, 4),
        "invested_value": round(invested_value, 2),
        "current_value": round(current_value, 2),
        "gain_loss": round(gain_loss, 2),
        "gain_loss_percentage": round(gain_loss_percentage, 2),
        "currency": "INR",
    }


def _portfolio(user_id: int) -> dict[str, Any]:
    holdings = [_normalize_holding(item) for item in _paytm_holdings(user_id)]
    total_invested = sum(item["invested_value"] for item in holdings)
    total_current = sum(item["current_value"] for item in holdings)
    total_gain_loss = total_current - total_invested

    fx_rate, fx_rate_date = _inr_to_jpy_rate()

    return {
        "broker": "Paytm Money",
        "currency": "INR",
        "base_currency": "JPY",
        "holding_count": len(holdings),
        "total_invested_value": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "total_gain_loss_percentage": round(
            total_gain_loss / total_invested * 100 if total_invested else 0,
            2,
        ),
        "inr_to_jpy_rate": round(fx_rate, 6),
        "fx_rate_date": fx_rate_date,
        "total_invested_value_jpy": round(total_invested * fx_rate, 2),
        "total_current_value_jpy": round(total_current * fx_rate, 2),
        "total_gain_loss_jpy": round(total_gain_loss * fx_rate, 2),
        "price_as_of": datetime.utcnow(),
        "holdings": holdings,
    }


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


@router.get("/callback", response_class=RedirectResponse)
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

    frontend_url = os.getenv(
        "PAYTM_MONEY_FRONTEND_URL",
        "http://localhost:3000",
    ).rstrip("/")
    return RedirectResponse(
        url=f"{frontend_url}?paytm=connected",
        status_code=status.HTTP_303_SEE_OTHER,
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
    return _portfolio(user_id)


@router.post("/sync")
def sync_paytm_equity(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    portfolio = _portfolio(user_id)
    current_value_inr = portfolio["total_current_value"]
    invested_value_inr = portfolio["total_invested_value"]
    current_value_jpy = portfolio["total_current_value_jpy"]
    invested_value_jpy = portfolio["total_invested_value_jpy"]

    asset = (
        db.query(WealthAsset)
        .filter(
            WealthAsset.user_id == user_id,
            WealthAsset.institution == "Paytm Money",
            WealthAsset.source_type == "api",
        )
        .first()
    )

    note = (
        f"Paytm Money: INR {current_value_inr:,.2f} current value; "
        f"INR {invested_value_inr:,.2f} invested; "
        f"converted at 1 INR = {portfolio['inr_to_jpy_rate']} JPY "
        f"(ECB {portfolio['fx_rate_date']}); "
        f"{portfolio['holding_count']} holdings synchronized "
        f"at {datetime.utcnow().isoformat()}Z"
    )

    if asset is None:
        asset = WealthAsset(
            user_id=user_id,
            category="Equity",
            asset_name="Paytm Money Equity Portfolio",
            institution="Paytm Money",
            currency="JPY",
            source_type="api",
            current_value=current_value_jpy,
            invested_value=invested_value_jpy,
            notes=note,
        )
        db.add(asset)
    else:
        asset.current_value = current_value_jpy
        asset.invested_value = invested_value_jpy
        asset.currency = "JPY"
        asset.notes = note
        asset.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(asset)
    create_or_update_snapshot(db, user_id)

    return {
        **portfolio,
        "asset_id": asset.id,
        "synced_at": datetime.utcnow(),
    }


@router.delete("/disconnect")
def disconnect_paytm(
    user_id: int = Depends(get_current_user_id),
):
    with _session_lock:
        removed = _user_sessions.pop(user_id, None) is not None
    return {"broker": "Paytm Money", "disconnected": removed}
