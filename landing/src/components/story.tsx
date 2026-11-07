"use client";

import { Check, Download, FileUp, Lock, LockOpen, Pencil, RotateCcw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { failing, live, story } from "@/content";
import { Backdrop } from "./backdrop";
import { AppWindow, Kbd, Section, SectionHeader } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * "Why Veridoc": three steps scroll past on the right while the picture on the left stays pinned
 * and changes to match. On small screens each step carries its own picture instead.
 */
export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <Section labelledBy="story-title" className="relative isolate overflow-clip">
      {/* Perplex stays put while the section scrolls over it (a sticky, viewport-sized layer). */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[#0c0d10]">
        <Backdrop image="perplex" position="50% 45%" className="sticky top-0 h-svh" />
        {/* Darkened so white text clears 4.5:1 even over the bright ring. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgb(0_0_0/0.35),rgb(0_0_0/0.72))]" />
      </div>
      <SectionHeader id="story-title" eyebrow={story.eyebrow} title={story.title} tone="dark" />
      <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        {/* Pinned picture (large screens) */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <div className="relative aspect-[1/1.02] rounded-2xl border border-white/15 bg-white/[0.06]">
              <div className="flex h-full items-center justify-center p-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.98 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="w-full max-w-[400px]"
                  >
                    <Visual step={active} active />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div aria-hidden className="absolute bottom-5 left-5 flex gap-1.5">
                {story.steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full bg-white transition-all duration-500 ease-smooth ${i === active ? "w-6 opacity-100" : "w-1.5 opacity-40"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <ol className="space-y-16 lg:space-y-0">
          {story.steps.map((s, i) => (
            <li key={s.title}>
              <div
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-step={i}
                className="lg:flex lg:min-h-[78vh] lg:flex-col lg:justify-center"
              >
                <div className="mb-6 rounded-xl border border-white/15 bg-white/[0.06] p-4 sm:p-6 lg:hidden">
                  <Visual step={i} active={i === active} />
                </div>
                <span
                  className={`mono grid size-8 place-items-center rounded-full border text-xs transition-colors duration-500 ${
                    i === active ? "border-white/60 bg-white text-ink" : "border-white/30 text-white/80"
                  }`}
                >
                  0{i + 1}
                </span>
                {/* Inactive steps dim to 65% white, which still clears 4.5:1 on the darkened image. */}
                <h3 className={`display mt-5 text-3xl transition-colors duration-500 sm:text-[2.5rem] ${i === active ? "text-white" : "text-white lg:text-white/65"}`}>
                  {s.title}
                </h3>
                <p className={`mt-4 max-w-md leading-relaxed transition-colors duration-500 ${i === active ? "text-white/85" : "text-white/85 lg:text-white/65"}`}>
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function Visual({ step, active }: { step: number; active: boolean }) {
  if (step === 0) return <FieldVisual active={active} />;
  if (step === 1) return <AcceptVisual active={active} />;
  return <GateVisual active={active} />;
}

/**
 * Runs through stages 0..last while active, restarting each time it becomes active.
 * The server and reduced motion show `still`, the stage that tells the story without movement.
 */
function useTimeline(active: boolean, delays: number[], still: number) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(still);
  useEffect(() => {
    if (reduce || !active) return;
    let i = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart from the top on activation
    setStage(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    for (const d of delays) {
      at += d;
      timers.push(setTimeout(() => setStage(++i), at));
    }
    return () => timers.forEach(clearTimeout);
    // delays is a constant per visual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduce]);
  return reduce ? still : stage;
}

// 1 ── A flagged field, confirmed with a keystroke.
function FieldVisual({ active }: { active: boolean }) {
  // 0 flagged · 1 Enter pressed · 2 confirmed
  const s = useTimeline(active, [1800, 220], 0);
  const f = live.fields[live.flaggedIndex];
  const done = s >= 2;
  return (
    <div role="img" aria-label={`A flagged field: ${f.label} read as ${f.value} at ${Math.round(f.confidence * 100)}% confidence. The reviewer checks it against the page and confirms it with the Enter key.`}>
      <AppWindow title={<>Commercial invoice <span className="font-normal text-muted">· {live.ref}</span></>}>
        <div aria-hidden className="space-y-3 p-4 text-[13px]">
          {/* The page, with the box where the value was read */}
          <div className="rounded-md bg-info-soft p-3">
            <div className="rounded-sm bg-surface p-3 text-[10px] text-ink-2 shadow-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-ink">Company B Lighting Technology</span>
                <span className="text-muted">INVOICE</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="h-1 w-2/3 rounded bg-line" />
                <div className="h-1 w-1/2 rounded bg-line" />
              </div>
              <div className="mt-3 flex items-center justify-end gap-3">
                <span className="text-muted">Total USD</span>
                <span className="relative font-mono font-semibold text-ink">
                  <motion.span
                    className={`absolute -inset-x-1.5 -inset-y-1 rounded-[2px] ring-2 ring-offset-1 ${done ? "bg-clear/10 ring-clear" : "bg-accent/10 ring-accent"}`}
                    initial={{ opacity: 0, scale: 1.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.3 }}
                  />
                  <span className="relative">{f.value}</span>
                </span>
              </div>
              <span className="mt-1 ml-auto block w-fit -rotate-6 rounded border border-conflict px-1 text-[8px] font-semibold text-conflict">
                RECEIVED
              </span>
            </div>
          </div>
          {/* The focus card */}
          <div className={`rounded-md border transition-colors duration-500 ${done ? "border-line" : "border-unsure/40"}`}>
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-muted">
              <span>{done ? "Nothing left to check" : "1 left to check"}</span>
              <span className="flex gap-1">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-muted">{f.label}</span>
                <span className={`mono text-xs ${done ? "text-muted" : "text-unsure"}`}>{Math.round(f.confidence * 100)}%</span>
              </div>
              <p className="mono mt-1 text-lg text-ink">{f.value}</p>
              <AnimatePresence mode="wait" initial={false}>
                {done ? (
                  <motion.p key="ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-1 text-[12px] text-clear">
                    <Check className="size-3.5" /> Confirmed by {live.confirmedBy} · in the edit history
                  </motion.p>
                ) : (
                  <motion.div key="ask" exit={{ opacity: 0 }}>
                    <p className="mt-2 text-[12px] text-unsure">{live.flagReason}</p>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <motion.span
                        animate={s === 1 ? { scale: 0.93 } : { scale: 1 }}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-ink"
                      >
                        <Check className="size-3.5" /> Confirm
                      </motion.span>
                      <span className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong px-2.5 text-[12px] font-medium">
                        <Pencil className="size-3.5" /> Edit
                      </span>
                      <span className="ml-auto">
                        <Kbd down={s === 1}>Enter</Kbd>
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}

// 2 ── X4 conflict → accepted with a reason → a value changes → the acceptance lapses.
function AcceptVisual({ active }: { active: boolean }) {
  // 0 conflict · 1 typing · 2 accepted · 3 value edited, lapsed
  const s = useTimeline(active, [1400, 1900, 2600], 0);
  const [typed, setTyped] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (s !== 1 || reduce) return;
    const t = Array.from({ length: failing.reason.length }, (_, i) => setTimeout(() => setTyped(i + 1), 120 + i * 32));
    return () => t.forEach(clearTimeout);
  }, [s, reduce]);

  const conflict = s !== 2;
  return (
    <div role="img" aria-label={`Cross-check ${failing.id} is in conflict: ${failing.message}. A person accepts the mismatch with the reason "${failing.reason}". When the packing list total is later edited to ${failing.edited.to}, the acceptance no longer applies and the rule is flagged again.`}>
      <AppWindow title={<>Cross-checks <span className="font-normal text-muted">· SHP-24814</span></>}>
        <div aria-hidden className="p-4 text-[13px]">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>{conflict ? "1 open" : "0 open"} · 9 of 10 pass</span>
            <span>{s === 2 ? "1 accepted" : ""}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={conflict ? "x" : "ok"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.2 }}>
                {conflict ? <XCircle className="size-5 text-conflict" /> : <ShieldCheck className="size-5 text-ink-2" />}
              </motion.span>
            </AnimatePresence>
            <span className="font-medium">{failing.title}</span>
          </div>
          <p className="mt-1 pl-7 text-[11px]">
            <span className="mono text-muted">{failing.id}</span>{" "}
            <span className={`font-medium ${conflict ? "text-conflict" : "text-ink-2"}`}>{conflict ? "Conflict" : "Accepted"}</span>
          </p>
          <p className="mt-2 pl-7 text-ink-2">
            {s === 3 ? `Packing list says ${failing.edited.to} cartons, B/L says 318` : failing.message}
          </p>
          <div className="mt-2 ml-7 space-y-1 rounded-md bg-paper px-3 py-2 text-[12px]">
            {failing.values.map((v, i) => (
              <div key={v.label} className="flex justify-between gap-3">
                <span className="text-muted">{v.label}</span>
                <span className="mono text-accent underline decoration-accent/30">
                  {i === 0 && s === 3 ? (
                    <motion.span initial={{ backgroundColor: "rgb(253 244 227)" }} animate={{ backgroundColor: "rgb(253 244 227 / 0)" }} transition={{ duration: 1.6 }}>
                      {failing.edited.to}
                    </motion.span>
                  ) : (
                    v.value
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 pl-7 text-[11px] text-muted">Allowed difference: none</p>

          <div className="mt-3 ml-7 min-h-[92px]">
            <AnimatePresence mode="wait" initial={false}>
              {s === 0 && (
                <motion.div key="btn" exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 items-center rounded-md border border-line-strong px-2.5 text-[12px] font-medium">Accept with reason</span>
                  <span className="text-[11px] text-muted">or correct a value</span>
                </motion.div>
              )}
              {s === 1 && (
                <motion.div key="form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <p className="text-[11px] font-medium text-ink-2">Why is this difference acceptable?</p>
                  <p className="mono mt-1 min-h-8 rounded-md border border-accent bg-surface px-2 py-1.5 text-[11px] ring-2 ring-accent/15">
                    {failing.reason.slice(0, reduce ? undefined : typed)}
                    <span className="ml-px inline-block h-3 w-px translate-y-0.5 bg-ink motion-safe:animate-pulse" />
                  </p>
                  <span className="mt-1.5 inline-flex h-6 items-center rounded-md bg-accent px-2 text-[11px] font-medium text-accent-ink">Accept mismatch</span>
                </motion.div>
              )}
              {s === 2 && (
                <motion.div key="ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-md border border-line px-3 py-2 text-[12px]">
                  <p className="text-ink-2">Accepted by {live.confirmedBy} · just now</p>
                  <p className="mt-1 text-muted">“{failing.reason}”</p>
                </motion.div>
              )}
              {s === 3 && (
                <motion.div key="lapsed" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-md bg-unsure-soft px-3 py-2 text-[12px]">
                  <p className="flex items-center gap-1.5 font-medium text-unsure">
                    <RotateCcw className="size-3.5" /> No longer applies
                  </p>
                  <p className="mt-1 text-ink-2">
                    The values changed after it was accepted ({failing.edited.from} → {failing.edited.to}), so the rule is open again.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}

// 3 ── The export gate: each blocker clears, export unlocks, the CSV is kept as a version.
function GateVisual({ active }: { active: boolean }) {
  const n = story.gate.length;
  // stages 0..n: blockers cleared · n+1: exported
  const s = useTimeline(active, [700, 600, 600, 600, 1100], n + 1);
  const cleared = Math.min(s, n);
  const unlocked = cleared === n;
  const exported = s > n;
  return (
    <div role="img" aria-label="The export gate. Export stays blocked while any of these is open: a low-confidence field nobody has confirmed, an empty required field, a conflict or can't-check rule without a valid acceptance, or a document still reading or failed. When all are clear, the CSV exports and is kept as version 1.">
      <AppWindow title={<>Export <span className="font-normal text-muted">· SHP-24811</span></>}>
        <div aria-hidden className="space-y-2 p-4 text-[12px]">
          {story.gate.map((g, i) => {
            const done = i < cleared;
            return (
              <div key={g} className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-500 ${done ? "text-muted" : "bg-unsure-soft text-ink-2"}`}>
                <span className={`mt-px grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-500 ${done ? "border-clear bg-clear text-white" : "border-unsure/60"}`}>
                  {done && (
                    <motion.span initial={{ scale: 0.3, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}>
                      <Check className="size-2.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </span>
                <span className={done ? "line-through decoration-line-strong" : ""}>{g}</span>
              </div>
            );
          })}
          <motion.div
            animate={unlocked && !exported ? { scale: [1, 1.03, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, ease: EASE }}
            className={`mt-3 flex h-9 items-center justify-center gap-2 rounded-md text-[13px] font-medium transition-colors duration-500 ${
              unlocked ? "bg-accent text-accent-ink" : "bg-info-soft text-ink-2"
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={exported ? "x" : unlocked ? "u" : "l"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="flex items-center gap-2">
                {exported ? <FileUp className="size-4" /> : unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                {exported ? "Exported" : unlocked ? "Export CSV" : `Export blocked · ${n - cleared} open`}
              </motion.span>
            </AnimatePresence>
          </motion.div>
          <div className="space-y-1 pt-1">
            {[
              { v: 1, who: live.confirmedBy, when: "just now", show: exported },
            ].map((x) => (
              <AnimatePresence key={x.v} initial={false}>
                {x.show && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                    <div className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5">
                      <span>
                        Version {x.v} · {x.who} · {x.when}
                      </span>
                      <span className="mono flex items-center gap-1 text-accent">
                        <Download className="size-3" /> SHP-24811-v{x.v}.csv
                      </span>
                    </div>
                    <p className="mono mt-1 text-[10px] text-muted">SHA-256 stored with the file</p>
                  </motion.div>
                )}
              </AnimatePresence>
            ))}
            {!exported && (
              <p className="flex items-center gap-1 text-[11px] text-muted">
                <TriangleAlert className="size-3" /> Clear the open items above first.
              </p>
            )}
          </div>
        </div>
      </AppWindow>
    </div>
  );
}
