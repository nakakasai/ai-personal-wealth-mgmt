import csv
import io
from datetime import datetime, date
import os

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Upload, Transaction

from utils.categorizer import rule_based_category
from utils.ai_categorizer import ai_category
from utils.pdf_bank_parser import parse_smtrust_bank_pdf


router = APIRouter(prefix="/files", tags=["files"])

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
        uid = payload.get("user_id")
        if uid is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(uid)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def decode_csv_content(content: bytes) -> str:
    for enc in ("utf-8-sig", "cp932", "shift_jis", "utf-8"):
        try:
            return content.decode(enc)
        except Exception:
            pass

    raise HTTPException(status_code=400, detail="Unable to decode CSV")


def clean_amount(value: str) -> float:
    cleaned = (
        str(value)
        .replace(",", "")
        .replace('"', "")
        .replace("\\", "")
        .replace("¥", "")
        .strip()
    )
    return float(cleaned)


def is_aeon_csv(text: str) -> bool:
    return "ご利用日" in text and "ご利用先" in text


def is_amex_csv(text: str) -> bool:
    return (
        "ご利用日" in text
        and "データ処理日" in text
        and "ご利用内容" in text
        and "金額" in text
        and "換算レート" in text
    )


def is_orico_csv(text: str) -> bool:
    return (
        "<利用明細>" in text
        and "ご利用先など" in text
        and "ご利用金額" in text
        and "当月ご請求額" in text
    )


async def categorize_transaction(
    desc: str,
    note: str,
    db: Session,
    user_id: int,
):
    category = rule_based_category(
        description=desc,
        note=note,
        db=db,
        user_id=user_id,
    )

    if category is None:
        category = await ai_category(desc)

    return category or "Uncategorized"


async def parse_bank_pdf(content: bytes, upload_id: int, user_id: int, db: Session):
    rows = parse_smtrust_bank_pdf(io.BytesIO(content))

    total_rows = 0
    categorized_rows = 0
    uncategorized_rows = 0

    for row in rows:
        try:
            desc = row.get("description") or "Bank transaction"
            note = row.get("source") or "SMBC Trust Bank PDF"

            amount = float(row["amount"])

            if row.get("type") == "expense":
                amount = -abs(amount)
            else:
                amount = abs(amount)

            total_rows += 1

            category = await categorize_transaction(desc, note, db, user_id)

            if category == "Uncategorized":
                uncategorized_rows += 1
            else:
                categorized_rows += 1

            txn = Transaction(
                upload_id=upload_id,
                date=row["date"],
                description=desc,
                amount=amount,
                category=category,
            )
            db.add(txn)

        except Exception as e:
            print("Skipping BANK PDF row:", row, "Error:", e)

    return {
        "total_rows": total_rows,
        "categorized_rows": categorized_rows,
        "uncategorized_rows": uncategorized_rows,
    }


async def parse_amex_csv(text: str, upload_id: int, user_id: int, db: Session):
    reader = csv.DictReader(io.StringIO(text))

    total_rows = 0
    categorized_rows = 0
    uncategorized_rows = 0

    for row in reader:
        try:
            date_str = (row.get("ご利用日") or "").strip()
            desc = (row.get("ご利用内容") or "").strip()
            amount_str = (row.get("金額") or "").strip()

            if not date_str or not desc or not amount_str:
                continue

            amount_value = clean_amount(amount_str)

            if amount_value < 0:
                continue

            tx_date = datetime.strptime(date_str, "%Y/%m/%d").date()
            amount = -amount_value

            foreign_amount = (row.get("海外通貨利用金額") or "").strip()
            exchange_rate = (row.get("換算レート") or "").strip()

            note_parts = []
            if foreign_amount:
                note_parts.append(f"Foreign amount: {foreign_amount}")
            if exchange_rate:
                note_parts.append(f"Exchange rate: {exchange_rate}")

            note = " | ".join(note_parts)

            total_rows += 1

            category = await categorize_transaction(desc, note, db, user_id)

            if category == "Uncategorized":
                uncategorized_rows += 1
            else:
                categorized_rows += 1

            txn = Transaction(
                upload_id=upload_id,
                date=tx_date,
                description=desc,
                amount=amount,
                category=category,
            )
            db.add(txn)

        except Exception as e:
            print("Skipping AMEX row:", row, "Error:", e)

    return {
        "total_rows": total_rows,
        "categorized_rows": categorized_rows,
        "uncategorized_rows": uncategorized_rows,
    }


async def parse_orico_csv(text: str, upload_id: int, user_id: int, db: Session):
    reader = csv.reader(io.StringIO(text))
    in_details = False
    headers = []

    total_rows = 0
    categorized_rows = 0
    uncategorized_rows = 0

    for row in reader:
        if not row:
            continue

        first = (row[0] or "").strip()

        if first == "<利用明細>":
            in_details = True
            continue

        if in_details and first == "ご利用日":
            headers = row
            continue

        if not in_details or not headers:
            continue

        try:
            row_dict = {}
            for i, header in enumerate(headers):
                row_dict[header] = row[i] if i < len(row) else ""

            date_str = (row_dict.get("ご利用日") or "").strip()
            desc = (row_dict.get("ご利用先など") or "").strip()
            amount_str = (row_dict.get("ご利用金額") or "").strip()

            if not date_str or not desc or not amount_str:
                continue

            tx_date = datetime.strptime(date_str, "%Y年%m月%d日").date()
            amount_value = clean_amount(amount_str)

            if amount_value <= 0:
                continue

            amount = -amount_value

            note_parts = []

            payment_month = (row_dict.get("支払開始年月") or "").strip()
            payment_type = (row_dict.get("支払区分") or "").strip()
            user_name = (row_dict.get("ご利用者") or "").strip()
            current_bill = (row_dict.get("当月ご請求額") or "").strip()

            if payment_month:
                note_parts.append(f"Payment month: {payment_month}")
            if payment_type:
                note_parts.append(f"Payment type: {payment_type}")
            if user_name:
                note_parts.append(f"User: {user_name}")
            if current_bill:
                note_parts.append(f"Current bill: {current_bill}")

            note = " | ".join(note_parts)

            total_rows += 1

            category = await categorize_transaction(desc, note, db, user_id)

            if category == "Uncategorized":
                uncategorized_rows += 1
            else:
                categorized_rows += 1

            txn = Transaction(
                upload_id=upload_id,
                date=tx_date,
                description=desc,
                amount=amount,
                category=category,
            )
            db.add(txn)

        except Exception as e:
            print("Skipping ORICO row:", row, "Error:", e)

    return {
        "total_rows": total_rows,
        "categorized_rows": categorized_rows,
        "uncategorized_rows": uncategorized_rows,
    }


async def parse_aeon_csv(text: str, upload_id: int, user_id: int, db: Session):
    reader = csv.reader(io.StringIO(text))
    in_details = False

    total_rows = 0
    categorized_rows = 0
    uncategorized_rows = 0

    for row in reader:
        if not row:
            continue

        first = (row[0] or "").strip()

        if first == "ご利用日" and "ご利用先" in "".join(row):
            in_details = True
            continue

        if not in_details:
            continue

        if not first.isdigit() or len(first) != 6:
            continue

        try:
            yy = int(first[:2])
            mm = int(first[2:4])
            dd = int(first[4:6])
            tx_date = date(2000 + yy, mm, dd)

            store = row[2].strip() if len(row) > 2 and row[2] else ""
            note = row[7].strip() if len(row) > 7 and row[7] else ""
            desc = f"{store} / {note}" if note else store

            if len(row) < 7:
                continue

            amount_str = (row[6] or "").replace(",", "").strip()
            if not amount_str:
                continue

            amount = -float(amount_str)

            total_rows += 1

            category = await categorize_transaction(store or desc, note, db, user_id)

            if category == "Uncategorized":
                uncategorized_rows += 1
            else:
                categorized_rows += 1

            txn = Transaction(
                upload_id=upload_id,
                date=tx_date,
                description=desc,
                amount=amount,
                category=category,
            )
            db.add(txn)

        except Exception as e:
            print("Skipping AEON row:", row, "Error:", e)

    return {
        "total_rows": total_rows,
        "categorized_rows": categorized_rows,
        "uncategorized_rows": uncategorized_rows,
    }


async def parse_standard_csv(text: str, upload_id: int, user_id: int, db: Session):
    reader = csv.DictReader(io.StringIO(text))

    total_rows = 0
    categorized_rows = 0
    uncategorized_rows = 0

    for row in reader:
        try:
            tx_date = datetime.strptime(row["date"], "%Y-%m-%d").date()
            desc = (row.get("description") or "").strip()
            amount = float(row["amount"])

            total_rows += 1

            csv_cat = (row.get("category") or "").strip()

            if csv_cat:
                category = csv_cat
            else:
                category = await categorize_transaction(
                    desc,
                    row.get("note") or "",
                    db,
                    user_id,
                )

            if category == "Uncategorized":
                uncategorized_rows += 1
            else:
                categorized_rows += 1

            txn = Transaction(
                upload_id=upload_id,
                date=tx_date,
                description=desc,
                amount=amount,
                category=category,
            )
            db.add(txn)

        except Exception as e:
            print("Skipping standard row:", row, "Error:", e)

    return {
        "total_rows": total_rows,
        "categorized_rows": categorized_rows,
        "uncategorized_rows": uncategorized_rows,
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    statement_type: str = Form("AEON"),
    db: Session = Depends(get_db),
    token: str = "",
):
    user_id = get_current_user_id(token)

    content = await file.read()
    filename = (file.filename or "").lower()

    statement_type = statement_type.upper().strip()

    upload = Upload(user_id=user_id)
    db.add(upload)
    db.commit()
    db.refresh(upload)

    try:
        if filename.endswith(".pdf") or statement_type in ("BANK_PDF", "SMTRUST", "SMBC_TRUST"):
            stats = await parse_bank_pdf(content, upload.id, user_id, db)
            statement_type = "BANK_PDF"

        else:
            text = decode_csv_content(content)

            if statement_type == "AMEX":
                if not is_amex_csv(text):
                    raise HTTPException(
                        status_code=400,
                        detail="Selected AMEX, but CSV format does not look like AMEX.",
                    )
                stats = await parse_amex_csv(text, upload.id, user_id, db)

            elif statement_type == "AEON":
                if not is_aeon_csv(text):
                    raise HTTPException(
                        status_code=400,
                        detail="Selected AEON, but CSV format does not look like AEON.",
                    )
                stats = await parse_aeon_csv(text, upload.id, user_id, db)

            elif statement_type == "ORICO":
                if not is_orico_csv(text):
                    raise HTTPException(
                        status_code=400,
                        detail="Selected ORICO, but CSV format does not look like ORICO.",
                    )
                stats = await parse_orico_csv(text, upload.id, user_id, db)

            elif statement_type == "OTHERS":
                stats = await parse_standard_csv(text, upload.id, user_id, db)

            else:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported statement type. Please select AEON, AMEX, ORICO, Others, or Bank PDF.",
                )

        db.commit()

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()
        print("Upload failed:", e)
        raise HTTPException(status_code=500, detail="File processing failed")

    return {
        "message": "File processed",
        "statement_type": statement_type,
        "upload_id": upload.id,
        "stats": stats,
    }