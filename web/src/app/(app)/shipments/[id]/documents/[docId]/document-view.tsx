"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { DOC_LABEL } from "@/lib/format";
import type { DocumentDetail, FieldValue } from "@/lib/types";

const SECTIONS: { key: FieldValue["section"]; label: string }[] = [
  { key: "parties", label: "Parties" },
  { key: "document", label: "Document" },
  { key: "shipping", label: "Shipping" },
  { key: "totals", label: "Totals" },
];

const VALIDATOR_TEXT: Record<string, string> = {
  hsn_not_8_digits: "HSN should have 8 digits",
  unknown_currency: "Not a currency code",
  unknown_incoterm: "Not an Incoterms 2020 term",
  container_check_digit: "Container check digit is wrong",
  date_in_future: "Date is in the future",
  date_too_old: "Date is over 2 years old",
  not_positive: "Should be more than zero",
  not_whole_number: "Should be a whole number",
  unparseable: "Couldn't read this as the expected type",
};

export function DocumentView() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const [tab, setTab] = useState<"doc" | "fields">("fields");
  const q = useQuery({
    queryKey: ["document", docId],
    queryFn: () => api<DocumentDetail>(`/documents/${encodeURIComponent(docId)}`),
  });

  return (
    <div>
      <Link
        href={`/shipments/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" /> Shipment
      </Link>
      {q.isPending ? (
        <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]" aria-busy="true">
          <div className="skeleton h-[70vh]" />
          <div className="space-y-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="skeleton h-9" />
            ))}
          </div>
        </div>
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState title="Document not found" body="It may have been replaced by a newer upload." />
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )
      ) : (
        <Loaded doc={q.data} tab={tab} setTab={setTab} />
      )}
    </div>
  );
}

function Loaded({
  doc,
  tab,
  setTab,
}: {
  doc: DocumentDetail;
  tab: "doc" | "fields";
  setTab: (t: "doc" | "fields") => void;
}) {
  const header = doc.fields.filter((f) => f.line_index === null);
  const lines = doc.fields.filter((f) => f.line_index !== null);
  const flagged = doc.fields.filter((f) => f.flag);
  const fileUrl = `/api/documents/${doc.id}/file`;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{DOC_LABEL[doc.doc_type]}</h1>
        {flagged.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-unsure-soft px-2 py-0.5 text-xs font-medium text-unsure">
            <TriangleAlert aria-hidden className="size-3.5" /> {flagged.length} to check
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clear-soft px-2 py-0.5 text-xs font-medium text-clear">
            <CheckCircle2 aria-hidden className="size-3.5" /> All confident
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{doc.file_name}</p>
      {doc.extraction_status === "manual" && (
        <p className="mt-3 rounded-md bg-unsure-soft px-4 py-3 text-sm text-unsure">
          The AI couldn&apos;t read this document reliably, so its values aren&apos;t shown. Read
          them from the document on the left.
        </p>
      )}

      <div role="tablist" className="mt-4 flex gap-1 lg:hidden">
        {(["fields", "doc"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              "h-8 rounded-md px-3 text-sm",
              tab === t ? "bg-ink text-white" : "text-ink-2 hover:bg-info-soft",
            )}
          >
            {t === "fields" ? "Fields" : "Document"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className={clsx(tab !== "doc" && "hidden lg:block")}>
          <div className="sticky top-20 overflow-hidden rounded-md border border-line bg-surface">
            {doc.mime === "application/pdf" ? (
              <iframe title="Document" src={`${fileUrl}#view=FitH`} className="h-[75vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={DOC_LABEL[doc.doc_type]} className="w-full" />
            )}
          </div>
        </div>

        <div className={clsx("space-y-5", tab !== "fields" && "hidden lg:block")}>
          {SECTIONS.map(({ key, label }) => {
            const rows = header.filter((f) => f.section === key);
            if (!rows.length) return null;
            return (
              <section key={key} className="rounded-md border border-line bg-surface">
                <h2 className="border-b border-line px-4 py-2 text-xs font-medium tracking-wide text-muted uppercase">
                  {label}
                </h2>
                <dl className="divide-y divide-line">
                  {rows.map((f) => (
                    <FieldRowView key={f.id} f={f} />
                  ))}
                </dl>
              </section>
            );
          })}
          {lines.length > 0 && <Lines fields={lines} />}
        </div>
      </div>
    </>
  );
}

function Confidence({ f }: { f: FieldValue }) {
  if (f.value === null) return null;
  const pct = Math.round(f.confidence * 100);
  return (
    <span
      className={clsx("num text-xs", f.flag ? "text-unsure" : "text-muted")}
      title="AI confidence after format checks"
    >
      {pct}%
    </span>
  );
}

function FieldRowView({ f }: { f: FieldValue }) {
  const tone =
    f.flag === "missing_required" || f.flag === "low_confidence" ? "bg-unsure-soft/60" : "";
  return (
    <div className={clsx("grid grid-cols-[140px_1fr_auto] items-start gap-3 px-4 py-2.5", tone)}>
      <dt className="text-sm text-muted">{f.label}</dt>
      <dd className="min-w-0">
        <div className={clsx("break-words", f.kind !== "text" && f.kind !== "country" && "num")}>
          {f.value ?? <span className="text-muted">{f.required ? "Not read" : "Not printed"}</span>}
        </div>
        {f.normalized !== null && String(f.normalized) !== f.value && (
          <div className="num text-xs text-muted">→ {formatNorm(f.normalized)}</div>
        )}
        {f.validator_errors.map((e) => (
          <div key={e} className="mt-0.5 text-xs text-unsure">
            {VALIDATOR_TEXT[e] ?? e}
          </div>
        ))}
      </dd>
      <div className="flex items-center gap-1.5 pt-0.5">
        <Confidence f={f} />
        {f.flag && <TriangleAlert aria-label="Needs checking" className="size-4 text-unsure" />}
      </div>
    </div>
  );
}

function formatNorm(v: unknown): string {
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function Lines({ fields }: { fields: FieldValue[] }) {
  const keys = Array.from(new Map(fields.map((f) => [f.key, f.label])).entries());
  const rows = new Map<number, Map<string, FieldValue>>();
  for (const f of fields) {
    const row = rows.get(f.line_index!) ?? new Map();
    row.set(f.key, f);
    rows.set(f.line_index!, row);
  }
  return (
    <section className="rounded-md border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-2 text-xs font-medium tracking-wide text-muted uppercase">
        Line items
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">#</th>
              {keys.map(([k, label]) => (
                <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows.entries()].map(([i, row]) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="num px-3 py-2 text-muted">{i + 1}</td>
                {keys.map(([k]) => {
                  const f = row.get(k);
                  return (
                    <td
                      key={k}
                      className={clsx(
                        "px-3 py-2 align-top",
                        f?.flag && "bg-unsure-soft/60",
                        k !== "description" && "num whitespace-nowrap",
                      )}
                      title={f ? `${Math.round(f.confidence * 100)}% confidence` : undefined}
                    >
                      {f?.value ?? <span className="text-muted">—</span>}
                      {f?.flag && <TriangleAlert aria-label="Needs checking" className="ml-1 inline size-3.5 text-unsure" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
