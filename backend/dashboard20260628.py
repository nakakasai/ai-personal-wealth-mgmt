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


def get_month_range(month_str: Optional[str]):
    """
    month_str:
      - None  => use current month
      - 'ALL' => no date filter
      - 'YYYY-MM' => specific month
    """
    if not month_str:
        # default: current month
        today = date.today()
        start = date(today.year, today.month, 1)
    elif month_str.upper() == "ALL":
        return None, None
    else:
        year, month = map(int, month_str.split("-"))
        start = date(year, month, 1)

    # compute end
    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)

    return start, end


@router.get("/overview")
def get_overview(
    token: str = "",
    month: Optional[str] = Query(
        None,
        description="Format YYYY-MM, or 'ALL' for all data, or empty for current month",
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

    # apply date filter only if we have a range
    if start_date and end_date:
        q = q.filter(Transaction.date >= start_date, Transaction.date < end_date)

    txns = q.all()

    total_income = 0.0
    total_expense = 0.0
    categories: dict[str, float] = {}

    for t in txns:
        amount = float(t.amount or 0)
        if amount > 0:
            total_income += amount
        else:
            total_expense += -amount  # positive for display

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
            "date": t.date.isoformat() if t.date else None,
            "description": t.description,
            "amount": float(t.amount or 0),
            "category": t.category,
        }
        #for t in txns[:10] 
        for t in txns # All transactions 
    ]

    # month label for UI
    if month is None:
        month_label = "This Month"
    elif month.upper() == "ALL":
        month_label = "All Data"
    else:
        month_label = month

    return {
        "month": month_label,
        "income": round(total_income, 2),
        "expense": round(total_expense, 2),
        "net": round(net, 2),
        "categories": category_list,
        "recent_transactions": recent,
    }


# ---------- AI-style INSIGHTS (rule-based for now) ----------

class InsightsRequest(BaseModel):
    month: Optional[str] = None  # "YYYY-MM" | "ALL" | None


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

    if start_date and end_date:
        q = q.filter(Transaction.date >= start_date, Transaction.date < end_date)

    txns = q.all()

    if not txns:
        return {
            "insights": "No transactions found for this period. Try uploading a CSV or selecting 'All' to see overall trends."
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

    # top spending category
    top_cat = None
    top_cat_value = 0.0
    if categories:
        top_cat, top_cat_value = max(categories.items(), key=lambda x: x[1])

    # build a human-friendly summary
    period_label = (
        "this month"
        if payload.month is None
        else ("all time" if payload.month.upper() == "ALL" else payload.month)
    )

    lines = []

    lines.append(
        f"For {period_label}, your total income is approximately ₹ {total_income:,.0f} and your total expenses are around ₹ {total_expense:,.0f}."
    )
    if net >= 0:
        lines.append(
            f"That means you are saving about ₹ {net:,.0f} over this period, which is positive."
        )
    else:
        lines.append(
            f"That means you are overspending by about ₹ {abs(net):,.0f} over this period."
        )

    if top_cat:
        lines.append(
            f"Your highest spending category is **{top_cat}**, with about ₹ {top_cat_value:,.0f} spent."
        )

    lines.append(
        f"On average, you are spending roughly ₹ {avg_daily_spend:,.0f} per active day (days with at least one transaction)."
    )

    if categories and len(categories) > 1:
        lines.append("You might want to review categories with high spend to see where you can cut back, especially non-essential ones like shopping, eating out, or entertainment.")

    if net < 0 and total_income > 0:
        overspend_pct = (abs(net) / total_income) * 100
        lines.append(
            f"Your overspending is about {overspend_pct:.1f}% of your income in this period. Consider setting a monthly budget target and tracking against it."
        )

    lines.append(
        "As a next step, you could: (1) set category-wise budgets, (2) compare this period with the previous month, or (3) tag one-off big expenses to separate them from recurring costs."
    )

    return {"insights": " ".join(lines)}


# ---------- NEW: transactions by category with pagination ----------

@router.get("/category-transactions")
def get_category_transactions(
    category: str = Query(..., description="Category name, e.g. 'Food'"),
    token: str = "",
    month: Optional[str] = Query(
        None,
        description="Same as /overview: YYYY-MM | 'ALL' | empty for current month",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Return paginated transactions for a given category for the logged-in user.

    This respects the same month filter logic as /dashboard/overview.
    """
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

    if start_date and end_date:
        base_q = base_q.filter(
            Transaction.date >= start_date,
            Transaction.date < end_date,
        )

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
        }
        for t in txns
    ]

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "category": category,
        "month": month,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
