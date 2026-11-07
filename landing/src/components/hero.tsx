"use client";

import { Check, FileText, Pencil } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { hero, links, review } from "@/content";
import { ButtonLink, ConfidenceBadge, Container } from "./ui";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0" />
      <Container className="relative pb-20 pt-16 sm:pb-28 sm:pt-24">
        <div className="max-w-3xl">
          <p className="mono text-xs uppercase tracking-[0.18em] text-accent">{hero.eyebrow}</p>
          <h1
            id="hero-title"
            className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl"
          >
            {hero.title}
          </h1>
          <p className="mt-5 text-lg font-medium text-ink-2 sm:text-xl">{hero.tagline}</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{hero.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={links.demo} external>
              Try the live demo
            </ButtonLink>
            <ButtonLink href={links.tdd} variant="secondary" external>
              Read the technical design
            </ButtonLink>
          </div>
        </div>
        <ReviewMockup />
      </Container>
    </section>
  );
}

/** A coded picture of the review screen: fields fill in, one is flagged, a person confirms it. */
function ReviewMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const count = review.fields.length;
  // stage = how many fields are shown; count + 1 = the flagged field has been confirmed.
  const [stage, setStage] = useState(0);
  const shown = reduce ? count : stage;
  const confirmed = !reduce && stage > count;

  useEffect(() => {
    if (!inView || reduce) return;
    const timers = review.fields.map((_, i) => setTimeout(() => setStage(i + 1), 350 + i * 320));
    timers.push(setTimeout(() => setStage(count + 1), 350 + count * 320 + 1600));
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce, count]);

  const flagged = review.fields[review.flaggedIndex];
  const flagVisible = shown > review.flaggedIndex;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Veridoc review screen for shipment ${review.shipment}. The invoice is on the left; extracted fields with confidence scores are on the right. ${flagged.label} is at ${Math.round(flagged.confidence * 100)}%, below the 85% threshold, so it is flagged for a person to confirm or edit.`}
      className="mt-14 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/40 sm:mt-20"
    >
      <div aria-hidden>
        {/* Window bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="mono text-ink">{review.shipment}</span>
            <span className="text-line-strong">/</span>
            <span className="flex items-center gap-1.5 text-muted">
              <FileText className="size-3.5" />
              {review.document}
            </span>
          </div>
          <StatusPill clear={confirmed} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <DocumentPreview highlight={flagVisible} confirmed={confirmed} />
          <div className="min-w-0 border-t border-line p-4 sm:p-5 md:border-l md:border-t-0">
            <p className="mono mb-3 text-[11px] uppercase tracking-wider text-muted">Extracted fields</p>
            <ul className="space-y-1.5">
              {review.fields.map((f, i) => {
                const isFlag = i === review.flaggedIndex;
                // Every row is always in the layout (no shift); it fades in when its turn comes.
                return (
                  <motion.li
                    key={f.label}
                    initial={false}
                    animate={{ opacity: i < shown ? 1 : 0, y: i < shown ? 0 : 6 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className={`rounded-lg border px-3 py-2.5 transition-colors duration-500 ${
                      isFlag && !confirmed
                        ? "border-unsure/50 bg-unsure/[0.07]"
                        : isFlag
                          ? "border-clear/40 bg-clear/[0.06]"
                          : "border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">{f.label}</p>
                        <p className="mono mt-0.5 truncate text-sm text-ink">{f.value}</p>
                      </div>
                      {isFlag && confirmed ? (
                        <span className="mono inline-flex items-center gap-1 rounded bg-clear/10 px-1.5 py-0.5 text-[11px] text-clear">
                          <Check className="size-3" /> Confirmed
                        </span>
                      ) : (
                        <ConfidenceBadge value={f.confidence} threshold={review.threshold} />
                      )}
                    </div>
                    {isFlag && (
                      <div className="mt-2.5 flex min-h-6 items-center gap-2">
                        {confirmed ? (
                          <span className="text-xs text-clear">Confirmed by Meera · recorded in the edit history</span>
                        ) : (
                          <>
                            <span className="text-xs text-unsure">Below 85%: check against the page</span>
                            <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg">
                              <Check className="size-3" /> Confirm
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-xs text-ink-2">
                              <Pencil className="size-3" /> Edit
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ clear }: { clear: boolean }) {
  return clear ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-clear/40 px-2.5 py-1 text-xs text-clear">
      <Check className="size-3" /> Cleared · ready to export
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-unsure/40 px-2.5 py-1 text-xs text-unsure">
      <span className="size-1.5 rounded-full bg-unsure" /> Needs review · 1 flag
    </span>
  );
}

/** The source document, drawn in HTML: an off-white invoice page with the flagged cell boxed. */
function DocumentPreview({ highlight, confirmed }: { highlight: boolean; confirmed: boolean }) {
  const l = review.line;
  return (
    <div className="min-w-0 bg-surface-2 p-4 sm:p-6">
      <div className="mx-auto max-w-md rounded-sm bg-[#f4f3ef] p-5 text-[#2a2b2e] shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold leading-tight">{review.supplier}</p>
            <p className="mt-1 text-[11px] text-[#6b6d72]">Shenzhen, China</p>
          </div>
          <p className="hidden text-right text-[11px] font-semibold uppercase tracking-wider sm:block">Commercial invoice</p>
        </div>
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[11px]">
          <dt className="text-[#6b6d72]">Invoice no.</dt>
          <dd className="font-mono">{review.invoiceNo}</dd>
          <dt className="text-[#6b6d72]">Buyer</dt>
          <dd className="truncate">{review.buyer}</dd>
          <dt className="text-[#6b6d72]">Terms</dt>
          <dd>CFR Nhava Sheva</dd>
        </dl>
        <table className="mt-4 w-full border-t border-[#d8d6cf] text-[11px]">
          <thead>
            <tr className="text-left text-[#6b6d72]">
              <th className="py-1.5 font-normal">Description</th>
              <th className="py-1.5 font-normal">HSN</th>
              <th className="hidden py-1.5 text-right font-normal sm:table-cell">Qty</th>
              <th className="py-1.5 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[#e4e2dc]">
              <td className="py-2 pr-2">{l.description}</td>
              <td className="relative py-2 pr-3 font-mono">
                <span
                  className={`absolute -inset-x-1 inset-y-1 rounded-sm border-2 transition-all duration-500 ${
                    highlight ? (confirmed ? "border-[#1d7a46] opacity-100" : "border-[#d98c00] opacity-100") : "opacity-0"
                  }`}
                />
                {l.hsn}
              </td>
              <td className="hidden py-2 text-right font-mono sm:table-cell">{l.qty}</td>
              <td className="py-2 text-right font-mono">{l.amount}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 flex justify-end gap-6 border-t border-[#d8d6cf] pt-2 text-[11px]">
          <span className="text-[#6b6d72]">Total USD</span>
          <span className="font-mono font-semibold">14,940.00</span>
        </div>
        <div className="mt-5 space-y-1.5" >
          <div className="h-1.5 w-3/4 rounded bg-[#e2e0d9]" />
          <div className="h-1.5 w-1/2 rounded bg-[#e2e0d9]" />
        </div>
      </div>
    </div>
  );
}
