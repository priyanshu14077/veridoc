from datetime import date
from decimal import Decimal

import pytest

from app.extraction.confidence import score
from app.extraction.normalize import normalize_party, parse_date, parse_number
from app.extraction.validators import iso6346_ok, normalize_and_validate


@pytest.mark.parametrize(
    ("raw", "country", "expected"),
    [
        ("3,165.00 KGS", "China", "3165.00"),
        ("16,320.00", None, "16320.00"),
        ("USD 16,320.00", None, "16320.00"),
        ("7 650,00", "Sweden", "7650.00"),
        ("1.380,00", "Germany", "1380.00"),
        ("42,50", "Sweden", "42.50"),
        ("2.400", "Germany", "2400"),  # German thousands dot
        ("2,400", "China", "2400"),  # thousands comma
        ("6.80", "China", "6.80"),
        ("1.234.567", None, "1234567"),
        ("(12.50)", None, "-12.50"),
        ("360 BUNDLES", None, "360"),
        ("80 ROLLS", None, "80"),
        ("€ 42,50", "Germany", "42.50"),
    ],
)
def test_parse_number(raw: str, country: str | None, expected: str) -> None:
    assert parse_number(raw, country) == Decimal(expected)


def test_parse_number_rejects_text() -> None:
    with pytest.raises(ValueError):
        parse_number("N/A")


@pytest.mark.parametrize(
    ("raw", "country", "expected"),
    [
        ("2026-10-08", None, date(2026, 10, 8)),
        ("09.10.2026", "Germany", date(2026, 10, 9)),
        ("02/10/2026", "Vietnam", date(2026, 10, 2)),  # day-first
        ("10/02/2026", "United States", date(2026, 10, 2)),  # month-first only for the US
        ("Oct. 08, 2026", "China", date(2026, 10, 8)),
        ("8 October 2026", None, date(2026, 10, 8)),
    ],
)
def test_parse_date(raw: str, country: str | None, expected: date) -> None:
    assert parse_date(raw, country) == expected


def test_iso6346_check_digit() -> None:
    assert iso6346_ok("CSQU3054383")  # the standard's worked example
    assert iso6346_ok("CSQU 305438-3")
    assert not iso6346_ok("CSQU3054384")
    assert not iso6346_ok("CSQ3054383")


TODAY = date(2026, 11, 2)


@pytest.mark.parametrize(
    ("kind", "raw", "norm", "errs"),
    [
        ("hsn", "9405.42.90", "94054290", []),
        ("hsn", "940542", "940542", ["hsn_not_8_digits"]),
        ("currency", "usd", "USD", []),
        ("currency", "RMB", "CNY", []),
        ("currency", "DOLLARS", "DOLLARS", ["unknown_currency"]),
        ("incoterm", "FOB Shenzhen", "FOB", []),
        ("incoterm", "FOO", "FOO", ["unknown_incoterm"]),
        ("date", "2026-12-01", "2026-12-01", ["date_in_future"]),
        ("date", "2023-01-01", "2023-01-01", ["date_too_old"]),
        ("int", "240 CARTONS", 240, []),
        ("int", "2.5", "2.5", ["not_whole_number"]),
        ("money", "0.00", "0.00", ["not_positive"]),
        (
            "containers",
            "CSQU3054383; CSQU 305438-4",
            ["CSQU3054383", "CSQU3054384"],
            ["container_check_digit"],
        ),
        ("date", "someday", None, ["unparseable"]),
        ("text", "  ", None, []),
        ("country", "SWEDEN", "Sweden", []),
        ("country", "united states", "United States", []),
    ],
)
def test_normalize_and_validate(kind: str, raw: str, norm: object, errs: list[str]) -> None:
    assert normalize_and_validate(kind, raw, None, today=TODAY) == (norm, errs)


def test_confidence_only_trusts_the_model_to_lower_it() -> None:
    assert score(0.99, "FOB", True, []) == 0.99
    assert score(0.99, "FOO", True, ["unknown_incoterm"]) == 0.4  # validator caps it
    assert score(1.7, "x", True, []) == 1.0  # clamped
    assert score(None, None, True, []) == 0.0  # required and empty
    assert score(None, None, False, []) == 1.0  # optional and empty: nothing to review


def test_normalize_party_ignores_legal_suffixes() -> None:
    a = normalize_party("Company E Lighting Pvt. Ltd.")
    b = normalize_party("COMPANY E LIGHTING PRIVATE LIMITED")
    assert a == b == "company e lighting"


def test_normalize_party_strips_stacked_suffixes() -> None:
    assert normalize_party("Company B Lighting Technology Co., Ltd.") == (
        "company b lighting technology"
    )
    assert normalize_party("Company J Packaging Joint Stock Company") == "company j packaging"
