// Every word and number on the landing page lives here, so copy is edited in one place.
// Sources: README.md, docs/PRD.md, docs/TDD.md, api/app/checks/rules.py, api/app/config.py and the
// app's own labels in web/src. Mock values come from the synthetic shipments in api/app/seed.py and
// sample-docs/ (all people and companies are fictional).

// Where the app lives. In production Caddy serves the landing page and the app on one address, so
// the Docker build sets NEXT_PUBLIC_APP_URL="" and links are same-site (/login, /api/health).
// In local development (`npm run dev`) they point at the live server.
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://16-179-13-144.sslip.io";
/** True when the landing page is served by the app's own Caddy (same origin). */
export const sameOrigin = APP === "";

export const links = {
  demo: `${APP}/login`,
  health: `${APP}/api/health`,
  repo: "https://github.com/priyanshu14077/veridoc",
  tdd: "https://github.com/priyanshu14077/veridoc/blob/master/docs/TDD.md",
  prd: "https://github.com/priyanshu14077/veridoc/blob/master/docs/PRD.md",
  deployment: "https://github.com/priyanshu14077/veridoc/blob/master/docs/deployment.md",
  observability: "https://github.com/priyanshu14077/veridoc/blob/master/docs/observability.md",
};

export const nav = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

/** Two-tone headings: [first line in ink, second line in muted ink]. */
export type Title = [string, string];

export const hero = {
  chipLabel: "New",
  chip: "Ten cross-document rules on every shipment",
  title: ["Three documents in.", "One clean Bill of Entry file out."] as Title,
  sub: "Veridoc reads the invoice, packing list and bill of lading, scores every field, checks the three against each other, and hands your team a short list to confirm instead of 45 minutes of retyping.",
  note: "Exports a CSV for the filing software you already use.",
};

// The hero queue: synthetic shipments from api/app/seed.py with their importer and supplier.
export type Status = "draft" | "extracting" | "needs_review" | "cleared" | "exported";
export const queue: { ref: string; importer: string; supplier: string; status: Status; flags: number; ago: string }[] = [
  { ref: "SHP-24814", importer: "Company E Lighting", supplier: "Company B · China", status: "needs_review", flags: 1, ago: "4m" },
  { ref: "SHP-24812", importer: "Company F Flow Controls", supplier: "Company C · Sweden", status: "cleared", flags: 0, ago: "12m" },
  { ref: "SHP-24813", importer: "Company G Packaging", supplier: "Company J · Vietnam", status: "needs_review", flags: 1, ago: "26m" },
  { ref: "SHP-24816", importer: "Company G Packaging", supplier: "Company J · Vietnam", status: "exported", flags: 0, ago: "1h" },
  { ref: "SHP-24815", importer: "Company F Flow Controls", supplier: "Company H · Germany", status: "needs_review", flags: 2, ago: "2h" },
];
// The shipment that arrives at the top of the queue and is worked through on screen.
export const live = {
  ref: "SHP-24817",
  importer: "Company E Lighting",
  supplier: "Company B · China",
  docs: ["Commercial invoice", "Packing list", "Bill of lading"],
  threshold: 0.85,
  flaggedIndex: 4,
  fields: [
    { label: "Supplier", value: "Company B Lighting Technology Co., Ltd.", confidence: 0.98 },
    { label: "Invoice no.", value: "ZS-2026-1219", confidence: 0.99 },
    { label: "Invoice date", value: "2026-10-20", confidence: 0.97 },
    { label: "Incoterm", value: "CFR Nhava Sheva", confidence: 0.96 },
    { label: "Invoice total", value: "14,940.00", confidence: 0.62 },
    { label: "HSN, line 1", value: "94054290", confidence: 0.95 },
  ],
  // In the sample, a stamp covers the invoice total, so it reads with low confidence.
  flagReason: "The AI wasn't sure (62%). Check it against the document.",
  confirmedBy: "Meera Iyer",
};

// Scrolling strip: what Veridoc reads. Used where other pages put customer logos (we have none to show).
export const reads = [
  "Commercial invoice", "Packing list", "Bill of lading", "HSN code", "Invoice total", "Incoterm",
  "Gross weight", "Net weight", "Package count", "Container no.", "Seal no.", "Vessel & voyage",
  "Port of loading", "Importer IEC", "Line items", "Country of origin",
];

export const problem = {
  eyebrow: "The problem",
  title: ["Fourteen people retyping PDFs.", "Every shipment, every day."] as Title,
  intro:
    "The client is a customs broker at Nhava Sheva. Their documentation team retypes importer PDFs into a checklist, then into the customs filing software.",
  stats: [
    { value: "1,100", unit: "shipments a month", note: "Each with an invoice, a packing list and a bill of lading." },
    { value: "45 min", unit: "of retyping each", note: "₹34.65 lakh a year in data-entry time." },
    { value: "3%", unit: "error rate", note: "Errors force amended Bills of Entry or port delays: ₹35.64 lakh a year." },
  ],
  total: "₹70.29 lakh a year",
  totalNote: "Combined cost of retyping and errors, from the client's figures (PRD §1).",
};

export const how = {
  eyebrow: "How it works",
  title: ["Four steps,", "and a person signs off on the last one."] as Title,
  steps: [
    { title: "Upload", body: "Drop the three PDFs. The server checks the real file type, ≤ 15 MB and ≤ 10 pages." },
    { title: "Extract", body: "A vision model returns every field with a confidence score and its place on the page." },
    { title: "Cross-check", body: "Rules X1–X10 compare totals, quantities, packages, weights, containers and parties." },
    { title: "Review & export", body: "Export stays blocked until every flag is cleared, then writes a versioned CSV." },
  ],
};

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

// SHP-24814 in the seed data: the packing list says 320 cartons, the B/L 318.
export const failing = {
  id: "X4",
  title: "Package count, packing list ↔ B/L",
  message: "Packing list says 320 cartons, B/L says 318",
  values: [
    { label: "Total packages (packing list)", value: "320" },
    { label: "Total packages (B/L)", value: "318" },
  ],
  reason: "2 cartons short-shipped; carrier note on file",
  edited: { from: "320", to: "322" },
};

export const story = {
  eyebrow: "Why Veridoc",
  title: ["The AI types.", "Rules check. People decide."] as Title,
  steps: [
    {
      title: "Every field comes back with a confidence score",
      body: "Anything under 85% is flagged and the box on the page shows exactly where to look. One keystroke confirms it; the edit history records who did.",
    },
    {
      title: "The three documents are checked against each other",
      body: "Deterministic code, not AI: decimal arithmetic and fixed tolerances. A mismatch can be accepted only with a written reason, and the acceptance lapses if any value it covered changes later.",
    },
    {
      title: "Export unlocks only when nothing is left open",
      body: "Unconfirmed flags, empty required fields, open conflicts and unfinished documents all block it. Each export is kept as a version with its hash and author.",
    },
  ],
  gate: [
    "A low-confidence field nobody has confirmed",
    "A required field that is still empty",
    "A conflict or can't-check rule without a valid acceptance",
    "A document still reading or failed",
  ],
};

export type TourTab = {
  id: string;
  label: string;
  role: "Executive" | "Manager" | "Both";
  title: string;
  points: { title: string; body: string }[];
};
export const tour = {
  eyebrow: "The product",
  title: ["One screen per job.", "Nothing your team has to learn twice."] as Title,
  tabs: [
    {
      id: "queue",
      label: "Shipments",
      role: "Both",
      title: "Every shipment, sorted by what needs a person.",
      points: [
        { title: "Status at a glance", body: "Needs review, extracting, cleared, exported, with open flags counted per row." },
        { title: "Your work first", body: "Executives see their shipments plus the unassigned pool; managers see everything." },
        { title: "Find it fast", body: "Search by ref, importer or supplier; filter by assignee." },
      ],
    },
    {
      id: "review",
      label: "Document review",
      role: "Executive",
      title: "The page and its fields, side by side.",
      points: [
        { title: "Next flag, not next field", body: "J and K jump between flags, Enter confirms, E edits." },
        { title: "Shows where it read it", body: "The field's box is highlighted on the page." },
        { title: "Nothing silently changes", body: "Every edit keeps the AI's read, the new value, who and when." },
      ],
    },
    {
      id: "checks",
      label: "Cross-checks",
      role: "Executive",
      title: "Ten rules, with the values that disagree.",
      points: [
        { title: "Shows the numbers", body: "Each conflict lists the values from each document and the allowed difference." },
        { title: "Fix or explain", body: "Correct the value that's wrong, or accept the mismatch with a written reason." },
        { title: "Missing input is a flag", body: "A rule that can't be checked never counts as a pass." },
      ],
    },
    {
      id: "overrides",
      label: "Overrides log",
      role: "Manager",
      title: "Every judgement call, in one list.",
      points: [
        { title: "Accepted, corrected, reopened", body: "With who did it, when and the reason they gave." },
        { title: "Review after the fact", body: "Executives export on their own; this is where a manager checks their calls." },
        { title: "Reopen with a reason", body: "Re-export creates the next CSV version; earlier ones stay downloadable." },
      ],
    },
    {
      id: "accuracy",
      label: "Accuracy",
      role: "Manager",
      title: "Where the AI is right, and where it isn't yet.",
      points: [
        { title: "Measured on exported work", body: "The share of AI-read values people left unchanged, against the 95% target." },
        { title: "By field and by supplier", body: "Worst first, with examples of what was corrected." },
        { title: "Misses the flags didn't catch", body: "Corrections on fields that scored above the threshold." },
      ],
    },
  ] satisfies TourTab[],
};

export const security = {
  eyebrow: "Security & privacy",
  title: ["Built for documents that carry", "duty, prices and personal data."] as Title,
  items: [
    { title: "Sessions", body: "argon2id password hashes. 32-byte session tokens, stored only as SHA-256 hashes." },
    { title: "CSRF", body: "SameSite cookies plus an Origin allow-list on every state-changing request." },
    { title: "Access control", body: "Out-of-scope shipments return 404, so their existence isn't revealed." },
    { title: "Personal data", body: "Importer contacts masked by default; every reveal is audited (DPDP Act 2023)." },
    { title: "Audit log", body: "Append-only: edits, confirmations, acceptances, exports, reopens and reveals." },
    { title: "AI and data", body: "The demo runs on synthetic documents only. Production targets Vertex AI in an Indian region." },
  ],
};

export const targets = {
  eyebrow: "What we're aiming for",
  title: ["From 45 minutes of typing", "to 15 minutes of checking."] as Title,
  statement:
    "The goal isn't to remove people from customs filing. It's to stop them retyping what a machine can read, and point their attention at the few fields that need it.",
  note: "These are the client's targets, not measured results.",
  items: [
    // countFrom: where the number ticks from on screen (today's 45 minutes counts down to 15).
    { value: "< 15 min", label: "entry time per shipment", from: "down from 45 minutes", countFrom: 45 },
    { value: "95%", label: "field accuracy", from: "measured on 200 past shipments", countFrom: 0 },
    { value: "−50%", label: "amended Bills of Entry", from: "halved within 3 months", countFrom: 0 },
  ],
};

export const faq = {
  eyebrow: "Questions",
  title: ["Fair questions.", "Straight answers."] as Title,
  items: [
    {
      q: "Is it fully automated?",
      a: "No, and it isn't meant to be. The AI does the typing and the rules do the checking, but a person confirms every flagged field and nothing exports until they have.",
    },
    {
      q: "What happens when the AI reads something wrong?",
      a: "Low-confidence fields are flagged for a person. Fields it was confident about can still be edited; every change keeps the original read, and the accuracy report tracks how often confident reads were corrected.",
    },
    {
      q: "Can someone just wave a mismatch through?",
      a: "Only with a written reason, which goes to the manager's overrides log. If any value the acceptance covered changes later, the acceptance lapses and the rule is flagged again.",
    },
    {
      q: "What does the export look like?",
      a: "A CSV with a header row and one row per invoice line, in a documented layout. The layout lives in one module, so it can be matched to the filing software's exact import format.",
    },
    {
      q: "Where does the data go?",
      a: "The demo uses synthetic documents only. Production targets Vertex AI in an Indian region; importer contacts are masked by default and every reveal is audited.",
    },
    {
      q: "Do we have to change our filing software?",
      a: "No. Veridoc produces the file your existing software imports. There is nothing to migrate.",
    },
  ],
};

export const demo = {
  title: ["See it on twelve", "real-looking shipments."] as Title,
  body: "Synthetic documents with real-looking flags and cross-checks. Sign in as the manager to see everything, including the overrides log and the accuracy report.",
  email: "anil.manager@veridoc.demo",
  password: "veridoc-demo",
  note: "All data is synthetic. All people and companies in the demo are fictional.",
};

export const footer = {
  marquee: ["Invoice read", "Fields scored", "Rules checked", "Flags confirmed", "CSV exported"],
  giantText: "VERIDOC",
  heading: "Ready to see it?",
  primary: [
    { label: "Try the live demo", href: links.demo },
    { label: "Read the technical design", href: links.tdd },
  ],
  secondary: [
    { label: "Product requirements", href: links.prd },
    { label: "Deployment", href: links.deployment },
    { label: "Observability", href: links.observability },
    { label: "GitHub", href: links.repo },
  ],
  note: "All data is synthetic. All people and companies in the demo are fictional.",
  author: "Priyanshu Kumar",
};
