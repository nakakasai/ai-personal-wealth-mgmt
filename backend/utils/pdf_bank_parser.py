import re
from datetime import date
from typing import BinaryIO

import pdfplumber


DATE_RE = re.compile(r"(\d{4})年(\d{2})月(\d{2})日")
AMOUNT_RE = re.compile(r"^\d{1,3}(,\d{3})*円$")


def _amount_to_int(value: str | None) -> int | None:
    if not value:
        return None

    cleaned = (
        value.replace(",", "")
        .replace("円", "")
        .replace("¥", "")
        .strip()
    )

    if not cleaned.isdigit():
        return None

    return int(cleaned)


def parse_smtrust_bank_pdf(file_obj: BinaryIO) -> list[dict]:
    transactions: list[dict] = []

    with pdfplumber.open(file_obj) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = text.splitlines()

            for line in lines:
                line = line.strip()

                match = DATE_RE.search(line)
                if not match:
                    continue

                year, month, day = map(int, match.groups())
                tx_date = date(year, month, day)

                # Remove date from line
                rest = DATE_RE.sub("", line).strip()
                parts = rest.split()

                amount_positions = []
                for idx, part in enumerate(parts):
                    if AMOUNT_RE.match(part):
                        amount_positions.append(idx)

                if len(amount_positions) < 2:
                    continue

                first_amount_idx = amount_positions[0]
                second_amount_idx = amount_positions[1]

                first_amount = _amount_to_int(parts[first_amount_idx])
                second_amount = _amount_to_int(parts[second_amount_idx])

                if first_amount is None or second_amount is None:
                    continue

                description_parts = parts[second_amount_idx + 1 :]
                description = " ".join(description_parts).strip() or "Bank transaction"

                # In this SMBC Trust format:
                # - If line has 2 amounts, first amount is transaction amount
                # - second amount is balance
                # - Whether it is withdrawal or deposit must be inferred from layout.
                #
                # pdf text alone does not preserve column positions reliably,
                # so we use x-position from words below for accurate debit/credit.
                transactions.append(
                    {
                        "date": tx_date,
                        "description": description,
                        "amount": first_amount,
                        "balance": second_amount,
                        "type": "unknown",
                        "source": "SMBC Trust Bank PDF",
                    }
                )

    return _fix_debit_credit_using_words(file_obj, transactions)


def _fix_debit_credit_using_words(file_obj: BinaryIO, fallback_rows: list[dict]) -> list[dict]:
    fixed_rows: list[dict] = []

    try:
        file_obj.seek(0)

        with pdfplumber.open(file_obj) as pdf:
            for page in pdf.pages:
                words = page.extract_words(
                    x_tolerance=2,
                    y_tolerance=3,
                    keep_blank_chars=False,
                    use_text_flow=False,
                )

                rows = {}
                for w in words:
                    y = round(w["top"] / 4) * 4
                    rows.setdefault(y, []).append(w)

                for _, row_words in sorted(rows.items()):
                    row_words = sorted(row_words, key=lambda w: w["x0"])
                    texts = [w["text"] for w in row_words]
                    joined = " ".join(texts)

                    match = DATE_RE.search(joined)
                    if not match:
                        continue

                    year, month, day = map(int, match.groups())
                    tx_date = date(year, month, day)

                    amount_words = [
                        w for w in row_words if AMOUNT_RE.match(w["text"])
                    ]

                    if len(amount_words) < 2:
                        continue

                    txn_amount_word = amount_words[0]
                    balance_word = amount_words[1]

                    txn_amount = _amount_to_int(txn_amount_word["text"])
                    balance = _amount_to_int(balance_word["text"])

                    if txn_amount is None or balance is None:
                        continue

                    # Column x-position based on this PDF layout:
                    # Withdrawal column is around x=150–230
                    # Deposit column is around x=260–350
                    x = txn_amount_word["x0"]

                    if x < 250:
                        tx_type = "expense"
                    else:
                        tx_type = "income"

                    desc_words = [
                        w["text"]
                        for w in row_words
                        if w["x0"] > balance_word["x1"] + 5
                    ]
                    description = " ".join(desc_words).strip() or "Bank transaction"

                    fixed_rows.append(
                        {
                            "date": tx_date,
                            "description": description,
                            "amount": txn_amount,
                            "type": tx_type,
                            "withdrawal": txn_amount if tx_type == "expense" else None,
                            "deposit": txn_amount if tx_type == "income" else None,
                            "balance": balance,
                            "source": "SMBC Trust Bank PDF",
                        }
                    )

        return fixed_rows

    except Exception as e:
        print("PDF word-position parsing failed. Using fallback parser.", e)
        return fallback_rows