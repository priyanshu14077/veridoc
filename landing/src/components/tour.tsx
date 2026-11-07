"use client";

import {
  AlertTriangle, CheckCircle2, ChevronDown, FileSearch, LayoutList, ListChecks, PencilLine, RotateCcw,
  Search, ShieldCheck, Target, TriangleAlert, XCircle,
} from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { failing, links, live, queue, rules, tour } from "@/content";
import { Backdrop } from "./backdrop";
import { AppWindow, ButtonLink, Kbd, Section, SectionHeader, StatusChip } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;
const ICONS = [LayoutList, FileSearch, ListChecks, ShieldCheck, Target];
const AUTO_MS = 7000;

export function Tour() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true); // stops for good once someone picks a tab
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { amount: 0.4 });
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const running = auto && !paused && inView && !reduce;
  const tab = tour.tabs[index];

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % tour.tabs.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [running, index]);

  const pick = (i: number, focus = false) => {
    setAuto(false);
    setIndex(i);
    if (focus) tabs.current[i]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const n = tour.tabs.length;
    if (e.key === "ArrowRight") pick((index + 1) % n, true);
    else if (e.key === "ArrowLeft") pick((index - 1 + n) % n, true);
    else if (e.key === "Home") pick(0, true);
    else if (e.key === "End") pick(n - 1, true);
    else return;
    e.preventDefault();
  };

  return (
    <Section id="product" labelledBy="tour-title">
      <SectionHeader id="tour-title" eyebrow={tour.eyebrow} title={tour.title} />
      <div
        ref={wrap}
        className="reveal mt-14 rounded-2xl border border-line bg-surface p-2"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div role="tablist" aria-label="Product screens" onKeyDown={onKey} className="flex gap-1 overflow-x-auto rounded-xl bg-paper p-1 [scrollbar-width:none]">
          {tour.tabs.map((t, i) => {
            const Icon = ICONS[i];
            const on = i === index;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(i)}
                className={`relative flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-sm whitespace-nowrap transition-colors duration-300 ${
                  on ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {on && (
                  <motion.span
                    layoutId="tour-tab"
                    className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 36 }}
                  />
                )}
                <Icon aria-hidden className="relative size-4" />
                <span className="relative">{t.label}</span>
                {on && running && (
                  <motion.span
                    key={`${index}-p`}
                    aria-hidden
                    className="absolute inset-x-3 bottom-1 h-px origin-left bg-accent"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: AUTO_MS / 1000, ease: "linear" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className="flex flex-col rounded-xl bg-paper p-6 sm:p-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }}>
                <span className="inline-flex rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-xs text-ink-2">
                  {tab.role === "Both" ? "Executives and managers" : `For the ${tab.role.toLowerCase()}`}
                </span>
                <h3 className="display mt-5 text-3xl text-ink">{tab.title}</h3>
                <ul className="mt-6 space-y-4">
                  {tab.points.map((p) => (
                    <li key={p.title} className="flex gap-3">
                      <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                      <span className="text-sm leading-relaxed">
                        <span className="font-medium text-ink">{p.title}</span>
                        <span className="block text-muted">{p.body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
            <div className="mt-auto pt-8">
              <ButtonLink href={links.demo} external variant="secondary" className="w-full">
                Open it in the demo
              </ButtonLink>
            </div>
          </div>

          <Backdrop image="velvex" position="50% 35%" className="min-h-[440px] rounded-xl sm:min-h-[500px]">
            <div className="absolute inset-x-3 top-6 sm:left-8 sm:right-auto sm:top-10 sm:w-[115%] lg:w-[108%]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab.id}
                  initial={{ opacity: 0, y: 30, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.985 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <Screen id={tab.id} />
                </motion.div>
              </AnimatePresence>
            </div>
            <p className="absolute bottom-3 right-4 rounded-full bg-black/40 px-2.5 py-0.5 text-[11px] text-white/80 backdrop-blur">
              Recreated from the app · synthetic, illustrative data
            </p>
          </Backdrop>
        </div>
      </div>
    </Section>
  );
}

function Screen({ id }: { id: string }) {
  const label = {
    queue: "Shipments list: status tabs, search, and a table of shipments with their status and open flags.",
    review: "Document review: the invoice page with the flagged value boxed, beside its fields and confidence scores.",
    checks: "Cross-checks: one open conflict on rule X4 with the values that disagree, and nine passing rules.",
    overrides: "Overrides log: accepted mismatches, corrected values and reopens, with who, when and why.",
    accuracy: "Accuracy report: values left unchanged against the 95% target, by field.",
  }[id];
  return (
    <div role="img" aria-label={`${label} Synthetic demo data.`}>
      <AppWindow title={<>Veridoc <span className="font-normal text-muted">/ {tour.tabs.find((t) => t.id === id)?.label}</span></>}>
        <div aria-hidden className="text-[12px]">
          {id === "queue" && <QueueScreen />}
          {id === "review" && <ReviewScreen />}
          {id === "checks" && <ChecksScreen />}
          {id === "overrides" && <OverridesScreen />}
          {id === "accuracy" && <AccuracyScreen />}
        </div>
      </AppWindow>
    </div>
  );
}

const row = {
  initial: { opacity: 0, x: -8 },
  animate: (i: number) => ({ opacity: 1, x: 0, transition: { delay: 0.15 + i * 0.06, duration: 0.4, ease: EASE } }),
};

function QueueScreen() {
  const rows = [
    { ref: live.ref, importer: live.importer, supplier: live.supplier, status: "needs_review" as const, flags: 1, ago: "just now" },
    ...queue.map((q) => ({ ...q, ago: `${q.ago} ago` })),
  ];
  const tabs: [string, number][] = [["All", 12], ["Needs review", 6], ["Extracting", 0], ["Cleared", 2], ["Exported", 4]];
  return (
    <div className="p-4">
      <p className="text-base font-semibold tracking-tight">Shipments</p>
      <p className="text-[11px] text-muted">Every shipment across the team.</p>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {tabs.map(([t, n], i) => (
          <span key={t} className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 ${i === 1 ? "bg-ink text-white" : "text-ink-2"}`}>
            {t} <span className={`mono text-[10px] ${i === 1 ? "text-white/70" : "text-muted"}`}>{n}</span>
          </span>
        ))}
        <span className="ml-auto hidden h-7 w-44 items-center gap-1.5 rounded-md border border-line-strong px-2 text-muted sm:flex">
          <Search className="size-3" /> Ref, importer or supplier
        </span>
      </div>
      <table className="mt-3 w-full text-left">
        <thead className="border-b border-line text-[11px] text-muted">
          <tr>
            <th className="py-2 pr-3 font-medium">Shipment</th>
            <th className="hidden py-2 pr-3 font-medium sm:table-cell">Supplier</th>
            <th className="py-2 pr-3 font-medium">Importer</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 text-center font-medium">Flags</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <motion.tr key={r.ref} custom={i} variants={row} initial="initial" animate="animate" className={`h-10 border-b border-line ${i === 0 ? "bg-accent-soft/50" : ""}`}>
              <td className="mono pr-3 font-medium">{r.ref}</td>
              <td className="hidden pr-3 sm:table-cell">
                {r.supplier.split(" · ")[0]} <span className="text-muted">· {r.supplier.split(" · ")[1]}</span>
              </td>
              <td className="max-w-32 truncate pr-3 text-ink-2">{r.importer}</td>
              <td className="pr-3"><StatusChip status={r.status} small /></td>
              <td className="pr-3 text-center">
                {r.flags ? <span className="mono rounded-full bg-unsure-soft px-1.5 text-[10px] text-unsure">{r.flags}</span> : <span className="text-muted">—</span>}
              </td>
              <td className="hidden text-right text-muted sm:table-cell">{r.ago}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewScreen() {
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  // A J press every couple of seconds moves the focus between the two flags.
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setK((x) => (x + 1) % 2), 2200);
    return () => clearInterval(t);
  }, [reduce]);
  const fields = [
    { l: "Invoice no.", v: "ZS-2026-1219", c: 99 },
    { l: "Invoice date", v: "2026-10-20", c: 97 },
    { l: "Incoterm", v: "CFR", c: 96 },
    { l: "Invoice total", v: "14,940.00", c: 62, flag: 0 },
    { l: "Currency", v: "USD", c: 99 },
    { l: "Gross weight", v: "3,060.00", c: 81, flag: 1 },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[13px] font-semibold">Commercial invoice</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-unsure-soft px-2 py-0.5 text-[11px] font-medium text-unsure">
          <TriangleAlert className="size-3" /> 2 to check
        </span>
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted sm:flex">
          <Kbd down={k === 1}>J</Kbd> <Kbd>K</Kbd> next / previous flag · <Kbd>Enter</Kbd> confirm · <Kbd>E</Kbd> edit
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className="hidden bg-info-soft p-4 sm:block">
          <div className="rounded-sm bg-surface p-4 text-[10px] text-ink-2 shadow-sm">
            <div className="flex justify-between">
              <span className="font-semibold text-ink">Company B Lighting Technology Co., Ltd.</span>
              <span className="font-semibold tracking-wider">COMMERCIAL INVOICE</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-1">
              <span className="text-muted">Invoice no.</span><span className="mono">ZS-2026-1219</span>
              <span className="text-muted">Date</span><span className="mono">2026-10-20</span>
              <span className="text-muted">Terms</span><span>CFR Nhava Sheva</span>
            </div>
            <div className="mt-3 border-t border-line pt-2">
              <div className="flex justify-between"><span>LED high bay light 150W</span><span className="mono">600 PCS</span></div>
            </div>
            <div className="mt-3 flex justify-end gap-4">
              <span className="text-muted">Gross weight</span>
              <Boxed on={k === 1}>3,060.00 KG</Boxed>
            </div>
            <div className="mt-1 flex justify-end gap-4">
              <span className="text-muted">Total USD</span>
              <Boxed on={k === 0}>14,940.00</Boxed>
            </div>
            <div className="mt-4 space-y-1">
              <div className="h-1 w-2/3 rounded bg-line" />
              <div className="h-1 w-1/2 rounded bg-line" />
            </div>
          </div>
        </div>
        <div className="border-l border-line">
          <p className="border-b border-line px-3 py-1.5 text-[10px] font-medium tracking-wide text-muted uppercase">Document & totals</p>
          {fields.map((f) => {
            const activeRow = f.flag === k;
            return (
              <div
                key={f.l}
                className={`grid grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line px-3 py-2 transition-[background-color,box-shadow] duration-300 ${
                  f.flag !== undefined ? "bg-unsure-soft/60" : ""
                } ${activeRow ? "shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}
              >
                <span className="truncate text-muted">{f.l}</span>
                <span className="mono truncate">{f.v}</span>
                <span className={`mono flex items-center gap-1 text-[11px] ${f.flag !== undefined ? "text-unsure" : "text-muted"}`}>
                  {f.c}%{f.flag !== undefined && <TriangleAlert className="size-3" />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Boxed({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="relative font-mono font-semibold text-ink">
      <span className={`absolute -inset-x-1 -inset-y-0.5 rounded-[2px] bg-accent/10 ring-2 ring-accent ring-offset-1 transition-[opacity,transform] duration-500 ease-smooth ${on ? "scale-100 opacity-100" : "scale-125 opacity-0"}`} />
      <span className="relative">{children}</span>
    </span>
  );
}

function ChecksScreen() {
  const passing = rules.filter((r) => r.id !== failing.id);
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Cross-checks</span>
        <span className="text-[11px] text-muted">1 open · 9 of 10 pass</span>
      </div>
      <div className="mt-3 rounded-md border border-line p-3">
        <div className="flex items-center gap-2">
          <XCircle className="size-4 text-conflict" />
          <span className="font-medium">{failing.title}</span>
          <span className="mono text-[11px] text-muted">{failing.id}</span>
          <span className="text-[11px] font-medium text-conflict">Conflict</span>
        </div>
        <p className="mt-1 pl-6 text-ink-2">{failing.message}</p>
        <div className="mt-2 ml-6 space-y-1 rounded-md bg-paper px-3 py-1.5">
          {failing.values.map((v) => (
            <div key={v.label} className="flex justify-between gap-3">
              <span className="text-muted">{v.label}</span>
              <span className="mono text-accent underline decoration-accent/30">{v.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 ml-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-md border border-line-strong px-2 text-[11px] font-medium">Accept with reason</span>
          <span className="text-[11px] text-muted">or correct a value: click it above to open the document</span>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-2">
        <CheckCircle2 className="size-3.5 text-clear" /> 9 checks pass <ChevronDown className="size-3 text-muted" />
      </p>
      <ul className="mt-1.5 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {passing.map((r, i) => (
          <motion.li key={r.id} custom={i} variants={row} initial="initial" animate="animate" className="flex items-center gap-2 border-b border-line py-1.5">
            <CheckCircle2 className="size-3.5 shrink-0 text-clear" />
            <span className="mono w-7 text-[10px] text-muted">{r.id}</span>
            <span className="truncate text-ink-2">{r.title}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function OverridesScreen() {
  const entries = [
    { kind: "Accepted", Icon: ShieldCheck, when: "3 days ago · Meera Iyer", ref: "SHP-24814", subject: "X4 Package count, packing list ↔ B/L", detail: "320 vs 318 cartons", reason: `“${failing.reason}”` },
    { kind: "Corrected", Icon: PencilLine, when: "3 days ago · Rohan Desai", ref: "SHP-24817", subject: "Invoice total", detail: "14,490.00 → 14,940.00", reason: "No reason needed for a correction" },
    { kind: "Reopened", Icon: RotateCcw, when: "5 days ago · Anil Kulkarni", ref: "SHP-24816", subject: "Reopened for changes", detail: "Version 2 exported after", reason: "“Importer sent a revised packing list”" },
    { kind: "Accepted", Icon: ShieldCheck, when: "6 days ago · Meera Iyer", ref: "SHP-24811", subject: "X5 Gross weight across documents", detail: "3,120 vs 3,165 kg", reason: "“Invoice weight excludes pallets, per supplier email”", lapsed: true },
  ];
  const pills: [string, number][] = [["All", 4], ["Accepted mismatches", 2], ["Corrected values", 1], ["Reopens", 1]];
  return (
    <div className="p-4">
      <p className="text-base font-semibold tracking-tight">Overrides</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pills.map(([p, n], i) => (
          <span key={p} className={`rounded-full border px-2.5 py-0.5 ${i === 0 ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-2"}`}>
            {p} <span className="mono text-[10px] opacity-70">{n}</span>
          </span>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line">
        {entries.map((e, i) => (
          <motion.li key={i} custom={i} variants={row} initial="initial" animate="animate" className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[120px_80px_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
            <span>
              <span className="flex items-center gap-1.5 font-medium"><e.Icon className="size-3.5 text-muted" /> {e.kind}</span>
              <span className="text-[10px] text-muted">{e.when}</span>
            </span>
            <span className="mono text-accent">{e.ref}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{e.subject}</span>
              <span className="mono block truncate text-[11px] text-muted">{e.detail}</span>
            </span>
            <span className="min-w-0 text-[11px] text-ink-2">
              <span className="line-clamp-2">{e.reason}</span>
              {e.lapsed && <span className="mt-1 inline-block rounded bg-info-soft px-1.5 text-[10px] text-muted">No longer applies: the values changed after it was accepted</span>}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function AccuracyScreen() {
  const stats = [
    { l: "Left unchanged", v: "96.4%", n: "1,204 of 1,249 values" },
    { l: "Corrected by people", v: "45", n: "AI value changed" },
    { l: "Missed by the flags", v: "6", n: "Scored ≥ 0.85, never flagged", warn: true },
    { l: "Exported shipments", v: "4", n: "12 documents" },
  ];
  const fields = [
    { f: "Invoice total", p: 0.91, c: "2 / 22" },
    { f: "Gross weight", p: 0.93, c: "3 / 44" },
    { f: "HSN code", p: 0.97, c: "1 / 36" },
    { f: "Container no.", p: 0.98, c: "1 / 48" },
    { f: "Invoice no.", p: 1, c: "0 / 22" },
  ];
  return (
    <div className="p-4">
      <p className="text-base font-semibold tracking-tight">Accuracy</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-md border border-line px-3 py-2">
            <p className="text-[10px] text-muted">{s.l}</p>
            <p className={`mono text-lg font-semibold ${s.warn ? "text-unsure" : ""}`}>{s.v}</p>
            <p className="truncate text-[10px] text-muted">{s.n}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="flex gap-1">
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-surface">By field</span>
          <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-ink-2">By supplier</span>
        </span>
        <span className="text-[11px] text-muted">2 below target, worst first</span>
      </div>
      <ul className="mt-2">
        {fields.map((f, i) => {
          const below = f.p < 0.95;
          return (
            <li key={f.f} className="grid grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2">
              <span className="truncate">{f.f}</span>
              <span className="flex items-center gap-2">
                <span className="relative h-2 flex-1 rounded-full bg-info-soft">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full bg-ink-2"
                    initial={{ width: 0 }}
                    animate={{ width: `${f.p * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.08, duration: 0.8, ease: EASE }}
                  />
                  <span className="absolute -top-0.5 -bottom-0.5 left-[95%] w-px bg-ink" />
                </span>
                <span className="mono w-12 text-right text-[11px]">{(f.p * 100).toFixed(1)}%</span>
                <span className={`flex w-14 items-center gap-0.5 text-[10px] text-unsure ${below ? "" : "invisible"}`}>
                  <AlertTriangle className="size-3" /> Below
                </span>
              </span>
              <span className="mono text-[11px] text-muted">{f.c}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
