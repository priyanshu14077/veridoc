"""Score recorded extractions against ground truth (TDD §5.6).

    uv run python scripts/eval.py            # summary + threshold sweep
    uv run python scripts/eval.py --misses   # also list every wrong field

Both sides go through the same normaliser, so "3,165.00 KGS" and "3165.00" compare equal.
Documents rendered unreadable on purpose are excluded from accuracy (they go to manual entry);
the script checks they were routed to manual instead.
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.extraction.catalog import HEADER, LINES  # noqa: E402
from app.extraction.confidence import score  # noqa: E402
from app.extraction.gemini import response_model  # noqa: E402
from app.extraction.normalize import normalize_party  # noqa: E402
from app.extraction.pipeline import is_unreadable  # noqa: E402
from app.extraction.validators import normalize_and_validate  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "sample-docs"
COUNTRY = {
    "SHP-24811": "China",
    "SHP-24812": "Sweden",
    "SHP-24813": "Vietnam",
    "SHP-24814": "China",
    "SHP-24815": "Germany",
    "SHP-24816": "Vietnam",
    "SHP-24817": "China",
    "SHP-24818": "Sweden",
    "SHP-24819": "Germany",
    "SHP-24820": "Vietnam",
    "SHP-24821": "Sweden",
    "SHP-24822": "China",
}


def canon(kind: str, raw: str | None, country: str | None) -> object:
    if raw is None or not str(raw).strip():
        return None
    if kind == "text":
        return normalize_party(str(raw))
    norm, errs = normalize_and_validate(kind, str(raw), country)
    return norm if norm is not None else str(raw).strip().lower()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--misses", action="store_true")
    args = ap.parse_args()
    rows = []  # (field_label, correct, confidence)
    manual_ok, manual_total = 0, 0
    misses = []
    for rec_path in sorted(DOCS.glob("SHP-*/*.extraction.json")):
        ref, doc_type = rec_path.parent.name, rec_path.name.split(".")[0]
        truth_all = json.loads((rec_path.parent / "truth.json").read_text())
        country = COUNTRY.get(ref)
        rec = json.loads(rec_path.read_text())
        parsed = response_model(doc_type).model_validate(rec["response"])
        if doc_type in truth_all["_meta"]["unreadable"]:
            manual_total += 1
            manual_ok += is_unreadable(parsed, doc_type)
            continue
        truth = truth_all[doc_type]
        pairs = [
            (fd, getattr(parsed, fd.key), truth["header"].get(fd.key), None)
            for fd in HEADER[doc_type]
        ]
        got_lines = list(getattr(parsed, "lines", []) or [])
        for i, tline in enumerate(truth["lines"]):
            gline = got_lines[i] if i < len(got_lines) else None
            pairs += [
                (fd, getattr(gline, fd.key) if gline else None, tline.get(fd.key), i)
                for fd in LINES[doc_type]
            ]
        for fd, item, expected, line in pairs:
            if expected is None and not fd.required:
                continue  # optional and not printed: nothing to score
            got = item.value if item else None
            _, errs = normalize_and_validate(fd.kind, got, country)
            conf = score(item.confidence if item else None, got, fd.required, errs)
            ok = canon(fd.kind, got, country) == canon(fd.kind, expected, country)
            label = f"{doc_type}.{'line.' if line is not None else ''}{fd.key}"
            rows.append((label, ok, conf))
            if not ok:
                misses.append((ref, label, expected, got, conf))

    n = len(rows)
    correct = sum(ok for _, ok, _ in rows)
    print(
        f"Documents scored: {len(list(DOCS.glob('SHP-*/*.extraction.json'))) - manual_total}"
        f"   fields: {n}"
    )
    print(f"Field accuracy: {correct}/{n} = {correct / n:.1%}")
    print(f"Unreadable documents routed to manual entry: {manual_ok}/{manual_total}\n")

    print("Threshold sweep (a field is flagged when confidence < threshold)")
    print(f"{'threshold':>9} {'flagged':>8} {'flag recall':>12} {'unflagged errors':>17}")
    wrong = [r for r in rows if not r[1]]
    for t in (0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98):
        flagged = sum(c < t for _, _, c in rows)
        caught = sum(c < t for _, _, c in wrong)
        recall = caught / len(wrong) if wrong else 1.0
        unflagged = (len(wrong) - caught) / n
        print(f"{t:>9.2f} {flagged:>8} {recall:>12.0%} {unflagged:>16.2%}")

    by_field: dict[str, list[bool]] = defaultdict(list)
    for label, ok, _ in rows:
        by_field[label].append(ok)
    weak = sorted((sum(v) / len(v), k, len(v)) for k, v in by_field.items() if not all(v))
    if weak:
        print("\nFields with misses:")
        for acc, k, cnt in weak:
            print(f"  {k:<40} {acc:.0%} of {cnt}")
    if args.misses:
        print("\nMisses (ref, field, expected, got, confidence):")
        for m in misses:
            print("  ", *m)


if __name__ == "__main__":
    main()
