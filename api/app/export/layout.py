"""The filing-software import layout [A3] (TDD §7).

This is the only module that knows the layout, so the real one can replace it in one file.
One CSV, one column-header line, then an H row for the shipment and an L row per invoice line.
H rows leave the line columns blank and L rows leave the header columns blank [A25].
"""

import csv
import io
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.models import Document, FieldRow, Shipment

FORMAT = "csv-v1"

HEADER_COLUMNS = (
    "invoice_no",
    "invoice_date",
    "currency",
    "incoterm",
    "incoterm_place",
    "invoice_value",
    "importer_name",
    "importer_iec",
    "supplier_name",
    "supplier_country",
    "bl_no",
    "vessel_voyage",
    "port_of_loading",
    "port_of_discharge",
    "total_packages",
    "package_type",
    "gross_weight_kg",
    "net_weight_kg",
    "container_nos",
)
LINE_COLUMNS = (
    "line_no",
    "description",
    "hsn",
    "qty",
    "unit",
    "unit_price",
    "line_amount",
    "country_of_origin",
)
COLUMNS = ("record_type", "shipment_ref", *HEADER_COLUMNS, *LINE_COLUMNS)

# A spreadsheet treats a cell starting with one of these as a formula (CSV injection).
FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def escape_cell(value: str) -> str:
    """Prefix a ' so Excel shows the text instead of running it as a formula."""
    return f"'{value}" if value.startswith(FORMULA_START) else value


@dataclass
class _Doc:
    header: dict[str, FieldRow]
    lines: list[dict[str, FieldRow]]


def _index(doc: Document | None) -> _Doc:
    if doc is None:
        return _Doc({}, [])
    header: dict[str, FieldRow] = {}
    by_line: dict[int, dict[str, FieldRow]] = {}
    for f in doc.fields:
        if f.line_index is None:
            header[f.key] = f
        else:
            by_line.setdefault(f.line_index, {})[f.key] = f
    return _Doc(header, [by_line[i] for i in sorted(by_line)])


def _text(f: FieldRow | None) -> str:
    """The filing value: the normalised form when there is one (plain digits, ISO codes)."""
    if f is None:
        return ""
    v: Any = f.normalized if f.normalized is not None else f.value
    if v is None:
        return ""
    if isinstance(v, list):
        return "; ".join(str(x) for x in v)
    return str(v).strip()


def _date(f: FieldRow | None) -> str:
    raw = _text(f)
    try:
        return date.fromisoformat(raw).strftime("%d/%m/%Y")
    except ValueError:
        return raw


def build_rows(shipment: Shipment, docs: Sequence[Document]) -> list[dict[str, str]]:
    by_type = {d.doc_type: d for d in docs}
    inv = _index(by_type.get("invoice"))
    pl = _index(by_type.get("packing_list"))
    bl = _index(by_type.get("bill_of_lading"))

    def first(*cands: tuple[_Doc, str]) -> str:
        """The first document that has the value, in the order given."""
        for d, key in cands:
            if v := _text(d.header.get(key)):
                return v
        return ""

    vessel = _text(bl.header.get("vessel"))
    voyage = _text(bl.header.get("voyage"))
    head = {
        "invoice_no": first((inv, "invoice_number")),
        "invoice_date": _date(inv.header.get("invoice_date")),
        "currency": first((inv, "currency")),
        "incoterm": first((inv, "incoterm")),
        "incoterm_place": first((inv, "incoterm_place")),
        "invoice_value": first((inv, "invoice_total")),
        # The importer comes from the client record (it has the IEC); the supplier as printed.
        "importer_name": shipment.importer.name,
        "importer_iec": shipment.importer.iec_code,
        "supplier_name": first((inv, "supplier_name"))
        or (shipment.supplier.name if shipment.supplier else ""),
        "supplier_country": first((inv, "supplier_country"))
        or (shipment.supplier.country if shipment.supplier else ""),
        "bl_no": first((bl, "bl_number")),
        "vessel_voyage": " / ".join(x for x in (vessel, voyage) if x),
        "port_of_loading": first((bl, "port_of_loading")),
        "port_of_discharge": first((bl, "port_of_discharge")),
        # The packing list is the detailed source; the B/L fills in when it's missing.
        "total_packages": first((pl, "total_packages"), (bl, "total_packages")),
        "package_type": first((pl, "package_type"), (bl, "package_type")),
        "gross_weight_kg": first((pl, "total_gross_weight_kg"), (bl, "total_gross_weight_kg")),
        "net_weight_kg": first((pl, "total_net_weight_kg"), (inv, "total_net_weight_kg")),
        "container_nos": first((pl, "container_numbers"), (bl, "container_numbers")),
    }
    rows = [{"record_type": "H", "shipment_ref": shipment.ref, **head}]
    origin = first((inv, "country_of_origin"))
    for n, ln in enumerate(inv.lines, start=1):
        rows.append(
            {
                "record_type": "L",
                "shipment_ref": shipment.ref,
                "line_no": str(n),
                "description": _text(ln.get("description")),
                "hsn": _text(ln.get("hsn")),
                "qty": _text(ln.get("quantity")),
                "unit": _text(ln.get("unit")),
                "unit_price": _text(ln.get("unit_price")),
                "line_amount": _text(ln.get("amount")),
                "country_of_origin": origin,
            }
        )
    return rows


def to_csv(rows: Sequence[dict[str, str]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(COLUMNS)
    for r in rows:
        w.writerow(escape_cell(r.get(c, "")) for c in COLUMNS)
    # UTF-8 with a BOM so Excel on Windows reads non-ASCII names correctly.
    return buf.getvalue().encode("utf-8-sig")
