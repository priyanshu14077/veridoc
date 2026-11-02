"""Render the synthetic sample documents and their ground truth.

    uv run python scripts/generate_docs.py            # writes ../sample-docs/<ref>/

Output per shipment: invoice.pdf, packing_list.pdf, bill_of_lading.pdf (minus any omitted) and
truth.json. Documents are drawn as images (so "scanned" variants are realistic) and saved as
image PDFs. Needs macOS system fonts; the outputs are committed, so CI never runs this.
"""

import json
import random
import sys
from decimal import Decimal
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sample_specs import SPECS, Party, Spec  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "sample-docs"
W, H = 1240, 1754  # A4 at 150 dpi
M = 70  # page margin

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
REG = str(FONT_DIR / "Arial.ttf")
BOLD = str(FONT_DIR / "Arial Bold.ttf")
UNI = str(FONT_DIR / "Arial Unicode.ttf")  # has CJK glyphs for bilingual documents


def font(size: int, bold: bool = False, uni: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(UNI if uni else BOLD if bold else REG, size)


# ---------- locale formatting (what the supplier would print) ----------


def money(v: Decimal, country: str) -> str:
    s = f"{v:,.2f}"
    if country == "Sweden":
        return s.replace(",", " ").replace(".", ",")
    if country == "Germany":
        return s.replace(",", "X").replace(".", ",").replace("X", ".")
    return s


def qty(v: int, country: str) -> str:
    s = f"{v:,}"
    return (
        s.replace(",", " ")
        if country == "Sweden"
        else s.replace(",", ".")
        if country == "Germany"
        else s
    )


def date(iso: str, country: str) -> str:
    y, m, d = iso.split("-")
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    if country == "Germany":
        return f"{d}.{m}.{y}"
    if country == "Vietnam":
        return f"{d}/{m}/{y}"
    if country == "China":
        return f"{months[int(m) - 1]}. {d}, {y}"
    return iso  # Sweden prints ISO dates


def kg(v: Decimal, country: str) -> str:
    return f"{money(v, country)} KGS"


# ---------- drawing helpers ----------


class Page:
    def __init__(self) -> None:
        self.img = Image.new("RGB", (W, H), "white")
        self.d = ImageDraw.Draw(self.img)
        self.boxes: dict[str, tuple[int, int, int, int]] = {}

    def text(
        self,
        xy: tuple[int, int],
        s: str,
        size: int = 20,
        bold: bool = False,
        uni: bool = False,
        anchor: str = "la",
        fill: str = "#111",
    ) -> tuple[int, int, int, int]:
        f = font(size, bold, uni)
        self.d.text(xy, s, font=f, fill=fill, anchor=anchor)
        return self.d.textbbox(xy, s, font=f, anchor=anchor)

    def rect(self, box: tuple[int, int, int, int], width: int = 2) -> None:
        self.d.rectangle(box, outline="#222", width=width)

    def hline(self, y: int, x0: int = M, x1: int = W - M, width: int = 2) -> None:
        self.d.line((x0, y, x1, y), fill="#222", width=width)

    def label_value(
        self, x: int, y: int, label: str, value: str, w: int = 260, key: str | None = None
    ) -> int:
        self.text((x, y), label, 16, fill="#555")
        bb = self.text((x, y + 22), value, 21, bold=True)
        if key:
            self.boxes[key] = bb
        return y + 56

    def party(self, x: int, y: int, w: int, title: str, p: Party, bilingual: bool) -> int:
        self.rect((x, y, x + w, y + 150), 2)
        self.text((x + 12, y + 10), title, 16, fill="#555")
        yy = y + 34
        if bilingual and p.name_local:
            self.text((x + 12, yy), p.name_local, 20, uni=True)
            yy += 28
        self.text((x + 12, yy), p.name, 20, bold=True)
        yy += 28
        for line in wrap(p.address, 52):
            self.text((x + 12, yy), line, 17)
            yy += 22
        self.text((x + 12, yy), p.country.upper(), 17)
        return y + 150

    def table(
        self,
        x: int,
        y: int,
        cols: list[tuple[str, int, str]],
        rows: list[list[str]],
        row_h: int = 40,
    ) -> int:
        """cols: (title, width, align l|r). Returns y after the table."""
        total_w = sum(c[1] for c in cols)
        self.d.rectangle((x, y, x + total_w, y + row_h), fill="#ececec", outline="#222", width=2)
        cx = x
        for title, w, align in cols:
            self.text(
                (cx + (w - 10 if align == "r" else 10), y + 11),
                title,
                16,
                bold=True,
                anchor="ra" if align == "r" else "la",
            )
            cx += w
        yy = y + row_h
        for r in rows:
            cx = x
            for (_, w, align), cell in zip(cols, r, strict=True):
                for i, part in enumerate(wrap(cell, max(8, w // 11))):
                    self.text(
                        (cx + (w - 10 if align == "r" else 10), yy + 10 + i * 22),
                        part,
                        18,
                        anchor="ra" if align == "r" else "la",
                    )
                cx += w
            lines = max(len(wrap(c, max(8, w // 11))) for (_, w, _), c in zip(cols, r, strict=True))
            h = max(row_h, 12 + lines * 22)
            self.d.rectangle((x, yy, x + total_w, yy + h), outline="#222", width=1)
            yy += h
        cx = x
        for _, w, _ in cols[:-1]:
            cx += w
            self.d.line((cx, y, cx, yy), fill="#222", width=1)
        return yy

    def signature(self, x: int, y: int, label: str) -> None:
        rnd = random.Random(x * y)
        pts = [(x + i * 12, y + 30 + rnd.randint(-14, 14)) for i in range(16)]
        self.d.line(pts, fill="#1b2a7a", width=3, joint="curve")
        self.hline(y + 60, x, x + 260, 1)
        self.text((x, y + 66), label, 15, fill="#555")


def wrap(s: str, n: int) -> list[str]:
    words, out, cur = s.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > n and cur:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    return out + [cur] if cur else out or [""]


def stamp(img: Image.Image, center: tuple[int, int], text: str) -> None:
    """A semi-transparent red company chop, partly covering whatever is underneath."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    r = 105
    red = (200, 30, 40, 150)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=red, width=7)
    d.ellipse((cx - r + 16, cy - r + 16, cx + r - 16, cy + r - 16), outline=red, width=3)
    d.text((cx, cy - 18), "★", font=font(44, uni=True), fill=red, anchor="mm")
    d.text((cx, cy + 30), text, font=font(20, bold=True), fill=red, anchor="mm")
    layer = layer.rotate(-14, center=center)
    img.paste(layer, (0, 0), layer)


# ---------- documents ----------


def header(p: Page, s: Spec, title: str) -> int:
    sup = s.supplier
    y = M
    if s.bilingual and sup.name_local:
        p.text((M, y), sup.name_local, 30, uni=True)
        y += 42
    p.text((M, y), sup.name, 28, bold=True)
    y += 40
    p.text((M, y), f"{sup.address}, {sup.country}", 17, fill="#333")
    y += 44
    p.hline(y, width=3)
    y += 24
    if " " in title and not title.isascii():
        en, local = title.rsplit(" ", 1)
        bb = p.text((W // 2 - 60, y), en, 34, bold=True, anchor="ma")
        p.text((bb[2] + 14, y + 2), local, 32, uni=True)
    else:
        p.text((W // 2, y), title, 34, bold=True, anchor="ma")
    return y + 70


def invoice(s: Spec) -> Page:
    p = Page()
    c = s.supplier.country
    y = header(p, s, "COMMERCIAL INVOICE" + (" 商业发票" if s.bilingual else ""))
    col = (W - 2 * M) // 4
    p.label_value(M, y, "Invoice No.", s.invoice_no, key="invoice_number")
    p.label_value(M + col, y, "Invoice Date", date(s.invoice_date, c), key="invoice_date")
    p.label_value(
        M + 2 * col, y, "Terms of Delivery", f"{s.incoterm} {s.incoterm_place}", key="incoterm"
    )
    p.label_value(M + 3 * col, y, "Currency", s.currency, key="currency")
    y += 70
    half = (W - 2 * M - 20) // 2
    p.party(M, y, half, "Seller / Exporter", s.supplier, s.bilingual)
    p.party(M + half + 20, y, half, "Buyer / Importer", s.importer, False)
    y += 170
    p.text((M, y), f"Country of Origin: {s.origin}", 18)
    p.text((W - M, y), f"Port of Discharge: {s.port_of_discharge}", 18, anchor="ra")
    y += 44
    cols = [
        ("No.", 60, "l"),
        ("Description of Goods", 430, "l"),
        ("HS Code", 140, "l"),
        ("Qty", 120, "r"),
        ("Unit", 70, "l"),
        (f"Unit Price {s.currency}", 140, "r"),
        (f"Amount {s.currency}", 140, "r"),
    ]
    rows = [
        [
            str(i + 1),
            ln.description,
            ln.hsn,
            qty(ln.qty, c),
            ln.unit,
            money(ln.unit_price, c),
            money(ln.amount, c),
        ]
        for i, ln in enumerate(s.lines)
    ]
    y = p.table(M, y, cols, rows)
    total = s.invoice_total_printed if s.invoice_total_printed is not None else s.total
    y += 16
    p.text((W - M - 200, y), "TOTAL", 22, bold=True, anchor="ra")
    bb = p.text((W - M - 10, y), f"{s.currency} {money(total, c)}", 24, bold=True, anchor="ra")
    p.boxes["invoice_total"] = bb
    y += 60
    gross = s.invoice_gross_printed if s.invoice_gross_printed is not None else s.gross_kg
    p.text((M, y), f"Total Packages: {qty(s.packages, c)} {s.package_type}", 19)
    y += 30
    p.text((M, y), f"Net Weight: {kg(s.net_kg, c)}", 19)
    y += 30
    p.text((M, y), f"Gross Weight: {kg(gross, c)}", 19)
    y += 60
    p.text(
        (M, y),
        "We certify that this invoice shows the actual price of the goods described "
        "and that all particulars are true and correct.",
        16,
        fill="#444",
    )
    p.signature(W - M - 300, y + 50, f"For {s.supplier.name}")
    if s.stamp_over == "invoice_total":
        x0, y0, x1, y1 = p.boxes["invoice_total"]
        stamp(p.img, ((x0 + x1) // 2 - 10, (y0 + y1) // 2 + 6), "CONTRACT SEAL")
    elif s.bilingual:
        stamp(p.img, (W - M - 160, y + 70), "EXPORT DEPT.")
    return p


def packing_list(s: Spec) -> Page:
    p = Page()
    c = s.supplier.country
    y = header(p, s, "PACKING LIST" + (" 装箱单" if s.bilingual else ""))
    col = (W - 2 * M) // 3
    p.label_value(M, y, "Invoice Ref.", s.pl_invoice_ref or s.invoice_no)
    p.label_value(M + col, y, "Date", date(s.invoice_date, c))
    p.label_value(M + 2 * col, y, "Consignee", s.importer.name.split(" Pvt")[0].split(" Ltd")[0])
    y += 76
    cols = [
        ("Description", 400, "l"),
        ("Qty", 120, "r"),
        ("Pkgs", 100, "r"),
        ("Net Wt (kg)", 150, "r"),
        ("Gross Wt (kg)", 160, "r"),
        ("Dimensions", 170, "l"),
    ]
    rows = [
        [
            ln.description,
            qty(ln.qty, c),
            qty(ln.packages, c),
            money(ln.net_kg, c),
            money(ln.gross_kg, c),
            "as per marks",
        ]
        for ln in s.lines
    ]
    rows.append(
        [
            "TOTAL",
            qty(sum(ln.qty for ln in s.lines), c),
            qty(s.packages, c),
            money(s.net_kg, c),
            money(s.gross_kg, c),
            "",
        ]
    )
    y = p.table(M, y, cols, rows)
    y += 30
    p.text((M, y), f"Total: {qty(s.packages, c)} {s.package_type}", 20, bold=True)
    y += 34
    p.text((M, y), f"Total Net Weight: {kg(s.net_kg, c)}", 19)
    y += 30
    p.text((M, y), f"Total Gross Weight: {kg(s.gross_kg, c)}", 19)
    y += 50
    p.text((M, y), "Container / Seal No.", 17, fill="#555")
    y += 26
    for cn, seal in s.containers:
        p.text((M, y), f"{cn[:4]} {cn[4:10]}-{cn[10]}   /   SEAL {seal}", 20, bold=True)
        y += 30
    y += 24
    p.text((M, y), "Shipping Marks:", 17, fill="#555")
    p.text((M + 170, y), s.marks, 19)
    p.signature(W - M - 300, y + 70, "Packed and checked by")
    return p


def bill_of_lading(s: Spec) -> Page:
    p = Page()
    c = s.supplier.country
    carrier = s.vessel.split()[0]
    p.text((W - M, M), "BILL OF LADING", 36, bold=True, anchor="ra")
    p.text(
        (W - M, M + 46),
        "For Combined Transport or Port to Port Shipment",
        16,
        anchor="ra",
        fill="#444",
    )
    p.text((W - M, M + 76), f"B/L No.  {s.bl_no}", 24, bold=True, anchor="ra")
    p.text((M, M), f"{carrier} SHIPPING LINES", 22, bold=True)
    y = M + 130
    half = (W - 2 * M) // 2
    for title, party, shift in (("Shipper", s.supplier, 0), ("Consignee", s.importer, 160)):
        p.party(M, y + shift, half - 10, title, party, False)
    notify = Party(
        f"SAME AS CONSIGNEE - {s.importer.name}", "Attn: import documentation desk", "India"
    )
    p.party(M, y + 320, half - 10, "Notify Party", notify, False)
    rx = M + half + 10
    p.label_value(rx, y, "Vessel", s.vessel)
    p.label_value(rx + 260, y, "Voyage No.", s.voyage)
    p.label_value(rx, y + 70, "Port of Loading", s.port_of_loading)
    p.label_value(rx, y + 140, "Port of Discharge", s.port_of_discharge)
    p.label_value(rx, y + 210, "Place of Delivery", "Nhava Sheva CFS")
    p.label_value(rx, y + 280, "Freight", "PREPAID" if s.incoterm in ("CIF", "CFR") else "COLLECT")
    y += 500
    containers = s.bl_containers or s.containers
    packages = s.bl_packages if s.bl_packages is not None else s.packages
    gross = s.bl_gross if s.bl_gross is not None else s.gross_kg
    desc = "; ".join(ln.description for ln in s.lines)
    cols = [
        ("Container No. / Seal No.", 300, "l"),
        ("No. of Pkgs", 150, "r"),
        ("Description of Goods", 400, "l"),
        ("Gross Weight", 250, "r"),
    ]
    rows = [
        [
            "\n".join(f"{cn} / {seal}" for cn, seal in containers),
            f"{qty(packages, c)} {s.package_type}",
            f"SAID TO CONTAIN: {desc}",
            kg(gross, c),
        ]
    ]
    rows[0][0] = "  ".join(f"{cn} / {seal}" for cn, seal in containers)
    y = p.table(M, y, cols, rows, row_h=44)
    y += 24
    p.text(
        (M, y), f"Total: {qty(packages, c)} {s.package_type} ONLY. SHIPPED ON BOARD.", 19, bold=True
    )
    y += 44
    p.text((M, y), f"Marks: {s.marks}", 18)
    y += 70
    p.text(
        (M, y),
        f"Place and date of issue: {s.port_of_loading.split(',')[0]}, {date(s.invoice_date, c)}",
        18,
    )
    p.signature(W - M - 300, y + 30, "Signed for the carrier, as agent")
    return p


# ---------- scan effects ----------


def scanned(img: Image.Image, level: str, seed: int) -> Image.Image:
    rnd = random.Random(seed)
    if level == "clean":
        return img
    angle = rnd.uniform(1.0, 2.0) if level == "light" else rnd.uniform(2.5, 4.0)
    out = img.convert("L").rotate(
        angle * rnd.choice((-1, 1)), expand=False, fillcolor=235, resample=Image.Resampling.BICUBIC
    )
    noise_amp = 18 if level == "light" else 46
    noise = Image.effect_noise(out.size, noise_amp)
    out = Image.blend(out, noise, 0.10 if level == "light" else 0.22)
    if level == "heavy":
        out = out.filter(ImageFilter.GaussianBlur(1.1)).point(
            lambda v: min(255, int(v * 0.85 + 30))
        )
    return out.convert("RGB")


def illegible(img: Image.Image) -> Image.Image:
    small = img.convert("L").resize((W // 9, H // 9), Image.Resampling.BILINEAR)
    out = small.resize((W, H), Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(3))
    return Image.blend(out, Image.effect_noise((W, H), 60), 0.35).convert("RGB")


# ---------- ground truth ----------


def fmt(v: Decimal) -> str:
    return f"{v:.2f}"


def truth(s: Spec) -> dict[str, dict]:
    containers_pl = [cn for cn, _ in s.containers]
    containers_bl = [cn for cn, _ in (s.bl_containers or s.containers)]
    return {
        "invoice": {
            "header": {
                "supplier_name": s.supplier.name,
                "supplier_country": s.supplier.country,
                "buyer_name": s.importer.name,
                "invoice_number": s.invoice_no,
                "invoice_date": s.invoice_date,
                "currency": s.currency,
                "incoterm": s.incoterm,
                "incoterm_place": s.incoterm_place,
                "country_of_origin": s.origin,
                "invoice_total": fmt(s.invoice_total_printed or s.total),
                "total_packages": str(s.packages),
                "total_net_weight_kg": fmt(s.net_kg),
                "total_gross_weight_kg": fmt(s.invoice_gross_printed or s.gross_kg),
            },
            "lines": [
                {
                    "description": ln.description,
                    "hsn": ln.hsn,
                    "quantity": str(ln.qty),
                    "unit": ln.unit,
                    "unit_price": fmt(ln.unit_price),
                    "amount": fmt(ln.amount),
                }
                for ln in s.lines
            ],
        },
        "packing_list": {
            "header": {
                "invoice_reference": s.pl_invoice_ref or s.invoice_no,
                "total_packages": str(s.packages),
                "package_type": s.package_type,
                "total_net_weight_kg": fmt(s.net_kg),
                "total_gross_weight_kg": fmt(s.gross_kg),
                "container_numbers": "; ".join(containers_pl),
                "marks": s.marks,
            },
            "lines": [
                {
                    "description": ln.description,
                    "quantity": str(ln.qty),
                    "packages": str(ln.packages),
                    "net_weight_kg": fmt(ln.net_kg),
                    "gross_weight_kg": fmt(ln.gross_kg),
                }
                for ln in s.lines
            ],
        },
        "bill_of_lading": {
            "header": {
                "bl_number": s.bl_no,
                "shipper_name": s.supplier.name,
                "consignee_name": s.importer.name,
                "vessel": s.vessel,
                "voyage": s.voyage,
                "port_of_loading": s.port_of_loading,
                "port_of_discharge": s.port_of_discharge,
                "container_numbers": "; ".join(containers_bl),
                "seal_numbers": "; ".join(seal for _, seal in (s.bl_containers or s.containers)),
                "total_packages": str(s.bl_packages if s.bl_packages is not None else s.packages),
                "package_type": s.package_type,
                "total_gross_weight_kg": fmt(s.bl_gross or s.gross_kg),
            },
            "lines": [],
        },
    }


def main() -> None:
    for i, s in enumerate(SPECS):
        folder = OUT / s.ref
        folder.mkdir(parents=True, exist_ok=True)
        t = truth(s)
        for doc_type, render in (
            ("invoice", invoice),
            ("packing_list", packing_list),
            ("bill_of_lading", bill_of_lading),
        ):
            path = folder / f"{doc_type}.pdf"
            if doc_type in s.omit:
                path.unlink(missing_ok=True)
                t.pop(doc_type)
                continue
            img = render(s).img
            img = illegible(img) if doc_type in s.unreadable else scanned(img, s.scan, i)
            img.save(path, "PDF", resolution=150, quality=72)
        t["_meta"] = {
            "faults": s.faults,
            "unreadable": sorted(s.unreadable),
            "scan": s.scan,
            "bilingual": s.bilingual,
        }
        (folder / "truth.json").write_text(json.dumps(t, indent=2, ensure_ascii=False) + "\n")
        print(f"{s.ref}: {', '.join(p.name for p in sorted(folder.glob('*.pdf')))}")


if __name__ == "__main__":
    main()
