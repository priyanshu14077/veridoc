"use client";

import { Check, Download, FileUp, Lock } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { steps } from "@/content";
import { Section, SectionHeader } from "./ui";

export function HowItWorks() {
  const snippets = [<UploadSnippet key="u" />, <ExtractSnippet key="e" />, <CheckSnippet key="c" />, <ExportSnippet key="x" />];
  return (
    <Section id="how-it-works" labelledBy="how-title">
      <SectionHeader
        id="how-title"
        eyebrow="How it works"
        title="From three PDFs to a filed-ready CSV, with a person in the loop"
      />
      <ol className="relative mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.n} className="relative flex min-w-0 flex-col rounded-xl border border-line bg-surface">
            <div aria-hidden className="h-44 border-b border-line bg-surface-2/60 p-4">
              {snippets[i]}
            </div>
            <div className="p-5">
              <p className="mono text-xs text-accent">{s.n}</p>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Steps through 0..max once the snippet is on screen; jumps to max with reduced motion. */
function useStage(max: number, every = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    const timers = Array.from({ length: max }, (_, i) => setTimeout(() => setStage(i + 1), 300 + i * every));
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce, max, every]);
  return [ref, reduce ? max : stage] as const;
}

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };

function UploadSnippet() {
  const files = [
    ["invoice.pdf", "1.2 MB"],
    ["packing_list.pdf", "0.8 MB"],
    ["bill_of_lading.pdf", "0.6 MB"],
  ];
  const [ref, stage] = useStage(files.length);
  return (
    <div ref={ref} className="flex h-full flex-col rounded-lg border border-dashed border-line-strong p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <FileUp className="size-3.5" /> PDF, PNG or JPEG · ≤ 15 MB · ≤ 10 pages
      </p>
      <ul className="mt-3 space-y-1.5">
        {files.map(([name, size], i) =>
          i < stage ? (
            <motion.li key={name} {...fade} className="flex items-center justify-between rounded bg-surface px-2 py-1.5">
              <span className="mono truncate text-xs text-ink-2">{name}</span>
              <span className="flex items-center gap-1 text-[11px] text-clear">
                <Check className="size-3" /> {size}
              </span>
            </motion.li>
          ) : (
            <li key={name} className="h-[28px] rounded bg-surface/40" />
          ),
        )}
      </ul>
    </div>
  );
}

function ExtractSnippet() {
  const rows: [string, string, number][] = [
    ["Invoice no.", "ZS-2026-1219", 99],
    ["Total packages", "150", 97],
    ["Gross weight", "3,060.00 kg", 93],
    ["HSN code", "94054290", 71],
  ];
  const [ref, stage] = useStage(rows.length, 450);
  return (
    <div ref={ref} className="space-y-2">
      {rows.map(([label, value, c], i) => (
        <div key={label} className="flex items-center justify-between gap-2 rounded bg-surface px-2 py-1.5">
          <span className="truncate text-[11px] text-muted">{label}</span>
          {i < stage ? (
            <motion.span {...fade} className="flex items-center gap-2">
              <span className="mono text-xs text-ink-2">{value}</span>
              <span className={`mono rounded px-1 text-[10px] ${c < 85 ? "bg-unsure/15 text-unsure" : "bg-clear/10 text-clear"}`}>
                {c}%
              </span>
            </motion.span>
          ) : (
            <span className="h-3 w-20 animate-pulse rounded bg-line motion-reduce:animate-none" />
          )}
        </div>
      ))}
    </div>
  );
}

function CheckSnippet() {
  const rows: [string, string, boolean][] = [
    ["X1", "Invoice total = sum of lines", true],
    ["X4", "Package count, PL ↔ B/L", false],
    ["X5", "Gross weight across documents", true],
    ["X7", "Container numbers, PL ↔ B/L", true],
  ];
  const [ref, stage] = useStage(rows.length, 450);
  return (
    <ul ref={ref as React.Ref<HTMLUListElement>} className="space-y-2">
      {rows.map(([id, title, pass], i) => (
        <li key={id} className="flex items-center gap-2 rounded bg-surface px-2 py-1.5">
          <span className="mono w-7 text-[11px] text-muted">{id}</span>
          <span className="flex-1 truncate text-[11px] text-ink-2">{title}</span>
          {i < stage ? (
            <motion.span {...fade} className={`mono text-[10px] ${pass ? "text-clear" : "text-conflict"}`}>
              {pass ? "pass" : "fail"}
            </motion.span>
          ) : (
            <span className="mono text-[10px] text-muted">···</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ExportSnippet() {
  const [ref, stage] = useStage(2, 1100);
  const open = stage < 2;
  return (
    <div ref={ref} className="flex h-full flex-col justify-between rounded-lg bg-surface p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Open flags</span>
        <span className={`mono ${open ? "text-unsure" : "text-clear"}`}>{open ? (stage === 0 ? 2 : 1) : 0}</span>
      </div>
      <div
        className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-500 ${
          open ? "border border-line-strong text-muted" : "bg-clear text-bg"
        }`}
      >
        {open ? <Lock className="size-3.5" /> : <Download className="size-3.5" />}
        {open ? "Export blocked: clear the flags" : "Export CSV"}
      </div>
      <p className="mono text-[11px] text-muted">{open ? "409 · blockers listed" : "SHP-24817-v1.csv · sha256 stored"}</p>
    </div>
  );
}
