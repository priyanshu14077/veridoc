"use client";

import clsx from "clsx";
import { CheckCircle2, ChevronDown, CircleHelp, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AcceptForm } from "@/components/accept-form";
import { Button } from "@/components/ui";
import { DOC_LABEL, relativeTime } from "@/lib/format";
import type { Check, ShipmentDetail } from "@/lib/types";

/** One row per rule, open problems first, values side by side so a disagreement reads across. */
export function ChecksPanel({ shipment }: { shipment: ShipmentDetail }) {
  const [showPassed, setShowPassed] = useState(false);
  const [accepting, setAccepting] = useState<number | null>(null);
  const checks = shipment.checks;
  if (!checks.length) return null;

  const docId = new Map(shipment.documents.map((d) => [d.doc_type, d.id]));
  const open = checks.filter((c) => c.status !== "pass" && !c.accepted);
  const accepted = checks.filter((c) => c.status !== "pass" && c.accepted);
  const passed = checks.filter((c) => c.status === "pass");
  const locked = shipment.status === "exported";

  return (
    <section id="checks" className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="font-medium">Cross-checks</h2>
        <span className="text-xs text-muted">
          {open.length ? `${open.length} open · ` : ""}
          {passed.length} of {checks.length} pass
          {accepted.length ? ` · ${accepted.length} accepted` : ""}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {[...open, ...accepted].map((c) => (
          <li key={c.id} id={`check-${c.id}`} className="px-4 py-3">
            <CheckHead c={c} />
            <p className="mt-1 pl-7 text-sm text-ink-2">{c.message}</p>
            {c.shown.length > 0 && (
              <dl className="mt-2 ml-7 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-md bg-paper px-3 py-2 text-sm">
                {c.shown.map((s, i) => {
                  const doc = s.doc ? docId.get(s.doc) : undefined;
                  return (
                    <div key={i} className="contents">
                      <dt className="truncate text-muted" title={s.label}>
                        {s.label}
                      </dt>
                      <dd className="num text-right">
                        {doc && s.field_id ? (
                          <Link
                            href={`/shipments/${shipment.id}/documents/${doc}?field=${s.field_id}`}
                            className="underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                            title={`Open on the ${DOC_LABEL[s.doc!].toLowerCase()}`}
                          >
                            {s.value}
                          </Link>
                        ) : (
                          s.value
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {c.tolerance && (
              <p className="mt-1 pl-7 text-xs text-muted">Allowed difference: {c.tolerance}</p>
            )}
            {c.accepted ? (
              <p className="mt-2 ml-7 rounded-md border border-line px-3 py-2 text-sm">
                <span className="font-medium">Accepted by {c.accepted_by ?? "someone"}</span>
                {c.accepted_at && (
                  <span className="text-muted"> · {relativeTime(c.accepted_at)}</span>
                )}
                <span className="mt-0.5 block text-ink-2">“{c.accept_reason}”</span>
              </p>
            ) : (
              !locked &&
              (accepting === c.id ? (
                <div className="pl-7">
                  <AcceptForm
                    checkId={c.id}
                    shipmentId={shipment.id}
                    onDone={() => setAccepting(null)}
                    onCancel={() => setAccepting(null)}
                  />
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                  <Button variant="secondary" onClick={() => setAccepting(c.id)}>
                    Accept with reason
                  </Button>
                  <span className="text-xs text-muted">
                    or correct a value: click it above to open the document
                  </span>
                </div>
              ))
            )}
          </li>
        ))}
        {passed.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowPassed((v) => !v)}
              aria-expanded={showPassed}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-muted hover:bg-paper"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-4 text-clear" />
                {passed.length} check{passed.length > 1 ? "s" : ""} pass
              </span>
              <ChevronDown
                aria-hidden
                className={clsx("size-4 transition-transform", showPassed && "rotate-180")}
              />
            </button>
            {showPassed && (
              <ul className="space-y-1.5 px-4 pb-3 text-sm">
                {passed.map((c) => (
                  <li key={c.id} className="flex gap-2 pl-6">
                    <span className="num w-8 shrink-0 text-muted">{c.rule_id}</span>
                    <span>
                      {c.title}
                      <span className="text-muted"> · {c.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}

function CheckHead({ c }: { c: Check }) {
  const [Icon, tone, label] = c.accepted
    ? [ShieldCheck, "text-ink-2", "Accepted"]
    : c.status === "fail"
      ? [XCircle, "text-conflict", "Conflict"]
      : [CircleHelp, "text-unsure", "Can't check"];
  return (
    <div className="flex items-start gap-2">
      <Icon aria-hidden className={clsx("mt-0.5 size-5 shrink-0", tone)} />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{c.title}</span>
        <span className="num text-xs text-muted">{c.rule_id}</span>
        <span className={clsx("text-xs font-medium", tone)}>{label}</span>
      </div>
    </div>
  );
}
