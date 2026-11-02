"""Ground truth for the synthetic sample documents.

Each spec renders to an invoice, packing list and bill of lading (scripts/generate_docs.py) and is
also the label set for evaluation, so every value here is exactly what is printed. All companies
and people are fictional (PRD A13). `faults` lists the deliberate problems each shipment carries,
mapped to the cross-check rules in PRD §8.3.
"""

from dataclasses import dataclass, field
from decimal import Decimal


def iso6346(owner_and_serial: str) -> str:
    """Append the ISO 6346 check digit to 'ABCU123456'."""
    values: dict[str, int] = {}
    n = 10
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if n % 11 == 0:
            n += 1
        values[ch] = n
        n += 1
    values.update({str(d): d for d in range(10)})
    total = sum(values[c] * (2**i) for i, c in enumerate(owner_and_serial))
    return owner_and_serial + str(total % 11 % 10)


@dataclass
class Line:
    description: str
    hsn: str
    qty: int
    unit: str
    unit_price: Decimal
    packages: int
    net_kg: Decimal
    gross_kg: Decimal

    @property
    def amount(self) -> Decimal:
        return (self.unit_price * self.qty).quantize(Decimal("0.01"))


@dataclass
class Party:
    name: str
    address: str
    country: str
    name_local: str | None = None  # printed beside the English name on bilingual documents


@dataclass
class Spec:
    ref: str
    supplier: Party
    importer: Party
    invoice_no: str
    invoice_date: str  # ISO; rendered in the supplier's local style
    currency: str
    incoterm: str
    incoterm_place: str
    origin: str
    lines: list[Line]
    package_type: str
    bl_no: str
    vessel: str
    voyage: str
    port_of_loading: str
    port_of_discharge: str
    containers: list[tuple[str, str]]  # (container no, seal no)
    marks: str
    # Printed overrides that differ from the true sums; this is how faults are planted.
    invoice_total_printed: Decimal | None = None
    invoice_gross_printed: Decimal | None = None
    pl_invoice_ref: str | None = None
    bl_packages: int | None = None
    bl_gross: Decimal | None = None
    bl_containers: list[tuple[str, str]] | None = None
    # Rendering variants
    bilingual: bool = False
    decimal_comma: bool = False
    scan: str = "clean"  # clean | light | heavy
    stamp_over: str | None = None  # "invoice_total"
    unreadable: set[str] = field(default_factory=set)  # doc types rendered illegibly
    omit: set[str] = field(default_factory=set)  # doc types not uploaded
    faults: list[str] = field(default_factory=list)

    @property
    def total(self) -> Decimal:
        return sum((ln.amount for ln in self.lines), Decimal("0"))

    @property
    def packages(self) -> int:
        return sum(ln.packages for ln in self.lines)

    @property
    def net_kg(self) -> Decimal:
        return sum((ln.net_kg for ln in self.lines), Decimal("0"))

    @property
    def gross_kg(self) -> Decimal:
        return sum((ln.gross_kg for ln in self.lines), Decimal("0"))


D = Decimal

SUP_B = Party(
    "Company B Lighting Technology Co., Ltd.",
    "No. 18 Industrial Road, Guzhen Town, Zhongshan, Guangdong 528421",
    "China",
    name_local="公司B照明科技有限公司",
)
SUP_C = Party("Company C Valves AB", "Industrigatan 7, 652 21 Karlstad", "Sweden")
SUP_H = Party("Company H Antriebstechnik GmbH", "Gewerbestraße 31, 70565 Stuttgart", "Germany")
SUP_J = Party(
    "Company J Packaging Joint Stock Company",
    "Lot B4, Song Than 2 Industrial Park, Di An, Binh Duong",
    "Vietnam",
)

IMP_E = Party(
    "Company E Lighting Pvt Ltd",
    "Plot 44, TTC Industrial Area, Mahape, Navi Mumbai 400710",
    "India",
)
IMP_F = Party(
    "Company F Flow Controls Ltd", "Unit 9, Sector 5, Kharghar, Navi Mumbai 410210", "India"
)
IMP_G = Party(
    "Company G Packaging Pvt Ltd", "Gala 12, Bhiwandi Logistics Park, Thane 421302", "India"
)

SPECS: list[Spec] = [
    # The brief's row: invoice says 3,120 kg gross, packing list and B/L say 3,165 kg. X5 fails.
    Spec(
        ref="SHP-24811",
        supplier=SUP_B,
        importer=IMP_E,
        invoice_no="ZS-2026-1187",
        invoice_date="2026-10-08",
        currency="USD",
        incoterm="FOB",
        incoterm_place="Shenzhen",
        origin="China",
        lines=[
            Line(
                "LED panel light 40W 600x600mm",
                "94054290",
                2400,
                "PCS",
                D("6.80"),
                240,
                D("2880.00"),
                D("3165.00"),
            ),
        ],
        package_type="CARTONS",
        bl_no="SZXNSA2611874",
        vessel="SEA LOTUS 512",
        voyage="W061",
        port_of_loading="Shenzhen (Yantian), China",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("LTSU836104"), "CN4471203")],
        marks="CO-E / NHAVA SHEVA / C/NO. 1-240",
        invoice_gross_printed=D("3120.00"),
        bilingual=True,
        faults=["X5: invoice gross 3,120 kg vs PL and B/L 3,165 kg"],
    ),
    # The brief's second row. Clean, all checks pass; Swedish decimal comma on the invoice.
    Spec(
        ref="SHP-24812",
        supplier=SUP_C,
        importer=IMP_F,
        invoice_no="CV-40921",
        invoice_date="2026-10-14",
        currency="EUR",
        incoterm="CIF",
        incoterm_place="Nhava Sheva",
        origin="Sweden",
        lines=[
            Line(
                "Steel ball valve DN50 PN40, flanged",
                "84818030",
                180,
                "PCS",
                D("42.50"),
                6,
                D("1380.00"),
                D("1460.00"),
            ),
        ],
        package_type="PALLETS",
        bl_no="GOT0294418",
        vessel="NORDIC ANNA",
        voyage="FA642W",
        port_of_loading="Gothenburg, Sweden",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("NRDU204917"), "SE0091822")],
        marks="CO-F / NSA / P1-6",
        decimal_comma=True,
        faults=[],
    ),
    # Invoice total printed wrong (lines sum to 9,540.00). X1 fails. Lightly scanned.
    Spec(
        ref="SHP-24813",
        supplier=SUP_J,
        importer=IMP_G,
        invoice_no="JP/EX/26/0457",
        invoice_date="2026-10-02",
        currency="USD",
        incoterm="FOB",
        incoterm_place="Cat Lai",
        origin="Vietnam",
        lines=[
            Line(
                "Corrugated carton box 5-ply 600x400x400",
                "48191010",
                12000,
                "PCS",
                D("0.62"),
                300,
                D("6900.00"),
                D("7260.00"),
            ),
            Line(
                "Die-cut carton divider insert",
                "48239090",
                6000,
                "PCS",
                D("0.35"),
                60,
                D("840.00"),
                D("905.00"),
            ),
        ],
        package_type="BUNDLES",
        bl_no="SGNNSA260457",
        vessel="MEKONG STAR",
        voyage="2611W",
        port_of_loading="Cat Lai, Ho Chi Minh City, Vietnam",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("MKSU771230"), "VN771230A"), (iso6346("MKSU771245"), "VN771245A")],
        marks="CO-G / BHIWANDI",
        invoice_total_printed=D("9840.00"),
        scan="light",
        faults=["X1: printed total 9,840.00 vs line sum 9,540.00"],
    ),
    # B/L shows 318 packages vs packing list 320. X4 fails.
    Spec(
        ref="SHP-24814",
        supplier=SUP_B,
        importer=IMP_E,
        invoice_no="ZS-2026-1203",
        invoice_date="2026-10-16",
        currency="USD",
        incoterm="FOB",
        incoterm_place="Shenzhen",
        origin="China",
        lines=[
            Line(
                "LED downlight 12W round",
                "94054290",
                6000,
                "PCS",
                D("2.15"),
                200,
                D("1500.00"),
                D("1720.00"),
            ),
            Line(
                "LED driver 12W constant current",
                "85044090",
                6000,
                "PCS",
                D("0.95"),
                120,
                D("600.00"),
                D("690.00"),
            ),
        ],
        package_type="CARTONS",
        bl_no="SZXNSA2612031",
        vessel="SEA LOTUS 512",
        voyage="W063",
        port_of_loading="Shenzhen (Yantian), China",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("LTSU902237"), "CN4480911")],
        marks="CO-E / NSA / C/NO. 1-320",
        bl_packages=318,
        bilingual=True,
        faults=["X4: PL 320 cartons vs B/L 318"],
    ),
    # B/L container number differs by one digit from the PL, and the PL quotes the wrong invoice
    # number. X7 and X9 fail.
    Spec(
        ref="SHP-24815",
        supplier=SUP_H,
        importer=IMP_F,
        invoice_no="RE-2026-08812",
        invoice_date="2026-10-09",
        currency="EUR",
        incoterm="FCA",
        incoterm_place="Stuttgart",
        origin="Germany",
        lines=[
            Line(
                "Pneumatic actuator double-acting DA-105",
                "84122100",
                40,
                "PCS",
                D("318.00"),
                4,
                D("392.00"),
                D("436.00"),
            ),
            Line(
                "Solenoid valve 5/2 NAMUR 24V DC",
                "84812000",
                40,
                "PCS",
                D("96.40"),
                1,
                D("38.00"),
                D("44.00"),
            ),
        ],
        package_type="PALLETS",
        bl_no="HAMNSA6631208",
        vessel="RHINE TIGRIS",
        voyage="0FM3RW1MA",
        port_of_loading="Hamburg, Germany",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("RHNU541208"), "DE7713405")],
        marks="CO-F / NSA / 1-5",
        pl_invoice_ref="RE-2026-08821",
        bl_containers=[(iso6346("RHNU541280"), "DE7713405")],
        decimal_comma=True,
        faults=["X7: container differs PL vs B/L", "X9: PL quotes RE-2026-08821"],
    ),
    # Clean content, heavy scan noise: tests confidence under bad image quality.
    Spec(
        ref="SHP-24816",
        supplier=SUP_J,
        importer=IMP_G,
        invoice_no="JP/EX/26/0471",
        invoice_date="2026-10-11",
        currency="USD",
        incoterm="FOB",
        incoterm_place="Cat Lai",
        origin="Vietnam",
        lines=[
            Line(
                "Kraft paper roll 120 gsm, 1200 mm",
                "48042900",
                80,
                "ROLLS",
                D("88.00"),
                80,
                D("19200.00"),
                D("19680.00"),
            ),
        ],
        package_type="ROLLS",
        bl_no="SGNNSA260471",
        vessel="MEKONG STAR",
        voyage="2613W",
        port_of_loading="Cat Lai, Ho Chi Minh City, Vietnam",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("MKSU771301"), "VN771301A")],
        marks="CO-G / BHIWANDI",
        scan="heavy",
        faults=[],
    ),
    # A rubber stamp sits on top of the invoice total: the model should be unsure there.
    Spec(
        ref="SHP-24817",
        supplier=SUP_B,
        importer=IMP_E,
        invoice_no="ZS-2026-1219",
        invoice_date="2026-10-20",
        currency="USD",
        incoterm="CFR",
        incoterm_place="Nhava Sheva",
        origin="China",
        lines=[
            Line(
                "LED high bay light 150W",
                "94054290",
                600,
                "PCS",
                D("24.90"),
                150,
                D("2700.00"),
                D("3060.00"),
            ),
        ],
        package_type="CARTONS",
        bl_no="SZXNSA2612194",
        vessel="PEARL COMPETENCE",
        voyage="047W",
        port_of_loading="Shenzhen (Shekou), China",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("PRLU118342"), "CN4492007")],
        marks="CO-E / NSA / C/NO. 1-150",
        bilingual=True,
        stamp_over="invoice_total",
        scan="light",
        faults=["stamp over invoice total (expect low confidence)"],
    ),
    # Clean, all checks pass.
    Spec(
        ref="SHP-24818",
        supplier=SUP_C,
        importer=IMP_F,
        invoice_no="CV-40977",
        invoice_date="2026-10-18",
        currency="EUR",
        incoterm="CIF",
        incoterm_place="Nhava Sheva",
        origin="Sweden",
        lines=[
            Line(
                "Butterfly valve DN100 wafer type",
                "84818090",
                60,
                "PCS",
                D("118.00"),
                3,
                D("744.00"),
                D("790.00"),
            ),
            Line(
                "Gear operator for DN100 valve",
                "84819090",
                60,
                "PCS",
                D("36.75"),
                1,
                D("150.00"),
                D("168.00"),
            ),
        ],
        package_type="PALLETS",
        bl_no="GOT0294502",
        vessel="NORDIC ANNA",
        voyage="FA644W",
        port_of_loading="Gothenburg, Sweden",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("NRDU205033"), "SE0091877")],
        marks="CO-F / NSA / P1-4",
        decimal_comma=True,
        faults=[],
    ),
    # One packing-list line has net weight above gross. X6 fails (and X10 still balances).
    Spec(
        ref="SHP-24819",
        supplier=SUP_H,
        importer=IMP_G,
        invoice_no="RE-2026-08840",
        invoice_date="2026-10-21",
        currency="EUR",
        incoterm="FCA",
        incoterm_place="Stuttgart",
        origin="Germany",
        lines=[
            Line(
                "Servo motor 1.5 kW with brake",
                "85015290",
                24,
                "PCS",
                D("612.00"),
                2,
                D("312.00"),
                D("298.00"),
            ),
        ],
        package_type="PALLETS",
        bl_no="HAMNSA6631266",
        vessel="RHINE TIGRIS",
        voyage="0FM3TW1MA",
        port_of_loading="Hamburg, Germany",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("RHNU541266"), "DE7713491")],
        marks="CO-G / BHIWANDI / 1-2",
        decimal_comma=True,
        faults=["X6: net 312 kg > gross 298 kg"],
    ),
    # The B/L scan is illegible: that document must fall back to manual entry.
    Spec(
        ref="SHP-24820",
        supplier=SUP_J,
        importer=IMP_E,
        invoice_no="JP/EX/26/0488",
        invoice_date="2026-10-23",
        currency="USD",
        incoterm="FOB",
        incoterm_place="Cat Lai",
        origin="Vietnam",
        lines=[
            Line(
                "Moulded pulp packaging insert for luminaires",
                "48236900",
                20000,
                "PCS",
                D("0.18"),
                100,
                D("1600.00"),
                D("1720.00"),
            ),
        ],
        package_type="CARTONS",
        bl_no="SGNNSA260488",
        vessel="MEKONG STAR",
        voyage="2615W",
        port_of_loading="Cat Lai, Ho Chi Minh City, Vietnam",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("MKSU771377"), "VN771377A")],
        marks="CO-E / NSA",
        unreadable={"bill_of_lading"},
        faults=["B/L unreadable → manual entry"],
    ),
    # Bill of lading not received yet: rules needing it are not checkable.
    Spec(
        ref="SHP-24821",
        supplier=SUP_C,
        importer=IMP_F,
        invoice_no="CV-41003",
        invoice_date="2026-10-24",
        currency="EUR",
        incoterm="CIF",
        incoterm_place="Nhava Sheva",
        origin="Sweden",
        lines=[
            Line(
                "Check valve DN80 swing type",
                "84813000",
                90,
                "PCS",
                D("64.20"),
                3,
                D("810.00"),
                D("866.00"),
            ),
        ],
        package_type="PALLETS",
        bl_no="GOT0294561",
        vessel="NORDIC ANNA",
        voyage="FA646W",
        port_of_loading="Gothenburg, Sweden",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("NRDU205101"), "SE0091930")],
        marks="CO-F / NSA / P1-3",
        decimal_comma=True,
        omit={"bill_of_lading"},
        faults=["B/L missing → X4, X5, X7 not checkable"],
    ),
    # Clean, all checks pass, bilingual.
    Spec(
        ref="SHP-24822",
        supplier=SUP_B,
        importer=IMP_G,
        invoice_no="ZS-2026-1231",
        invoice_date="2026-10-25",
        currency="USD",
        incoterm="FOB",
        incoterm_place="Shenzhen",
        origin="China",
        lines=[
            Line(
                "Printed folding carton for LED lamps",
                "48191090",
                50000,
                "PCS",
                D("0.09"),
                100,
                D("2150.00"),
                D("2290.00"),
            ),
        ],
        package_type="CARTONS",
        bl_no="SZXNSA2612310",
        vessel="PEARL COMPETENCE",
        voyage="049W",
        port_of_loading="Shenzhen (Shekou), China",
        port_of_discharge="Nhava Sheva, India",
        containers=[(iso6346("PRLU118409"), "CN4499215")],
        marks="CO-G / BHIWANDI",
        bilingual=True,
        faults=[],
    ),
]

BY_REF = {s.ref: s for s in SPECS}
