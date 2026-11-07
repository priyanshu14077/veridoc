"use client";

import { AlertTriangle, Check, RotateCcw, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { crossChecks, failing, rules } from "@/content";
import { Section, SectionHeader } from "./ui";

export function CrossChecks() {
  return (
    <Section id="cross-checks" labelledBy="checks-title">
      <SectionHeader id="checks-title" eyebrow="Cross-checks" title={crossChecks.title} intro={crossChecks.intro} />
      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              The ten cross-check rules, the documents each compares and its tolerance. In this example X4 fails.
            </caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Rule</th>
                <th scope="col" className="hidden px-4 py-3 font-normal sm:table-cell">Compares</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Tolerance</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const fail = r.id === failing.id;
                return (
                  <tr key={r.id} className={`border-b border-line last:border-0 ${fail ? "bg-conflict/[0.06]" : ""}`}>
                    <th scope="row" className="px-4 py-3 font-normal">
                      <span className="flex items-start gap-3">
                        <span className={`mono w-8 shrink-0 text-xs leading-5 ${fail ? "text-conflict" : "text-accent"}`}>
                          {r.id}
                        </span>
                        <span className="text-ink-2">
                          {r.title}
                          <span className="mt-0.5 block text-xs text-muted sm:hidden">{r.docs}</span>
                        </span>
                      </span>
                    </th>
                    <td className="hidden px-4 py-3 text-xs text-muted sm:table-cell">{r.docs}</td>
                    <td className="mono px-4 py-3 text-right text-xs whitespace-nowrap text-muted">
                      {fail ? (
                        <span className="inline-flex items-center gap-1 text-conflict">
                          <AlertTriangle aria-hidden className="size-3" /> fail
                          <span className="sr-only"> in this example</span>
                        </span>
                      ) : (
                        r.tolerance
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <AcceptanceDemo />
          <p className="mt-4 text-sm leading-relaxed text-muted">{crossChecks.lapse}</p>
        </div>
      </div>
    </Section>
  );
}

/** X4 fails → accepted with a reason → a value changes → the acceptance lapses. */
function AcceptanceDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0); // 0 failing · 1 typing · 2 accepted · 3 lapsed
  const [typed, setTyped] = useState(0);
  const s = reduce ? 2 : stage;

  useEffect(() => {
    if (!inView || reduce) return;
    const t: ReturnType<typeof setTimeout>[] = [setTimeout(() => setStage(1), 1400)];
    const start = 1600;
    for (let i = 1; i <= failing.reason.length; i++) t.push(setTimeout(() => setTyped(i), start + i * 35));
    const done = start + failing.reason.length * 35 + 500;
    t.push(setTimeout(() => setStage(2), done), setTimeout(() => setStage(3), done + 2600));
    return () => t.forEach(clearTimeout);
  }, [inView, reduce]);

  const failingNow = s === 0 || s === 1 || s === 3;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Example: rule X4 fails because the ${failing.message.toLowerCase()}. A person accepts the mismatch with the reason “${failing.reason}”. When the packing list total is later edited, the acceptance no longer applies and the rule is flagged again.`}
      className="rounded-xl border border-line bg-surface p-5"
    >
      <div aria-hidden>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm">
            <span className="mono text-xs text-muted">{failing.id}</span>
            <span className="text-ink">Package count, packing list ↔ B/L</span>
          </p>
          <StatusTag stage={s} />
        </div>
        <p className={`mt-3 text-sm ${failingNow ? "text-conflict" : "text-muted"}`}>
          {s === 3 ? "Packing list says 152 packages, B/L says 148" : failing.message}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {failing.values.map((v, i) => (
            <div key={v.label} className="rounded-lg border border-line bg-surface-2 p-3">
              <dt className="text-[11px] text-muted">{v.label}</dt>
              <dd className="mono mt-1 text-lg text-ink">
                {i === 0 && s === 3 ? (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-unsure">
                    152
                  </motion.span>
                ) : (
                  v.value
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 min-h-[104px]">
          <AnimatePresence mode="wait">
            {s === 0 && (
              <motion.div key="btn" exit={{ opacity: 0 }} className="flex gap-2">
                <span className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-2">Edit a value</span>
                <span className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-bg">Accept with reason</span>
              </motion.div>
            )}
            {s === 1 && (
              <motion.div key="type" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-[11px] text-muted">Reason (at least 10 characters, audited)</p>
                <p className="mono mt-1.5 min-h-9 rounded-md border border-accent/60 bg-surface-2 px-3 py-2 text-xs text-ink">
                  {failing.reason.slice(0, typed)}
                  <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ink motion-safe:animate-pulse" />
                </p>
              </motion.div>
            )}
            {s === 2 && (
              <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="rounded-lg border border-line bg-surface-2 p-3 text-xs">
                <p className="flex items-center gap-1.5 text-ink">
                  <ShieldCheck className="size-3.5 text-clear" /> Accepted by Meera · goes to the manager&apos;s overrides log
                </p>
                <p className="mono mt-1.5 text-muted">“{failing.reason}”</p>
              </motion.div>
            )}
            {s === 3 && (
              <motion.div key="lapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-lg border border-unsure/40 bg-unsure/[0.07] p-3 text-xs">
                <p className="flex items-center gap-1.5 text-unsure">
                  <RotateCcw className="size-3.5" /> {failing.edited}: acceptance no longer applies
                </p>
                <p className="mt-1.5 text-muted">The rule is flagged again until someone fixes it or accepts the new values.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ stage }: { stage: number }) {
  if (stage === 2)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-clear/40 px-2 py-0.5 text-[11px] text-clear">
        <Check className="size-3" /> Accepted
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-conflict/40 px-2 py-0.5 text-[11px] text-conflict">
      <AlertTriangle className="size-3" /> {stage === 3 ? "Flagged again" : "Fail"}
    </span>
  );
}
