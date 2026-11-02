"""Format validators. A failing validator caps a field's confidence (TDD §5.3)."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from app.extraction.normalize import (
    normalize_container,
    parse_date,
    parse_number,
    split_list,
)

CURRENCIES = {
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CNY",
    "INR",
    "AED",
    "SGD",
    "CHF",
    "SEK",
    "NOK",
    "DKK",
    "AUD",
    "CAD",
    "HKD",
    "KRW",
    "THB",
    "VND",
    "MYR",
    "IDR",
}
INCOTERMS_2020 = {"EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"}


def iso6346_ok(container: str) -> bool:
    c = normalize_container(container)
    if len(c) != 11 or not (c[:4].isalpha() and c[4:].isdigit()) or c[3] not in "UJZ":
        return False
    values: dict[str, int] = {}
    n = 10
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if n % 11 == 0:
            n += 1
        values[ch] = n
        n += 1
    values.update({str(d): d for d in range(10)})
    total = sum(values[ch] * (2**i) for i, ch in enumerate(c[:10]))
    return total % 11 % 10 == int(c[10])


def normalize_and_validate(
    kind: str, raw: str | None, country: str | None = None, today: date | None = None
) -> tuple[Any, list[str]]:
    """Return (normalised JSON-able value or None, list of validator error codes)."""
    if raw is None or not raw.strip():
        return None, []
    raw = raw.strip()
    today = today or date.today()
    try:
        match kind:
            case "money" | "number":
                v = parse_number(raw, country)
                errs = ["not_positive"] if v <= 0 else []
                return str(v.quantize(Decimal("0.01"))), errs
            case "int":
                v = parse_number(raw, country)
                if v != v.to_integral_value():
                    return str(v), ["not_whole_number"]
                return int(v), ([] if v > 0 else ["not_positive"])
            case "date":
                d = parse_date(raw, country)
                errs = []
                if d > today:
                    errs.append("date_in_future")
                if d < today - timedelta(days=730):
                    errs.append("date_too_old")  # PRD A7
                return d.isoformat(), errs
            case "currency":
                code = raw.upper().replace("RMB", "CNY")
                return code, ([] if code in CURRENCIES else ["unknown_currency"])
            case "incoterm":
                code = raw.upper().split()[0]
                return code, ([] if code in INCOTERMS_2020 else ["unknown_incoterm"])
            case "hsn":
                digits = "".join(ch for ch in raw if ch.isdigit())
                return digits, ([] if len(digits) == 8 else ["hsn_not_8_digits"])
            case "containers":
                items = [normalize_container(c) for c in split_list(raw)]
                bad = [c for c in items if not iso6346_ok(c)]
                return items, (["container_check_digit"] if bad else [])
            case "country":
                return " ".join(w.capitalize() for w in raw.split()), []
            case "text":
                return raw, []
    except (ValueError, KeyError):
        return None, ["unparseable"]
    return raw, []
