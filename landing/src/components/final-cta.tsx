"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { demo, links, live } from "@/content";
import { Backdrop } from "./backdrop";
import { AppWindow, ButtonLink, Section, StatusChip, TwoTone } from "./primitives";

export function FinalCta() {
  return (
    <Section id="demo" labelledBy="demo-title">
      <div className="reveal grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-surface p-2 lg:grid-cols-2">
        <div className="p-6 sm:p-10">
          <TwoTone id="demo-title" title={demo.title} className="text-4xl sm:text-5xl" />
          <p className="mt-5 max-w-md leading-relaxed text-ink-2">{demo.body}</p>
          <div className="mt-8 max-w-md overflow-hidden rounded-xl border border-line bg-paper">
            <Credential label="Email" value={demo.email} />
            <Credential label="Password" value={demo.password} />
          </div>
          <div className="mt-6">
            <ButtonLink href={links.demo} external>
              Try the live demo
            </ButtonLink>
          </div>
          <p className="mt-6 text-sm text-muted">{demo.note}</p>
        </div>
        <Backdrop image="velvex" position="50% 88%" className="min-h-80 rounded-xl">
          <div className="flex h-full items-center justify-center p-6 sm:p-10">
            <div
              role="img"
              aria-label="A summary from the demo's manager view: shipments that need review, cleared, and exported, with the newest one waiting on one flag."
              className="w-full max-w-sm"
            >
              <AppWindow title={<>Veridoc <span className="font-normal text-muted">/ Today</span></>}>
                <div aria-hidden className="p-4 text-[12px]">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["6", "Needs review"],
                      ["2", "Cleared"],
                      ["4", "Exported"],
                    ].map(([n, l]) => (
                      <div key={l} className="rounded-md border border-line px-2.5 py-2">
                        <p className="display text-2xl">{n}</p>
                        <p className="text-[10px] text-muted">{l}</p>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-3 divide-y divide-line">
                    {[
                      { ref: live.ref, who: live.importer, s: "needs_review" as const },
                      { ref: "SHP-24812", who: "Company F Flow Controls", s: "cleared" as const },
                      { ref: "SHP-24816", who: "Company G Packaging", s: "exported" as const },
                    ].map((r) => (
                      <li key={r.ref} className="flex items-center gap-2 py-2">
                        <span className="mono font-medium">{r.ref}</span>
                        <span className="truncate text-muted">{r.who}</span>
                        <span className="ml-auto">
                          <StatusChip status={r.s} small />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </AppWindow>
            </div>
          </div>
        </Backdrop>
      </div>
    </Section>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  }
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
        <p className="text-xs text-muted sm:w-20 sm:shrink-0">{label}</p>
        <p className="mono text-sm break-all text-ink select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="grid size-9 shrink-0 place-items-center rounded-md text-ink-2 transition-[color,background-color,transform] duration-200 hover:bg-info-soft hover:text-ink active:scale-90"
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ opacity: 0, scale: 0.5, rotate: copied ? -30 : 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 600, damping: 26 }}
          >
            {copied ? <Check aria-hidden className="size-4 text-clear" /> : <Copy aria-hidden className="size-4" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}
