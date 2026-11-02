"""Every field Crosscheck extracts, per document type (PRD §8.1).

The catalog drives the Gemini response schema, normalisation, validation, the review UI's
grouping, and the export mapping, so a field is declared exactly once.
"""

from dataclasses import dataclass
from typing import Literal

DocType = Literal["invoice", "packing_list", "bill_of_lading"]
Kind = Literal[
    "text", "money", "number", "int", "date", "currency", "incoterm", "hsn", "containers", "country"
]
Section = Literal["parties", "document", "shipping", "totals", "lines"]


@dataclass(frozen=True)
class FieldDef:
    key: str
    label: str
    kind: Kind
    section: Section
    required: bool = True
    hint: str = ""  # extra instruction for the model


INVOICE = (
    FieldDef("supplier_name", "Supplier", "text", "parties", hint="Seller / exporter, in English"),
    FieldDef("supplier_country", "Supplier country", "country", "parties"),
    FieldDef("buyer_name", "Buyer / importer", "text", "parties"),
    FieldDef("invoice_number", "Invoice no.", "text", "document"),
    FieldDef("invoice_date", "Invoice date", "date", "document"),
    FieldDef("currency", "Currency", "currency", "document", hint="ISO 4217 code, e.g. USD"),
    FieldDef("incoterm", "Incoterm", "incoterm", "document", hint="Three letters only, e.g. FOB"),
    FieldDef("incoterm_place", "Incoterm place", "text", "document", required=False),
    FieldDef("country_of_origin", "Country of origin", "country", "document"),
    FieldDef("invoice_total", "Invoice total", "money", "totals"),
    FieldDef("total_packages", "Total packages", "int", "totals", required=False),
    FieldDef("total_net_weight_kg", "Net weight (kg)", "number", "totals", required=False),
    FieldDef("total_gross_weight_kg", "Gross weight (kg)", "number", "totals", required=False),
)
INVOICE_LINE = (
    FieldDef("description", "Description", "text", "lines"),
    FieldDef("hsn", "HSN", "hsn", "lines", hint="HS / HSN code digits"),
    FieldDef("quantity", "Qty", "int", "lines"),
    FieldDef("unit", "Unit", "text", "lines", required=False),
    FieldDef("unit_price", "Unit price", "money", "lines"),
    FieldDef("amount", "Amount", "money", "lines"),
)

PACKING_LIST = (
    FieldDef("invoice_reference", "Invoice ref.", "text", "document"),
    FieldDef("total_packages", "Total packages", "int", "totals"),
    FieldDef("package_type", "Package type", "text", "totals", required=False),
    FieldDef("total_net_weight_kg", "Net weight (kg)", "number", "totals"),
    FieldDef("total_gross_weight_kg", "Gross weight (kg)", "number", "totals"),
    FieldDef(
        "container_numbers",
        "Containers",
        "containers",
        "shipping",
        hint="All container numbers, separated by '; '",
    ),
    FieldDef("marks", "Marks and numbers", "text", "shipping", required=False),
)
PACKING_LINE = (
    FieldDef("description", "Description", "text", "lines"),
    FieldDef("quantity", "Qty", "int", "lines"),
    FieldDef("packages", "Packages", "int", "lines"),
    FieldDef("net_weight_kg", "Net (kg)", "number", "lines"),
    FieldDef("gross_weight_kg", "Gross (kg)", "number", "lines"),
)

BILL_OF_LADING = (
    FieldDef("bl_number", "B/L no.", "text", "document"),
    FieldDef("shipper_name", "Shipper", "text", "parties"),
    FieldDef("consignee_name", "Consignee", "text", "parties"),
    FieldDef("vessel", "Vessel", "text", "shipping"),
    FieldDef("voyage", "Voyage", "text", "shipping", required=False),
    FieldDef("port_of_loading", "Port of loading", "text", "shipping"),
    FieldDef("port_of_discharge", "Port of discharge", "text", "shipping"),
    FieldDef(
        "container_numbers",
        "Containers",
        "containers",
        "shipping",
        hint="All container numbers, separated by '; '",
    ),
    FieldDef(
        "seal_numbers",
        "Seals",
        "text",
        "shipping",
        required=False,
        hint="All seal numbers, separated by '; '",
    ),
    FieldDef("total_packages", "Total packages", "int", "totals"),
    FieldDef("package_type", "Package type", "text", "totals", required=False),
    FieldDef("total_gross_weight_kg", "Gross weight (kg)", "number", "totals"),
)

HEADER: dict[str, tuple[FieldDef, ...]] = {
    "invoice": INVOICE,
    "packing_list": PACKING_LIST,
    "bill_of_lading": BILL_OF_LADING,
}
LINES: dict[str, tuple[FieldDef, ...]] = {
    "invoice": INVOICE_LINE,
    "packing_list": PACKING_LINE,
    "bill_of_lading": (),
}


def field_def(doc_type: str, key: str, is_line: bool) -> FieldDef:
    for f in (LINES if is_line else HEADER)[doc_type]:
        if f.key == key:
            return f
    raise KeyError(f"{doc_type}.{key}")
