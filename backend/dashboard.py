from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date
from jose import jwt, JWTError
import os
from typing import Optional
from pydantic import BaseModel

from database import SessionLocal
from models import Upload, Transaction

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")


SOURCE_ALL = "ALL"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_id(token: str) -> int:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(user_id)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def normalize_source(source: Optional[str]) -> Optional[str]:
    if not source:
        return None

    source = source.upper().strip()

    if source in ("", SOURCE_ALL):
        return None

    if source in ("BANK_PDF", "SMTRUST", "SMBC_TRUST_PDF"):
        return "SMBC_TRUST"

    return source


def get_month_range(month_str: Optional[str]):
    if not month_str:
        today = date.today()
        start = date(today.year, today.month, 1)
    elif month_str.upper() == "ALL":
        return None, None
    else:
        year, month = map(int, month_str.split("-"))
        start = date(year, month, 1)

    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)

    return start, end


def apply_common_filters(q, start_date, end_date, source: Optional[str]):
    if start_date and end_date:
        q = q.filter(Transaction.date >= start_date, Transaction.date < end_date)

    normalized_source = normalize_source(source)
    if normalized_source:
        q = q.filter(Transaction.source == normalized_source)

    return q


@router.get("/overview")
def get_overview(
    token: str = "",
    month: Optional[str] = Query(
        None,
        description="Format YYYY-MM, or 'ALL' for all data, or empty for current month",
    ),
    source: Optional[str] = Query(
        None,
        description="Transaction source/account: ALL, AEON, AMEX, ORICO, SMBC_TRUST, OTHERS",
    ),
    db: Session = Depends(get_db),
):
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    user_id = get_current_user_id(token)
    start_date, end_date = get_month_range(month)

    q = (
        db.query(Transaction)
        .join(Upload, Transaction.upload_id == Upload.id)
        .filter(Upload.user_id == user_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )

    q = apply_common_filters(q, start_date, end_date, source)

    txns = q.all()

    total_income = 0.0
    total_expense = 0.0
    categories: dict[str, float] = {}

    for t in txns:
        amount = float(t.amount or 0)

        if amount > 0:
            total_income += amount
        else:
            total_expense += -amount

        cat = t.category or "Uncategorized"
        if amount < 0:
            categories[cat] = categories.get(cat, 0.0) + (-amount)

    net = total_income - total_expense

    category_list = [
        {"category": cat, "amount": round(amt, 2)}
        for cat, amt in sorted(categories.items(), key=lambda x: x[1], reverse=True)
    ]

    recent = [
        {
            "id": t.id,
            "date": t.date.isoformat() if t.date else None,
            "description": t.description,
            "amount": float(t.amount or 0),
            "category": t.category,
            "source": t.source or "UNKNOWN",
        }
        for t in txns
    ]

    if month is None:
        month_label = "This Month"
    elif month.upper() == "ALL":
        month_label = "All Data"
    else:
        month_label = month

    selected_source = normalize_source(source) or SOURCE_ALL

    return {
        "month": month_label,
        "source": selected_source,
        "income": round(total_income, 2),
        "expense": round(total_expense, 2),
        "net": round(net, 2),
        "categories": category_list,
        "recent_transactions": recent,
    }


class InsightsRequest(BaseModel):
    month: Optional[str] = None
    source: Optional[str] = None


@router.post("/insights")
def get_insights(
    payload: InsightsRequest,
    token: str = "",
    db: Session = Depends(get_db),
):
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    user_id = get_current_user_id(token)
    start_date, end_date = get_month_range(payload.month)

    q = (
        db.query(Transaction)
        .join(Upload, Transaction.upload_id == Upload.id)
        .filter(Upload.user_id == user_id)
    )

    q = apply_common_filters(q, start_date, end_date, payload.source)

    txns = q.all()

    if not txns:
        return {
            "insights": "No transactions found for this period/account. Try selecting All Accounts or uploading a statement."
        }

    total_income = 0.0
    total_expense = 0.0
    categories: dict[str, float] = {}
    days: set[date] = set()

    for t in txns:
        amount = float(t.amount or 0)

        if t.date:
            days.add(t.date)

        if amount > 0:
            total_income += amount
        else:
            total_expense += -amount

        cat = t.category or "Uncategorized"
        if amount < 0:
            categories[cat] = categories.get(cat, 0.0) + (-amount)

    net = total_income - total_expense
    num_days = max(len(days), 1)
    avg_daily_spend = total_expense / num_days

    top_cat = None
    top_cat_value = 0.0
    if categories:
        top_cat, top_cat_value = max(categories.items(), key=lambda x: x[1])

    period_label = (
        "this month"
        if payload.month is None
        else ("all time" if payload.month.upper() == "ALL" else payload.month)
    )

    selected_source = normalize_source(payload.source)
    account_label = "all accounts"

    if selected_source == "AEON":
        account_label = "AEON Card"
    elif selected_source == "AMEX":
        account_label = "American Express"
    elif selected_source == "ORICO":
        account_label = "Orico Card"
    elif selected_source == "SMBC_TRUST":
        account_label = "SMBC Trust Bank"
    elif selected_source == "OTHERS":
        account_label = "Other statements"

    lines = []

    lines.append(
        f"For {period_label} across {account_label}, your total income is approximately ¥ {total_income:,.0f} and your total expenses are around ¥ {total_expense:,.0f}."
    )

    if net >= 0:
        lines.append(
            f"That means you are saving about ¥ {net:,.0f} over this period, which is positive."
        )
    else:
        lines.append(
            f"That means you are overspending by about ¥ {abs(net):,.0f} over this period."
        )

    if top_cat:
        lines.append(
            f"Your highest spending category is **{top_cat}**, with about ¥ {top_cat_value:,.0f} spent."
        )

    lines.append(
        f"On average, you are spending roughly ¥ {avg_daily_spend:,.0f} per active day."
    )

    if categories and len(categories) > 1:
        lines.append(
            "You may want to review high-spend categories and separate recurring expenses from one-off expenses."
        )

    if net < 0 and total_income > 0:
        overspend_pct = (abs(net) / total_income) * 100
        lines.append(
            f"Your overspending is about {overspend_pct:.1f}% of your income in this period."
        )

    lines.append(
        "As a next step, compare accounts separately to understand whether spending is concentrated on credit cards, bank transfers, or cash withdrawals."
    )

    return {"insights": " ".join(lines)}


@router.get("/category-transactions")
def get_category_transactions(
    category: str = Query(..., description="Category name, e.g. 'Food'"),
    token: str = "",
    month: Optional[str] = Query(
        None,
        description="Same as /overview: YYYY-MM | 'ALL' | empty for current month",
    ),
    source: Optional[str] = Query(
        None,
        description="Transaction source/account: ALL, AEON, AMEX, ORICO, SMBC_TRUST, OTHERS",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    user_id = get_current_user_id(token)
    start_date, end_date = get_month_range(month)

    base_q = (
        db.query(Transaction)
        .join(Upload, Transaction.upload_id == Upload.id)
        .filter(Upload.user_id == user_id)
        .filter(Transaction.category == category)
    )

    base_q = apply_common_filters(base_q, start_date, end_date, source)

    total = base_q.count()

    txns = (
        base_q.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = [
        {
            "id": t.id,
            "date": t.date.isoformat() if t.date else None,
            "description": t.description,
            "amount": float(t.amount or 0),
            "category": t.category,
            "source": t.source or "UNKNOWN",
        }
        for t in txns
    ]

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "category": category,
        "month": month,
        "source": normalize_source(source) or SOURCE_ALL,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }