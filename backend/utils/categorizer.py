# categorizer.py

import re
import unicodedata
from sqlalchemy.orm import Session
from models import CategoryRule

# Convert small Katakana to regular Katakana so
# ファミリー and フアミリ- normalize the same way.
_SMALL_TO_BIG_KATAKANA = str.maketrans({
    "ァ": "ア",
    "ィ": "イ",
    "ゥ": "ウ",
    "ェ": "エ",
    "ォ": "オ",
    "ッ": "ツ",
    "ャ": "ヤ",
    "ュ": "ユ",
    "ョ": "ヨ",
    "ヮ": "ワ",
    "ヵ": "カ",
    "ヶ": "ケ",
})

# Rows that are not actual transactions
IGNORE_PATTERNS = [
    r"^支払回数$",
    r"^\d+回$",
    r"^ご利用明細$",
    r"^今回ご請求金額$",
]

# Order matters: more specific rules first
BASIC_RULES = [
    # ----------------------------
    # Utilities / recurring bills
    # ----------------------------
    (r"ラクテンモバイル|楽天モバイル", "Utilities"),
    (r"シ-デイ-エナジ-|cdenergy|シーディーエナジー", "Utilities"),
    (r"東京都水道局|水道", "Utilities"),
    (r"softbank|ソフトバンク", "Utilities"),
    (r"docomo|ドコモ", "Utilities"),
    (r"\bau\b", "Utilities"),
    (r"ガス|電気|tepco|東京電力", "Utilities"),

    # ----------------------------
    # Transport
    # ----------------------------
    (r"etc|etc利用分", "Transport"),
    (r"東関東道|首都高|湾岸|用賀|一之江|葛西|市川|新横浜", "Transport"),
    (r"ウ-バ-トリツプ|ubertrip|ubertrip\d+", "Transport"),
    (r"taxi|タクシ", "Transport"),
    (r"タイムズ|times", "Transport"),
    (r"ナビパ-ク|ナビパーク", "Transport"),
    (r"parking|駐車場|トキビルダイニチユウシヤジヨウ", "Transport"),
    (r"eneos|eneos-ss|出光|コスモ", "Transport"),
    (r"モリビルカンレンシセツ", "Transport"),


    # ----------------------------
    # Food / convenience / grocery
    # ----------------------------
    (r"セブン|7-?eleven|seveneleven", "Food"),
    (r"ロ-ソン|lawson", "Food"),
    (r"フアミリ-マ-ト|familymart|フアミマ", "Food"),
    (r"ubereats|uber.*eats", "Food"),
    (r"マクドナルド|ケンタツキ-|スタ-バツクス|ドト-ル|モスバ-ガ-|すき家|吉野家|松屋", "Food"),
    (r"ムンバイパレス|クルマヤラ-メン", "Food"),
    (r"ダイエ-|myb|マイバスケツト|イナゲヤ|co-op|coop|コ-プ", "Food"),

    # ----------------------------
    # Shopping
    # ----------------------------
    (r"amazon", "Shopping"),
    (r"rakuten|楽天", "Shopping"),
    (r"ヨドバシ|ビツクカメラ", "Shopping"),
    (r"ユニクロ|uniqlo", "Shopping"),
    (r"ドンキ|ドンキホ-テ", "Shopping"),
    (r"applecombill|apple", "Shopping"),
    (r"googleplay", "Shopping"),
    (r"スポ-ツデポ", "Shopping"),
    (r"kingpowerduty", "Shopping"),

    # ----------------------------
    # Entertainment / subscriptions
    # ----------------------------
    (r"netflix|ネツトフリツクス|ネットフリックス", "Entertainment"),
    (r"spotify", "Entertainment"),
    (r"youtubepremium", "Entertainment"),
    (r"expressvpn", "Entertainment"),
    (r"hulu|disney\+|u-next|linkedin", "Entertainment"),

    # ----------------------------
    # Fitness
    # ----------------------------
    (r"コナミスポ-ツクラブ|gym|fitness", "Fitness"),

    # ----------------------------
    # Health
    # ----------------------------
    (r"hospital|clinic|pharmacy|病院|医院|クリニツク|薬局", "Health"),
    (r"マツモトキヨシ|ウエルシア|スギ薬局|ジユンテンドウ", "Health"),

    # ----------------------------
    # Travel
    # ----------------------------
    (r"エ-エヌエ-|ana|jal", "Travel"),
    (r"bookingcom|ブツキングドツトコム|agoda|expedia", "Travel"),
    (r"hotel|ホテル|holidayinn|novotel", "Travel"),
    (r"空港|成田空港|羽田空港", "Travel"),
    (r"pilatus|bahnen|edelweiss|lugano|kriens", "Travel"),

    # ----------------------------
    # Insurance
    # ----------------------------
    (r"損害保険|生命保険|保険", "Insurance"),
    (r"ワランテイ|warranty", "Insurance"),

    # ----------------------------
    # Personal care
    # ----------------------------
    (r"チヨキペタ|orange pop|オレンジポツプ|ヘア|美容|理容", "Personal Care"),

    # ----------------------------
    # Education / exam
    # ----------------------------
    (r"日本語能力試験|ニホンゴノウリヨクシケン", "Education"),
]


def normalize(text: str) -> str:
    """
    Normalize merchant / description text for robust matching.
    """
    if not text:
        return ""

    text = str(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_SMALL_TO_BIG_KATAKANA)
    text = text.lower().strip()

    # remove normal + full-width spaces
    text = re.sub(r"[\s\u3000]+", "", text)

    # normalize dash variants
    text = text.replace("ー", "-").replace("－", "-").replace("―", "-")

    # remove separators / punctuation often seen in statement data
    text = re.sub(r"[／/＊*・,().＿_]+", "", text)

    return text


def is_ignorable_row(description: str) -> bool:
    desc = normalize(description)
    return any(re.search(pattern, desc) for pattern in IGNORE_PATTERNS)


def _match_user_rules(text: str, db: Session, user_id: int):
    """
    User-learned rules take priority over basic rules.
    Assumes CategoryRule has at least:
    - keyword
    - category
    Optional:
    - rule_type: contains / exact / regex
    - priority
    """
    learned_rules = (
        db.query(CategoryRule)
        .filter(CategoryRule.user_id == user_id)
        .all()
    )

    # sort by priority first if present, then longer keyword first
    learned_rules = sorted(
        learned_rules,
        key=lambda r: (
            -(getattr(r, "priority", 0) or 0),
            -len(normalize(getattr(r, "keyword", "") or "")),
        ),
    )

    for rule in learned_rules:
        keyword_raw = getattr(rule, "keyword", "") or ""
        category = getattr(rule, "category", None)
        rule_type = (getattr(rule, "rule_type", "contains") or "contains").lower()

        if not category or not keyword_raw:
            continue

        keyword = normalize(keyword_raw)

        try:
            if rule_type == "exact":
                if text == keyword:
                    return category

            elif rule_type == "regex":
                # for regex, use normalized keyword_raw as-is if user intentionally saved regex
                if re.search(keyword_raw, text, flags=re.IGNORECASE):
                    return category

            else:  # contains
                if keyword in text:
                    return category

        except re.error:
            # skip broken regex rule rather than failing categorization
            continue

    return None


def rule_based_category(
    description: str,
    db: Session,
    user_id: int,
    note: str | None = None,
):
    """
    Returns category string if matched, else None.

    Matching priority:
    1. Ignore non-transaction rows
    2. User-learned rules
    3. Built-in regex rules
    4. None -> caller can send to AI fallback
    """
    if not description:
        return None

    desc = normalize(description)
    note_text = normalize(note or "")

    if not desc or is_ignorable_row(desc):
        return None

    # combine description + note so things like ETC in 備考 can be matched
    full_text = f"{desc} {note_text}".strip()

    # 1. USER-LEARNED RULES
    learned_category = _match_user_rules(full_text, db, user_id)
    if learned_category:
        return learned_category

    # 2. BASIC RULES
    for pattern, category in BASIC_RULES:
        if re.search(pattern, full_text):
            return category

    # 3. No rule matched
    return None