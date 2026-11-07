// Every word and number on the landing page lives here, so copy is edited in one place.
// Sources: README.md, docs/PRD.md, docs/TDD.md and api/app/checks/rules.py. Mock values come from
// the synthetic shipment in sample-docs/SHP-24817 (all companies are fictional).

export const links = {
  demo: "https://16-179-13-144.sslip.io",
  repo: "https://github.com/priyanshu14077/veridoc",
  tdd: "https://github.com/priyanshu14077/veridoc/blob/master/docs/TDD.md",
  prd: "https://github.com/priyanshu14077/veridoc/blob/master/docs/PRD.md",
  deployment: "https://github.com/priyanshu14077/veridoc/blob/master/docs/deployment.md",
  observability: "https://github.com/priyanshu14077/veridoc/blob/master/docs/observability.md",
};

export const nav = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#cross-checks", label: "Cross-checks" },
  { href: "#security", label: "Security" },
  { href: "#demo", label: "Demo" },
];

export const hero = {
  eyebrow: "For customs documentation teams",
  title: "Three documents in. One clean Bill of Entry file out.",
  tagline: "AI does the typing. Rules do the checking. A person signs off.",
  sub: "Invoice, packing list and bill of lading go in. Every field comes back with a confidence score, the three documents are checked against each other, and the review targets under 15 minutes instead of 45 minutes of retyping.",
};

export type MockField = { label: string; value: string; confidence: number };

export const review = {
  shipment: "SHP-24817",
  document: "Commercial invoice",
  invoiceNo: "ZS-2026-1219",
  supplier: "Company B Lighting Technology Co., Ltd.",
  buyer: "Company E Lighting Pvt Ltd",
  threshold: 0.85,
  // The one field below the threshold is index 4 (HSN code); it is highlighted on the page.
  flaggedIndex: 4,
  fields: [
    { label: "Supplier", value: "Company B Lighting Technology Co., Ltd.", confidence: 0.98 },
    { label: "Invoice no.", value: "ZS-2026-1219", confidence: 0.99 },
    { label: "Invoice date", value: "2026-10-20", confidence: 0.97 },
    { label: "Incoterm", value: "CFR Nhava Sheva", confidence: 0.96 },
    { label: "HSN code, line 1", value: "94054290", confidence: 0.71 },
    { label: "Invoice total", value: "USD 14,940.00", confidence: 0.95 },
  ] satisfies MockField[],
  line: { description: "LED high bay light 150W", hsn: "94054290", qty: "600 PCS", price: "24.90", amount: "14,940.00" },
};

export const problem = {
  title: "The client's situation today",
  intro:
    "A customs broker at Nhava Sheva. A documentation team of 14 retypes importer PDFs into a checklist, then into the customs filing software.",
  stats: [
    { value: "1,100", unit: "shipments a month", note: "Each with an invoice, a packing list and a bill of lading." },
    { value: "45 min", unit: "of retyping each", note: "₹34.65 lakh a year in data-entry time." },
    { value: "3%", unit: "error rate", note: "Errors force amended Bills of Entry or port delays: ₹35.64 lakh a year." },
  ],
  total: "₹70.29 lakh a year",
  totalNote: "Combined cost of retyping and errors, from the client's figures (PRD §1).",
};

export const steps = [
  {
    n: "01",
    title: "Upload",
    body: "Drop the invoice, packing list and B/L. The server checks the real file type by its magic bytes, ≤ 15 MB and ≤ 10 pages.",
  },
  {
    n: "02",
    title: "Extract",
    body: "A vision model returns every field with a confidence score, its page and, where available, its box on the page.",
  },
  {
    n: "03",
    title: "Cross-check",
    body: "Rules X1–X10 compare the three documents: totals, quantities, packages, weights, containers, parties.",
  },
  {
    n: "04",
    title: "Review & export",
    body: "The export gate stays shut until every flag is cleared, then writes a versioned CSV.",
  },
];

export type Rule = { id: string; title: string; docs: string; tolerance: string };

// Titles are the exact rule names in api/app/checks/rules.py; tolerances from PRD §8.3.
export const rules: Rule[] = [
  { id: "X1", title: "Invoice total = sum of lines", docs: "Invoice", tolerance: "±0.01" },
  { id: "X2", title: "Line amount = quantity × unit price", docs: "Invoice", tolerance: "±0.01 per line" },
  { id: "X3", title: "Quantities match, invoice ↔ packing list", docs: "Invoice ↔ PL", tolerance: "exact" },
  { id: "X4", title: "Package count, packing list ↔ B/L", docs: "PL ↔ B/L", tolerance: "exact" },
  { id: "X5", title: "Gross weight across documents", docs: "PL ↔ B/L ↔ invoice", tolerance: "±0.5% or 5 kg" },
  { id: "X6", title: "Net weight ≤ gross weight", docs: "PL", tolerance: "n/a" },
  { id: "X7", title: "Container numbers, packing list ↔ B/L", docs: "PL ↔ B/L", tolerance: "exact set" },
  { id: "X8", title: "Same importer on every document", docs: "All three", tolerance: "fuzzy ≥ 0.85" },
  { id: "X9", title: "Packing list quotes the invoice number", docs: "Invoice ↔ PL", tolerance: "exact" },
  { id: "X10", title: "Line gross weights = total gross weight", docs: "PL", tolerance: "±0.5% or 5 kg" },
];

export const failing = {
  id: "X4",
  message: "Packing list says 150 packages, B/L says 148",
  values: [
    { label: "Total packages (packing list)", value: "150" },
    { label: "Total packages (B/L)", value: "148" },
  ],
  reason: "2 cartons short-shipped; carrier note on file",
  edited: "Packing list total edited 150 → 152",
};

export const crossChecks = {
  title: "Ten rules check the documents against each other",
  intro:
    "Deterministic code, no AI: decimal arithmetic, fixed tolerances, unit tests for each rule. A rule with a missing input is “not checkable”, which counts as a flag, never a pass.",
  lapse:
    "An acceptance lapses if any value it covered changes later, so nobody can wave a mismatch through and then edit the number.",
};

export const flags = {
  title: "What counts as a flag",
  intro: "Export unlocks only when none of these is left on the shipment.",
  items: [
    "A low-confidence field nobody has confirmed",
    "A required field that is still empty",
    "A failed or not-checkable cross-check without a valid acceptance",
    "A document whose extraction failed or hasn't finished",
  ],
};

export const team = [
  {
    role: "Executive",
    summary: "Clears the flags and exports.",
    points: [
      "Sees their own shipments plus the unassigned pool",
      "Keyboard review: J / K for the next flag, Enter to confirm, E to edit",
      "Edit history on every field: who, when, old and new value",
      "Accepts a mismatch only with a written reason",
    ],
  },
  {
    role: "Manager",
    summary: "Reviews after the fact, with the power to reopen.",
    points: [
      "Sees every shipment",
      "Reopens an exported shipment with a reason; re-export creates the next version",
      "Overrides log: accepted mismatches, corrections and reopens",
      "Accuracy report by field and by supplier",
    ],
  },
];

export const fits = {
  title: "Fits what they already use",
  body: "The export is a CSV in a documented layout that the broker's existing customs filing software imports. No migration and no new filing tool. The layout lives in one module, so it can be swapped for the software's exact import format.",
  versions: ["v1", "v2", "v3"],
  versionNote: "Every export is kept with its version, file hash and author.",
};

export const security = [
  { title: "Sessions", body: "argon2id password hashes. 32-byte session tokens, stored only as SHA-256 hashes." },
  { title: "CSRF", body: "SameSite cookies plus an Origin allow-list on every state-changing request." },
  { title: "Access control", body: "Out-of-scope shipments return 404, so their existence isn't revealed." },
  { title: "Personal data", body: "Importer contacts masked by default; every reveal is audited (DPDP Act 2023)." },
  { title: "Audit log", body: "Append-only: edits, confirmations, acceptances, exports, reopens and reveals." },
  { title: "AI and data", body: "The demo runs on synthetic documents only. Production targets Vertex AI in an Indian region." },
];

export const targets = {
  title: "What we're aiming for",
  note: "These are the client's targets, not measured results.",
  items: [
    { value: "< 15 min", label: "entry time per shipment", from: "down from 45 minutes" },
    { value: "95%", label: "field accuracy", from: "measured on 200 past shipments" },
    { value: "−50%", label: "amended Bills of Entry", from: "halved within 3 months" },
  ],
};

export const demo = {
  title: "See it on real-looking shipments.",
  body: "Twelve synthetic shipments with real-looking documents, flags and cross-checks. Sign in as the manager to see everything, including the overrides log and the accuracy report.",
  email: "anil.manager@veridoc.demo",
  password: "veridoc-demo",
  note: "All data is synthetic. All people and companies in the demo are fictional.",
};
