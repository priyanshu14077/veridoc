"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Lock,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Box, DocViewer } from "@/components/doc-viewer";
import { Button, EmptyState, ErrorState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { DOC_LABEL, relativeTime } from "@/lib/format";
import type { DocumentDetail, FieldValue, HistoryEntry, ReviewResult } from "@/lib/types";

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

const KIND_HINT: Record<string, string> = {
  money: "As printed, e.g. 7,650.00",
  number: "As printed, e.g. 3,120.50",
  int: "A whole number, e.g. 320",
  date: "As printed, e.g. 08.10.2026",
  currency: "Three letters, e.g. USD",
  incoterm: "e.g. CIF",
  hsn: "8 digits, e.g. 85044090",
  containers: "Separate several with commas",
  country: "e.g. China",
};

export function ReviewView() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const search = useSearchParams();
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
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]" aria-busy="true">
          <div className="skeleton h-[70vh]" />
          <div className="space-y-3">
            <div className="skeleton h-36" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-9" />
            ))}
          </div>
        </div>
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState
            title="Document not found"
            body="It may have been replaced by a newer upload."
          />
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )
      ) : (
        <Review
          key={q.data.id}
          doc={q.data}
          docKey={docId}
          shipmentId={id}
          initialFieldId={Number(search.get("field")) || null}
        />
      )}
    </div>
  );
}

/** Header fields in section order, then line items in line order. J/K walk this list. */
function orderFields(fields: FieldValue[]): FieldValue[] {
  const header = SECTIONS.flatMap((s) =>
    fields.filter((f) => f.line_index === null && f.section === s.key),
  );
  return [...header, ...fields.filter((f) => f.line_index !== null)];
}

function useReviewMutations(docKey: string, docId: number, shipmentId: string) {
  const qc = useQueryClient();
  const key = ["document", docKey];
  const patchCache = (fn: (d: DocumentDetail) => DocumentDetail) =>
    qc.setQueryData<DocumentDetail>(key, (d) => (d ? fn(d) : d));
  const afterWrite = (res: ReviewResult) => {
    patchCache((d) => ({ ...d, flag_count: res.document_flag_count }));
    qc.invalidateQueries({ queryKey: ["shipment", shipmentId] });
    qc.invalidateQueries({ queryKey: ["shipments"] });
  };
  const replace = (changed: FieldValue[]) => {
    const byId = new Map(changed.map((f) => [f.id, f]));
    patchCache((d) => ({
      ...d,
      fields: d.fields.map((f) => byId.get(f.id) ?? f),
    }));
  };

  const save = useMutation({
    mutationFn: ({ f, body }: { f: FieldValue; body: { action?: "confirm"; value?: string } }) =>
      api<ReviewResult>(`/fields/${f.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: f.version, ...body }),
      }),
    onSuccess: (res, { f }) => {
      replace(res.fields);
      afterWrite(res);
      qc.invalidateQueries({ queryKey: ["history", f.id] });
    },
    onError: (e) => {
      // Someone saved first: show their value so the reviewer decides with current data.
      const body = e instanceof ApiError ? (e.body as { detail?: { field?: FieldValue } }) : null;
      if (e instanceof ApiError && e.status === 409 && body?.detail?.field) {
        replace([body.detail.field]);
      }
    },
  });
  const addLine = useMutation({
    mutationFn: () => api<ReviewResult>(`/documents/${docId}/lines`, { method: "POST" }),
    onSuccess: (res) => {
      patchCache((d) => ({ ...d, fields: [...d.fields, ...res.fields] }));
      afterWrite(res);
    },
  });
  const removeLine = useMutation({
    mutationFn: (lineIndex: number) =>
      api<ReviewResult>(`/documents/${docId}/lines/${lineIndex}`, {
        method: "DELETE",
      }),
    onSuccess: (res, lineIndex) => {
      patchCache((d) => ({
        ...d,
        fields: d.fields.filter((f) => f.line_index !== lineIndex),
      }));
      afterWrite(res);
    },
  });
  return { save, addLine, removeLine };
}

function Review({
  doc,
  docKey,
  shipmentId,
  initialFieldId,
}: {
  doc: DocumentDetail;
  docKey: string;
  shipmentId: string;
  initialFieldId: number | null;
}) {
  const ordered = useMemo(() => orderFields(doc.fields), [doc.fields]);
  const flagged = ordered.filter((f) => f.flag);
  const lineIndexes = [
    ...new Set(ordered.flatMap((f) => (f.line_index === null ? [] : [f.line_index]))),
  ];
  const lineNo = (i: number) => lineIndexes.indexOf(i) + 1;

  const [activeId, setActiveId] = useState<number | null>(
    () =>
      ordered.find((f) => f.id === initialFieldId)?.id ?? flagged[0]?.id ?? ordered[0]?.id ?? null,
  );
  const active = ordered.find((f) => f.id === activeId) ?? null;
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(active?.page ?? 1);
  const [tab, setTab] = useState<"fields" | "doc">("fields");
  const readOnly = doc.read_only_reason !== null;
  const qc = useQueryClient();
  const { save, addLine, removeLine } = useReviewMutations(docKey, doc.id, shipmentId);

  function select(f: FieldValue, opts: { edit?: boolean } = {}) {
    setActiveId(f.id);
    setEditing(Boolean(opts.edit) && !readOnly);
    save.reset();
    if (f.page) setPage(f.page);
    requestAnimationFrame(() =>
      document
        .getElementById(`field-${f.id}`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
  }

  function step(dir: 1 | -1, from: FieldValue | null = active, list: FieldValue[] = ordered) {
    const n = list.length;
    const idx = from ? list.findIndex((f) => f.id === from.id) : -1;
    for (let i = 1; i <= n; i++) {
      const f = list[(((idx + dir * i) % n) + n) % n];
      if (f.flag && f.id !== from?.id) return select(f);
    }
  }

  function write(f: FieldValue, body: { action?: "confirm"; value?: string }) {
    const wasFlagged = Boolean(f.flag);
    save.mutate(
      { f, body },
      {
        onSuccess: () => {
          setEditing(false);
          // Resolved a flag: move on to the next one, the way a checklist would.
          const latest = qc.getQueryData<DocumentDetail>(["document", docKey]);
          const now = latest && orderFields(latest.fields);
          const updated = now?.find((x) => x.id === f.id);
          if (wasFlagged && now && updated && !updated.flag) step(1, updated, now);
        },
      },
    );
  }
  const canConfirm = (f: FieldValue | null): f is FieldValue =>
    Boolean(f && !readOnly && f.flag === "low_confidence" && f.value);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || editing) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "Enter" && t.closest("button, a")) return; // let the focused control act
      if (e.key === "j") step(1);
      else if (e.key === "k") step(-1);
      else if (e.key === "Enter" && canConfirm(active)) write(active, { action: "confirm" });
      else if (e.key === "e" && active && !readOnly) setEditing(true);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const header = ordered.filter((f) => f.line_index === null);
  const lines = ordered.filter((f) => f.line_index !== null);
  const highlight =
    active?.bbox && active.page ? { page: active.page, box: active.bbox as Box } : null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{DOC_LABEL[doc.doc_type]}</h1>
        {flagged.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-unsure-soft px-2 py-0.5 text-xs font-medium text-unsure">
            <TriangleAlert aria-hidden className="size-3.5" /> {flagged.length} to check
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clear-soft px-2 py-0.5 text-xs font-medium text-clear">
            <CheckCircle2 aria-hidden className="size-3.5" /> All checked
          </span>
        )}
        <span className="hidden text-xs text-muted lg:ml-auto lg:inline">
          <Kbd>J</Kbd> <Kbd>K</Kbd> next / previous flag · <Kbd>Enter</Kbd> confirm · <Kbd>E</Kbd>{" "}
          edit · <Kbd>Esc</Kbd> cancel
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{doc.file_name}</p>
      {doc.read_only_reason && (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-info-soft px-4 py-3 text-sm text-ink-2">
          <Lock aria-hidden className="size-4" /> {doc.read_only_reason} Fields are read-only.
        </p>
      )}
      {doc.extraction_status === "manual" && (
        <p className="mt-3 rounded-md bg-unsure-soft px-4 py-3 text-sm text-unsure">
          The AI couldn&apos;t read this document reliably, so its values aren&apos;t shown. Type
          each field from the document.
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

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div
          className={clsx(
            "h-[75vh] min-w-0 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]",
            tab !== "doc" && "hidden lg:block",
          )}
        >
          <DocViewer
            url={`/api/documents/${doc.id}/file`}
            mime={doc.mime}
            page={page}
            onPageChange={setPage}
            highlight={highlight}
            label={DOC_LABEL[doc.doc_type]}
          />
        </div>

        <div
          className={clsx(
            "min-w-0 space-y-5 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1",
            tab !== "fields" && "hidden lg:block",
          )}
        >
          {active && (
            <FocusCard
              key={active.id}
              f={active}
              line={active.line_index === null ? null : lineNo(active.line_index)}
              readOnly={readOnly}
              editing={editing}
              setEditing={setEditing}
              onConfirm={() => write(active, { action: "confirm" })}
              onSave={(value) => write(active, { value })}
              canConfirm={canConfirm(active)}
              saving={save.isPending}
              error={save.error?.message ?? null}
              left={flagged.length}
              onStep={step}
            />
          )}

          {SECTIONS.map(({ key, label }) => {
            const rows = header.filter((f) => f.section === key);
            if (!rows.length) return null;
            return (
              <section key={key} className="rounded-md border border-line bg-surface">
                <h2 className="border-b border-line px-4 py-2 text-xs font-medium tracking-wide text-muted uppercase">
                  {label}
                </h2>
                <ul className="divide-y divide-line">
                  {rows.map((f) => (
                    <li key={f.id}>
                      <FieldButton
                        f={f}
                        active={f.id === activeId}
                        onSelect={() => select(f)}
                        onEdit={() => select(f, { edit: true })}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {(lines.length > 0 || doc.doc_type !== "bill_of_lading") && (
            <Lines
              fields={lines}
              lineIndexes={lineIndexes}
              activeId={activeId}
              readOnly={readOnly}
              onSelect={(f) => select(f)}
              onEdit={(f) => select(f, { edit: true })}
              onAdd={() =>
                addLine.mutate(undefined, {
                  onSuccess: (res) => res.fields[0] && select(res.fields[0], { edit: true }),
                })
              }
              adding={addLine.isPending}
              onRemove={(i) => removeLine.mutate(i)}
              removing={removeLine.isPending ? (removeLine.variables ?? null) : null}
              error={(addLine.error ?? removeLine.error)?.message ?? null}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="num rounded border border-line-strong bg-surface px-1 py-px text-[11px] text-ink-2">
      {children}
    </kbd>
  );
}

function StatusBadge({ f }: { f: FieldValue }) {
  if (f.status === "ai" || !f.value) return null;
  const [text, cls] =
    f.status === "confirmed"
      ? ["Confirmed", "text-clear"]
      : f.status === "edited"
        ? ["Corrected", "text-accent"]
        : ["Entered", "text-accent"];
  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs font-medium", cls)}>
      <Check aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

function Confidence({ f }: { f: FieldValue }) {
  if (f.value === null || f.status !== "ai") return null;
  return (
    <span
      className={clsx("num text-xs", f.flag ? "text-unsure" : "text-muted")}
      title="AI confidence after format checks"
    >
      {Math.round(f.confidence * 100)}%
    </span>
  );
}

function flagReason(f: FieldValue): string | null {
  if (f.flag === "missing_required")
    return "Required, and nothing was read. Type it from the document.";
  if (f.flag !== "low_confidence") return null;
  if (f.validator_errors.length)
    return `Fails a format check: ${f.validator_errors
      .map((e) => VALIDATOR_TEXT[e] ?? e)
      .join(", ")
      .toLowerCase()}.`;
  return `The AI wasn't sure (${Math.round(f.confidence * 100)}%). Check it against the document.`;
}

function FocusCard({
  f,
  line,
  readOnly,
  editing,
  setEditing,
  onConfirm,
  onSave,
  canConfirm,
  saving,
  error,
  left,
  onStep,
}: {
  f: FieldValue;
  line: number | null;
  readOnly: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onConfirm: () => void;
  onSave: (value: string) => void;
  canConfirm: boolean;
  saving: boolean;
  error: string | null;
  left: number;
  onStep: (dir: 1 | -1) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const reason = flagReason(f);

  return (
    <section
      aria-label="Selected field"
      className={clsx(
        "sticky top-0 z-10 rounded-md border bg-surface shadow-[0_1px_0_var(--color-line)]",
        f.flag ? "border-unsure/40" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="text-xs text-muted">
          {left ? `${left} left to check` : "Nothing left to check"}
        </span>
        <div className="flex gap-1">
          <IconButton label="Previous flag (K)" onClick={() => onStep(-1)} disabled={!left}>
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton label="Next flag (J)" onClick={() => onStep(1)} disabled={!left}>
            <ChevronDown className="size-4" />
          </IconButton>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">
            {f.label}
            {line !== null && <span className="text-muted"> · line {line}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <Confidence f={f} />
            <StatusBadge f={f} />
          </div>
        </div>

        {editing ? (
          <EditForm
            f={f}
            saving={saving}
            error={error}
            onSave={onSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <p
              className={clsx(
                "mt-1 text-lg break-words",
                f.kind !== "text" && f.kind !== "country" && "num",
              )}
            >
              {f.value ?? <span className="text-base text-muted">Empty</span>}
            </p>
            {f.normalized !== null && String(f.normalized) !== f.value && (
              <p className="num text-xs text-muted">Read as {formatNorm(f.normalized)}</p>
            )}
            {f.status !== "ai" && f.ai_value !== f.value && (
              <p className="mt-1 text-xs text-muted">
                AI read: <span className="num">{f.ai_value ?? "nothing"}</span>
              </p>
            )}
            {reason && <p className="mt-2 text-sm text-unsure">{reason}</p>}
            {!reason &&
              f.status !== "ai" &&
              f.validator_errors.map((e) => (
                <p key={e} className="mt-1 text-xs text-unsure">
                  Note: {VALIDATOR_TEXT[e] ?? e}
                </p>
              ))}
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                {canConfirm && (
                  <Button variant="primary" onClick={onConfirm} loading={saving}>
                    <Check aria-hidden className="size-4" /> Confirm
                  </Button>
                )}
                <Button onClick={() => setEditing(true)}>
                  <Pencil aria-hidden className="size-4" /> {f.value ? "Edit" : "Enter value"}
                </Button>
                {f.version > 1 && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowHistory((v) => !v)}
                    aria-expanded={showHistory}
                  >
                    <History aria-hidden className="size-4" /> History
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {error && (
          <p id="field-error" role="alert" className="mt-2 text-sm text-conflict">
            {error}
          </p>
        )}
        {showHistory && !editing && <HistoryList fieldId={f.id} />}
      </div>
    </section>
  );
}

function EditForm({
  f,
  saving,
  error,
  onSave,
  onCancel,
}: {
  f: FieldValue;
  saving: boolean;
  error: string | null;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(f.value ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <label className="sr-only" htmlFor="field-input">
        {f.label}
      </label>
      <input
        id="field-input"
        ref={input}
        className={clsx("input w-full", f.kind !== "text" && f.kind !== "country" && "num")}
        value={draft}
        maxLength={500}
        placeholder={KIND_HINT[f.kind] ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "field-error" : undefined}
      />
      {KIND_HINT[f.kind] && <p className="mt-1 text-xs text-muted">{KIND_HINT[f.kind]}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" loading={saving}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const ACTION_TEXT: Record<string, string> = {
  confirmed: "confirmed",
  edited: "changed",
};

function HistoryList({ fieldId }: { fieldId: number }) {
  const q = useQuery({
    queryKey: ["history", fieldId],
    queryFn: () => api<HistoryEntry[]>(`/fields/${fieldId}/history`),
  });
  if (q.isPending) return <div className="skeleton mt-3 h-12" aria-busy="true" />;
  if (q.isError) return <p className="mt-3 text-sm text-conflict">{q.error.message}</p>;
  if (!q.data.length) return <p className="mt-3 text-sm text-muted">No changes yet.</p>;
  return (
    <ol className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
      {q.data.map((h, i) => (
        <li key={i} className="text-ink-2">
          <span className="font-medium text-ink">{h.actor ?? "Someone"}</span>{" "}
          {ACTION_TEXT[h.action] ?? h.action}
          {h.action === "edited" && (
            <>
              {" "}
              <span className="num">{h.before?.value ?? "empty"}</span> →{" "}
              <span className="num">{h.after?.value ?? "empty"}</span>
            </>
          )}
          <span className="text-muted"> · {relativeTime(h.at)}</span>
        </li>
      ))}
    </ol>
  );
}

function IconButton({
  label,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className="inline-flex size-7 items-center justify-center rounded text-ink-2 hover:bg-info-soft disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function FieldButton({
  f,
  active,
  onSelect,
  onEdit,
}: {
  f: FieldValue;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <button
      id={`field-${f.id}`}
      type="button"
      onClick={onSelect}
      onDoubleClick={onEdit}
      aria-current={active || undefined}
      className={clsx(
        "grid w-full grid-cols-[130px_1fr_auto] items-start gap-3 px-4 py-2.5 text-left",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        f.flag ? "bg-unsure-soft/60 hover:bg-unsure-soft" : "hover:bg-paper",
        active && "shadow-[inset_3px_0_0_var(--color-accent)]",
      )}
    >
      <span className="text-sm text-muted">{f.label}</span>
      <span className="min-w-0">
        <span
          className={clsx("block break-words", f.kind !== "text" && f.kind !== "country" && "num")}
        >
          {f.value ?? <span className="text-muted">{f.required ? "Not read" : "Not printed"}</span>}
        </span>
      </span>
      <span className="flex items-center gap-1.5 pt-0.5">
        <Confidence f={f} />
        <StatusBadge f={f} />
        {f.flag && <TriangleAlert aria-label="Needs checking" className="size-4 text-unsure" />}
      </span>
    </button>
  );
}

function formatNorm(v: unknown): string {
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function Lines({
  fields,
  lineIndexes,
  activeId,
  readOnly,
  onSelect,
  onEdit,
  onAdd,
  adding,
  onRemove,
  removing,
  error,
}: {
  fields: FieldValue[];
  lineIndexes: number[];
  activeId: number | null;
  readOnly: boolean;
  onSelect: (f: FieldValue) => void;
  onEdit: (f: FieldValue) => void;
  onAdd: () => void;
  adding: boolean;
  onRemove: (lineIndex: number) => void;
  removing: number | null;
  error: string | null;
}) {
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const keys = Array.from(new Map(fields.map((f) => [f.key, f.label])).entries());
  const cell = new Map(fields.map((f) => [`${f.line_index}:${f.key}`, f]));
  const canRemove = !readOnly && lineIndexes.length > 1;

  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-1.5">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">
          Line items · {lineIndexes.length}
        </h2>
        {!readOnly && (
          <Button variant="ghost" className="h-8" onClick={onAdd} loading={adding}>
            <Plus aria-hidden className="size-4" /> Add line
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-4 pt-2 text-sm text-conflict">
          {error}
        </p>
      )}
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
              {canRemove && (
                <th className="px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lineIndexes.map((li, n) => (
              <tr key={li} className="border-b border-line last:border-0">
                <td className="num px-3 py-2 text-muted">{n + 1}</td>
                {keys.map(([k]) => {
                  const f = cell.get(`${li}:${k}`);
                  if (!f) return <td key={k} />;
                  return (
                    <td key={k} className="p-0 align-top">
                      <button
                        id={`field-${f.id}`}
                        type="button"
                        onClick={() => onSelect(f)}
                        onDoubleClick={() => onEdit(f)}
                        aria-current={f.id === activeId || undefined}
                        aria-label={`${f.label}, line ${n + 1}: ${f.value ?? "empty"}${f.flag ? ", needs checking" : ""}`}
                        className={clsx(
                          "block w-full px-3 py-2 text-left",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                          k !== "description" && "num whitespace-nowrap",
                          f.flag ? "bg-unsure-soft/60 hover:bg-unsure-soft" : "hover:bg-paper",
                          f.id === activeId && "outline-2 -outline-offset-2 outline-accent",
                        )}
                      >
                        {f.value ?? <span className="text-muted">—</span>}
                        {f.flag && (
                          <TriangleAlert aria-hidden className="ml-1 inline size-3.5 text-unsure" />
                        )}
                        {f.status !== "ai" && f.value && (
                          <Check aria-hidden className="ml-1 inline size-3.5 text-clear" />
                        )}
                      </button>
                    </td>
                  );
                })}
                {canRemove && (
                  <td className="px-1 py-1 text-right align-top whitespace-nowrap">
                    {confirmRemove === li ? (
                      <span className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-conflict"
                          loading={removing === li}
                          onClick={() => onRemove(li)}
                        >
                          Remove
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => setConfirmRemove(null)}
                        >
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <IconButton
                        label={`Remove line ${n + 1}`}
                        onClick={() => setConfirmRemove(li)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
