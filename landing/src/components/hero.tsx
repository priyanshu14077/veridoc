"use client";

import { Check, CheckCircle2, Download, FileText, Loader2, Pencil, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { hero, links, live, queue, type Status } from "@/content";
import { HeroVideo } from "./backdrop";
import { AppWindow, ButtonLink, Container, StatusChip, stagger } from "./primitives";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-[#c3d0e3]">
      {/* The video: a sunlit valley under a white sky. Text sits on the sky, the product on the meadow. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 top-[30%] -z-10 sm:top-0">
        <HeroVideo />
        {/* The video's white sky is tinted a soft steel blue (no white ground), easing into the
            footage; at the bottom it darkens into the night-blue strip below. */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#c3d0e3] via-[#c3d0e3]/75 to-transparent sm:h-3/5" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0b1324] to-transparent" />
      </div>

      <Container className="flex flex-col items-center pb-10 pt-24 text-center sm:pt-28">
        <a
          href="#product"
          className="rise group inline-flex items-center gap-2 rounded-full border border-line bg-surface/90 py-1 pl-1 pr-3 text-sm text-ink-2 shadow-sm backdrop-blur transition-colors duration-300 hover:border-line-strong"
        >
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-surface">{hero.chipLabel}</span>
          <span className="text-left">{hero.chip}</span>
          <span aria-hidden className="transition-transform duration-300 ease-smooth group-hover:translate-x-0.5">→</span>
        </a>
        {/* Static on purpose: the headline is the first thing read (and the LCP element). */}
        <h1 id="hero-title" className="display mt-6 max-w-5xl text-[2.6rem] text-balance sm:text-6xl lg:text-7xl">
          {hero.title.map((line, i) => (
            <span key={line} className={`block ${i === 1 ? "text-ink-2" : "text-ink"}`}>
              {line}
            </span>
          ))}
        </h1>
        <p className="rise mt-6 max-w-2xl text-base leading-relaxed text-ink-2 sm:text-lg" style={stagger(0, 160)}>
          {hero.sub}
        </p>
        <div className="rise mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row" style={stagger(0, 240)}>
          <ButtonLink href={links.demo} external className="w-full sm:w-auto">
            Try the live demo
          </ButtonLink>
          <ButtonLink href="#how-it-works" variant="secondary" className="w-full bg-surface/80 backdrop-blur sm:w-auto">
            See how it works
          </ButtonLink>
        </div>
        <p className="rise mt-5 text-sm text-ink-2" style={stagger(0, 300)}>
          {hero.note}
        </p>

        {/* The product rises over the meadow. Its own compositing layer, so the video never repaints it. */}
        <div className="mock-in mt-12 w-full max-w-5xl text-left [transform:translateZ(0)] sm:mt-16" style={stagger(0, 380)}>
          <Autopilot />
        </div>
      </Container>
    </section>
  );
}

// ── The autopilot queue ──────────────────────────────────────────────────────

// Step numbers. The fields arrive at FIELDS..FIELDS+5; FLAG is the "needs a person" moment.
const ARRIVE = 1;
const DOCS = 2; // 2, 3, 4: documents finish reading one by one
const FIELDS = 5;
const FLAG = FIELDS + live.fields.length; // 11
const PRESS = FLAG + 1;
const CONFIRMED = PRESS + 1;
const EXPORTED = CONFIRMED + 1;
const HOLD = EXPORTED + 1;

// Delay before moving to each step, in ms (index = step being entered).
const DELAYS: Record<number, number> = {
  [ARRIVE]: 700, 2: 900, 3: 450, 4: 450, [FLAG]: 400, [PRESS]: 1900, [CONFIRMED]: 260, [EXPORTED]: 1500, [HOLD]: 2600,
};
const delayFor = (s: number) => DELAYS[s] ?? 260;

function liveStatus(s: number): Status {
  if (s >= EXPORTED) return "exported";
  if (s >= CONFIRMED) return "cleared";
  if (s >= FLAG) return "needs_review";
  return "extracting";
}

function Autopilot() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  // Server render and reduced motion: the informative still, a shipment waiting on one flag.
  const [step, setStep] = useState(FLAG);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the loop from the top once JS runs
    setStep(0);
  }, [reduce]);

  useEffect(() => {
    if (reduce || !inView) return;
    const t = setTimeout(
      () => {
        if (step >= HOLD) {
          setStep(0);
          setCycle((c) => c + 1);
        } else setStep(step + 1);
      },
      step >= HOLD ? 500 : delayFor(step + 1),
    );
    return () => clearTimeout(t);
  }, [step, inView, reduce]);

  const s = reduce ? FLAG : step;
  const status = liveStatus(s);
  const flagged = live.fields[live.flaggedIndex];

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Veridoc's shipment queue. A new shipment, ${live.ref}, arrives and its three documents are read. Each field gets a confidence score; the invoice total reads at ${Math.round(flagged.confidence * 100)}%, below the 85% threshold, so it is flagged. A person confirms it, the shipment is cleared and exported as a CSV.`}
    >
      <AppWindow
        title={
          <>
            Veridoc <span className="font-normal text-muted">/ Shipments</span>
          </>
        }
      >
        <div aria-hidden className="grid grid-cols-1 text-[12px] sm:grid-cols-[230px_minmax(0,1fr)]">
          <QueueList arrived={s >= ARRIVE} status={status} cycle={cycle} />
          <Detail step={s} status={status} />
        </div>
      </AppWindow>
    </div>
  );
}

const QueueList = memo(function QueueList({ arrived, status, cycle }: { arrived: boolean; status: Status; cycle: number }) {
  const counts = { open: 3 + (status === "needs_review" ? 1 : 0) };
  return (
    <div className="hidden border-r border-line sm:block">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
        <span className="font-semibold">All open</span>
        <span className="flex items-center gap-1 text-[11px] text-clear">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full rounded-full bg-clear opacity-60 motion-safe:animate-ping" />
            <span className="relative size-1.5 rounded-full bg-clear" />
          </span>
          Live
        </span>
      </div>
      <p className="px-3 pb-2 text-[11px] text-muted">
        <span className="mono">{counts.open}</span> need review
      </p>
      <ul className="space-y-0.5 px-1.5 pb-2">
        <AnimatePresence initial={false}>
          {arrived && (
            <motion.li
              key={`live-${cycle}`}
              layout
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="overflow-hidden"
            >
              <Row active refName={live.ref} importer={live.importer} ago="now" status={status} flags={status === "needs_review" ? 1 : 0} />
            </motion.li>
          )}
          {queue.map((q) => (
            <motion.li key={q.ref} layout transition={{ duration: 0.5, ease: EASE }}>
              <Row refName={q.ref} importer={q.importer} ago={q.ago} status={q.status} flags={q.flags} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
});

function Row({
  refName, importer, ago, status, flags, active = false,
}: { refName: string; importer: string; ago: string; status: Status; flags: number; active?: boolean }) {
  return (
    <div className={`rounded-md px-2 py-1.5 transition-colors duration-500 ${active ? "bg-accent-soft/70 shadow-[inset_2px_0_0_var(--color-accent)]" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="mono font-medium">{refName}</span>
        <span className="text-[10px] text-muted">{ago}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-ink-2">{importer}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-1"
          >
            {flags > 0 && <span className="mono min-w-4 rounded-full bg-unsure-soft px-1 text-center text-[10px] text-unsure">{flags}</span>}
            <StatusChip status={status} small />
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Detail({ step, status }: { step: number; status: Status }) {
  const docsDone = Math.max(0, Math.min(3, step - DOCS + 1));
  const shown = Math.max(0, Math.min(live.fields.length, step - FIELDS + 1));
  const confirmed = step >= CONFIRMED;
  const exported = step >= EXPORTED;
  const open = step >= FLAG && !confirmed ? 1 : 0;

  return (
    <div className="min-w-0 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-[15px] font-medium">{live.ref}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={status} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.25 }}>
            <StatusChip status={status} />
          </motion.span>
        </AnimatePresence>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {live.supplier.replace(" · ", ", ")} → {live.importer}
      </p>

      {/* Documents */}
      <ul className="mt-3 divide-y divide-line rounded-md border border-line">
        {live.docs.map((d, i) => {
          const done = i < docsDone;
          const hasFlag = i === 0 && step >= FLAG && !confirmed;
          return (
            <li key={d} className="flex items-center gap-2 px-2.5 py-1.5">
              {!done ? (
                step >= ARRIVE ? (
                  <Loader2 className="size-3.5 shrink-0 text-accent motion-safe:animate-spin" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted" />
                )
              ) : hasFlag ? (
                <TriangleAlert className="size-3.5 shrink-0 text-unsure" />
              ) : (
                <CheckCircle2 className="size-3.5 shrink-0 text-clear" />
              )}
              <span className="font-medium">{d}</span>
              <span className={`ml-auto truncate text-[11px] ${!done ? "text-accent" : hasFlag ? "text-unsure" : "text-clear"}`}>
                {!done ? (step >= ARRIVE ? "Reading…" : "Waiting") : hasFlag ? "1 field to check" : "All fields confident"}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Fields of the invoice */}
      <div className="mt-3 rounded-md border border-line">
        <p className="border-b border-line px-2.5 py-1.5 text-[10px] font-medium tracking-wide text-muted uppercase">Commercial invoice</p>
        <ul>
          {live.fields.map((f, i) => {
            const isFlag = i === live.flaggedIndex;
            const visible = i < shown;
            const flagOpen = isFlag && step >= FLAG && !confirmed;
            return (
              <li
                key={f.label}
                className={`border-b border-line px-2.5 py-1.5 transition-colors duration-500 last:border-0 ${
                  flagOpen ? "bg-unsure-soft/70 shadow-[inset_2px_0_0_var(--color-accent)]" : ""
                }`}
              >
                <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate text-muted">{f.label}</span>
                  {visible ? (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="mono truncate"
                    >
                      {f.value}
                    </motion.span>
                  ) : (
                    <span className="skeleton h-3 w-3/4" />
                  )}
                  <span className="flex items-center gap-1">
                    {visible &&
                      (isFlag && confirmed ? (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 26 }}
                          className="flex items-center gap-0.5 text-[11px] font-medium text-clear"
                        >
                          <Check className="size-3" /> Confirmed
                        </motion.span>
                      ) : (
                        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`mono text-[11px] ${isFlag ? "text-unsure" : "text-muted"}`}>
                          {Math.round(f.confidence * 100)}%
                        </motion.span>
                      ))}
                    {flagOpen && <TriangleAlert className="size-3 text-unsure" />}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {flagOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pt-1.5 text-[11px] text-unsure">{live.flagReason}</p>
                      <div className="flex gap-1.5 pt-1.5 pb-0.5">
                        <motion.span
                          animate={step === PRESS ? { scale: 0.92 } : { scale: 1 }}
                          transition={{ duration: 0.15 }}
                          className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-accent-ink transition-shadow ${
                            step === PRESS ? "bg-accent-hover shadow-[0_0_0_3px_rgb(31_79_209/0.25)]" : "bg-accent"
                          }`}
                        >
                          <Check className="size-3" /> Confirm
                        </motion.span>
                        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-line-strong px-2 text-[11px] font-medium">
                          <Pencil className="size-3" /> Edit
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Export */}
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors duration-500 ${
            confirmed && !exported ? "bg-accent text-accent-ink" : exported ? "bg-info-soft text-ink-2" : "bg-info-soft text-ink-2"
          }`}
        >
          <Download className="size-3.5" />
          {exported ? "Exported" : "Export CSV"}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={exported ? "x" : confirmed ? "c" : `o${open}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="truncate text-[11px] text-muted"
          >
            {exported ? (
              <>
                Version 1 · {live.confirmedBy} · <span className="mono">{live.ref}-v1.csv</span>
              </>
            ) : confirmed ? (
              <>Confirmed by {live.confirmedBy}. Ready to export.</>
            ) : step >= FLAG ? (
              "Clear the 1 open item first."
            ) : (
              "Waiting for the documents."
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
