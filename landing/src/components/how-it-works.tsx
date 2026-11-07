"use client";

import { Check, CheckCircle2, Download, FileText, Lock, XCircle } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { how } from "@/content";
import { Backdrop } from "./backdrop";
import { Section, SectionHeader, stagger } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;
// Four crops of one landscape, left to right, so the row reads as one continuous view.
const crops = ["4% 40%", "36% 70%", "62% 85%", "96% 45%"];

export function HowItWorks() {
  const snippets = [<UploadSnippet key="u" />, <ExtractSnippet key="e" />, <CheckSnippet key="c" />, <ExportSnippet key="x" />];
  return (
    <Section id="how-it-works" labelledBy="how-title">
      <SectionHeader id="how-title" eyebrow={how.eyebrow} title={how.title} />
      <ol className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {how.steps.map((s, i) => (
          <li key={s.title} style={stagger(i)} className="reveal flex min-w-0 flex-col">
            <Backdrop image="velvex" position={crops[i]} className="h-60 rounded-xl">
              <div aria-hidden className="flex h-full items-center justify-center p-4">
                <div className="w-full max-w-[250px] rounded-lg border border-line bg-surface p-3 text-[12px] shadow-[0_18px_40px_-16px_rgb(5_8_30/0.7)]">
                  {snippets[i]}
                </div>
              </div>
            </Backdrop>
            <div className="pt-5">
              <h3 className="flex items-baseline gap-2 font-semibold text-ink">
                <span className="mono text-xs font-normal text-muted">{i + 1}</span>
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Steps 0..max while the snippet is on screen, then holds and replays. Max with reduced motion. */
function useLoop(max: number, every = 600, hold = 2600) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(max);
  useEffect(() => {
    if (reduce) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start from the top once JS runs
    setStage(0);
  }, [reduce]);
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setTimeout(() => setStage((s) => (s >= max ? 0 : s + 1)), stage >= max ? hold : stage === 0 ? 400 : every);
    return () => clearTimeout(t);
  }, [inView, reduce, stage, max, every, hold]);
  return [ref, reduce ? max : stage] as const;
}

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE },
};

function UploadSnippet() {
  const files = [
    ["invoice.pdf", "84 KB"],
    ["packing_list.pdf", "61 KB"],
    ["bill_of_lading.pdf", "73 KB"],
  ];
  const [ref, stage] = useLoop(files.length, 650);
  return (
    <div ref={ref}>
      <p className="mb-2 text-[11px] text-muted">PDF, PNG or JPG · up to 15 MB · 10 pages</p>
      <ul className="space-y-1.5">
        {files.map(([name, size], i) => (
          <li key={name} className="relative flex h-7 items-center gap-2 overflow-hidden rounded-md border border-line px-2">
            {i < stage ? (
              <motion.span {...fade} className="flex w-full items-center gap-2">
                <CheckCircle2 className="size-3.5 shrink-0 text-clear" />
                <span className="mono truncate text-ink-2">{name}</span>
                <span className="ml-auto text-[10px] text-muted">{size}</span>
              </motion.span>
            ) : i === stage ? (
              <>
                <FileText className="size-3.5 shrink-0 text-accent" />
                <span className="mono truncate text-ink-2">{name}</span>
                <motion.span
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                />
              </>
            ) : (
              <span className="skeleton h-2.5 w-24" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExtractSnippet() {
  const rows: [string, string, number][] = [
    ["Invoice no.", "ZS-2026-1187", 99],
    ["Packages", "240 CARTONS", 97],
    ["Gross weight", "3,120.00 kg", 93],
    ["Invoice total", "16,320.00", 62],
  ];
  const [ref, stage] = useLoop(rows.length, 450);
  return (
    <div ref={ref} className="divide-y divide-line">
      {rows.map(([label, value, c], i) => (
        <div key={label} className={`flex h-7 items-center justify-between gap-2 px-1 ${i < stage && c < 85 ? "bg-unsure-soft/70" : ""}`}>
          <span className="truncate text-[11px] text-muted">{label}</span>
          {i < stage ? (
            <motion.span {...fade} className="flex items-center gap-2">
              <span className="mono text-ink">{value}</span>
              <span className={`mono text-[10px] ${c < 85 ? "text-unsure" : "text-muted"}`}>{c}%</span>
            </motion.span>
          ) : (
            <span className="skeleton h-2.5 w-20" />
          )}
        </div>
      ))}
    </div>
  );
}

function CheckSnippet() {
  const rows: [string, string, boolean][] = [
    ["X1", "Invoice total = sum of lines", true],
    ["X3", "Quantities match", true],
    ["X4", "Package count, PL ↔ B/L", false],
    ["X7", "Container numbers", true],
  ];
  const [ref, stage] = useLoop(rows.length, 450);
  return (
    <ul ref={ref as React.Ref<HTMLUListElement>} className="space-y-1">
      {rows.map(([id, title, pass], i) => (
        <li
          key={id}
          className={`flex h-7 items-center gap-2 rounded-md px-1.5 transition-colors duration-300 ${
            i === stage ? "bg-accent-soft" : i < stage && !pass ? "bg-conflict-soft" : ""
          }`}
        >
          <span className="mono w-6 text-[10px] text-muted">{id}</span>
          <span className="flex-1 truncate text-[11px] text-ink-2">{title}</span>
          {i < stage ? (
            <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
              {pass ? <Check className="size-3.5 text-clear" /> : <XCircle className="size-3.5 text-conflict" />}
            </motion.span>
          ) : (
            <span className="size-3.5 rounded-full border border-dashed border-line-strong" />
          )}
        </li>
      ))}
    </ul>
  );
}

function ExportSnippet() {
  const [ref, stage] = useLoop(3, 1000, 3000);
  const open = stage < 2;
  return (
    <div ref={ref} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">Open items</span>
        <span className={`mono rounded-full px-1.5 text-[11px] transition-colors duration-300 ${open ? "bg-unsure-soft text-unsure" : "bg-clear-soft text-clear"}`}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="inline-block">
              {open ? 2 - stage : 0}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <motion.div
        animate={open ? { scale: 1 } : { scale: [1, 1.04, 1] }}
        transition={{ duration: 0.5, ease: EASE }}
        className={`flex h-8 items-center justify-center gap-1.5 overflow-hidden rounded-md text-[11px] font-medium transition-colors duration-500 ${
          open ? "bg-info-soft text-ink-2" : "bg-accent text-accent-ink"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "lock" : "go"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-1.5"
          >
            {open ? <Lock className="size-3.5" /> : <Download className="size-3.5" />}
            {open ? "Export blocked" : "Export CSV"}
          </motion.span>
        </AnimatePresence>
      </motion.div>
      <p className="mono h-4 truncate text-[10px] text-muted">
        {stage >= 3 ? "SHP-24811-v1.csv · sha256 3fa9c1…" : open ? "Clear the open items first." : "Ready to export."}
      </p>
    </div>
  );
}
