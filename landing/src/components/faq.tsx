"use client";

import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { faq } from "@/content";
import { Section, SectionHeader, stagger } from "./ui";

export function Faq() {
  const half = Math.ceil(faq.items.length / 2);
  const cols = [faq.items.slice(0, half), faq.items.slice(half)];
  return (
    <Section id="faq" labelledBy="faq-title">
      <SectionHeader id="faq-title" eyebrow={faq.eyebrow} title={faq.title} />
      <div className="mt-14 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cols.map((items, c) => (
          <ul key={c} className="reveal self-start rounded-2xl border border-line bg-surface px-5 sm:px-6" style={stagger(c)}>
            {items.map((it) => (
              <Item key={it.q} q={it.q} a={it.a} />
            ))}
          </ul>
        ))}
      </div>
    </Section>
  );
}

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="border-b border-line last:border-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="group flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-ink"
        >
          {q}
          <span
            aria-hidden
            className={`grid size-7 shrink-0 place-items-center rounded-full border transition-[transform,background-color,border-color,color] duration-300 ease-smooth ${
              open ? "rotate-45 border-ink bg-ink text-surface" : "border-line-strong text-ink-2 group-hover:border-ink-2"
            }`}
          >
            <Plus className="size-3.5" />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-prose pb-5 pr-10 text-sm leading-relaxed text-ink-2">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
