"""Turn printed text into typed values. Deterministic and unit-tested; the model copies text as
printed and never normalises (TDD §5.2)."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

# Countries whose documents print 1.234,56 or 1 234,56 (TDD A14).
DECIMAL_COMMA = {
    "sweden",
    "germany",
    "france",
    "italy",
    "spain",
    "netherlands",
    "belgium",
    "austria",
    "denmark",
    "norway",
    "finland",
    "poland",
    "brazil",
    "turkey",
    "indonesia",
}

# Units, package words and currency marks around a number: "3,165.00 KGS", "360 BUNDLES", "€ 42,50".
_NON_NUMERIC = re.compile(r"[A-Za-z]+\.?|[$€₹¥£]")


def parse_number(raw: str, country: str | None = None) -> Decimal:
    """'3,165.00 KGS' → 3165.00; '7 650,00' (Sweden) → 7650.00; '1.380,00' → 1380.00."""
    s = _NON_NUMERIC.sub("", raw).strip().replace(" ", " ").replace("'", "")
    s = re.sub(r"\s+", " ", s)
    if not re.search(r"\d", s):
        raise ValueError(f"no digits in {raw!r}")
    s = s.replace(" ", "")
    neg = s.startswith("-") or (s.startswith("(") and s.endswith(")"))
    s = s.strip("-()")
    comma_decimal = (country or "").lower() in DECIMAL_COMMA
    if "," in s and "." in s:
        # Whichever separator comes last is the decimal mark.
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        head, _, tail = s.rpartition(",")
        if s.count(",") == 1 and (comma_decimal or len(tail) != 3):
            s = f"{head.replace(',', '')}.{tail}"
        else:
            s = s.replace(",", "")
    elif "." in s and s.count(".") > 1:
        s = s.replace(".", "")  # 1.234.567 thousands dots
    elif "." in s and comma_decimal and len(s.rpartition(".")[2]) == 3:
        s = s.replace(".", "")  # German 2.400 = two thousand four hundred
    try:
        v = Decimal(s)
    except InvalidOperation as e:
        raise ValueError(f"not a number: {raw!r}") from e
    return -v if neg else v


_MONTHS = {
    m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), start=1)
}


def parse_date(raw: str, country: str | None = None) -> date:
    """ISO, dd.mm.yyyy, dd/mm/yyyy (month-first only for US suppliers, TDD A15), 'Oct. 08, 2026',
    '08 Oct 2026'."""
    s = raw.strip()
    if m := re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s):
        return date(int(m[1]), int(m[2]), int(m[3]))
    if m := re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", s):
        a, b, y = int(m[1]), int(m[2]), int(m[3])
        if (country or "").lower() in {"united states", "usa", "us"}:
            a, b = b, a
        return date(y, b, a)
    if m := re.fullmatch(r"([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})", s):
        return date(int(m[3]), _MONTHS[m[1].lower()], int(m[2]))
    if m := re.fullmatch(r"(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*\.?[\s-]+(\d{4})", s):
        return date(int(m[3]), _MONTHS[m[2].lower()], int(m[1]))
    raise ValueError(f"unrecognised date: {raw!r}")


def normalize_container(raw: str) -> str:
    return re.sub(r"[\s\-/.]", "", raw).upper()


def split_list(raw: str) -> list[str]:
    return [p.strip() for p in re.split(r"[;,\n]+", raw) if p.strip()]


_LEGAL_SUFFIX = {
    "co",
    "company",
    "corp",
    "corporation",
    "ltd",
    "limited",
    "pvt",
    "private",
    "llc",
    "inc",
    "gmbh",
    "ab",
    "jsc",
    "plc",
    "sa",
    "spa",
    "bv",
    "joint",
    "stock",
}


def normalize_party(raw: str) -> str:
    """Lowercase, drop punctuation, and strip legal-form words from the end only, so
    'Company E Lighting Pvt. Ltd.' and 'COMPANY E LIGHTING PRIVATE LIMITED' compare equal."""
    words = re.sub(r"[^\w\s]", " ", raw.lower().replace("&", " and ")).split()
    while words and words[-1] in _LEGAL_SUFFIX:
        words.pop()
    return " ".join(words)
