"use client";

import { Check, Lock, LockOpen } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { flags } from "@/content";
import { Section, SectionHeader } from "./ui";

export function Flags() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [cleared, setCleared] = useState(0);
  const n = reduce ? flags.items.length : cleared;
  const unlocked = n === flags.items.length;

  useEffect(() => {
    if (!inView || reduce) return;
    const t = flags.items.map((_, i) => setTimeout(() => setCleared(i + 1), 600 + i * 700));
    return () => t.forEach(clearTimeout);
  }, [inView, reduce]);

  return (
    <Section labelledBy="flags-title">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <SectionHeader id="flags-title" eyebrow="The export gate" title={flags.title} intro={flags.intro} />
        <div ref={ref} className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <ul className="space-y-2">
            {flags.items.map((item, i) => {
              const done = i < n;
              return (
                <li
                  key={item}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors duration-500 ${
                    done ? "border-line text-muted" : "border-unsure/30 bg-unsure/[0.05] text-ink-2"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-500 ${
                      done ? "border-clear bg-clear text-bg" : "border-unsure/60"
                    }`}
                  >
                    {done && (
                      <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        <Check className="size-3" strokeWidth={3} />
                      </motion.span>
                    )}
                  </span>
                  {item}
                </li>
              );
            })}
          </ul>
          <div
            aria-hidden
            className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-500 ${
              unlocked ? "bg-clear text-bg" : "border border-line-strong text-muted"
            }`}
          >
            <span className="flex items-center gap-2">
              {unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              {unlocked ? "Export unlocked" : "Export blocked"}
            </span>
            <span className="mono text-xs">{flags.items.length - n} open</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
