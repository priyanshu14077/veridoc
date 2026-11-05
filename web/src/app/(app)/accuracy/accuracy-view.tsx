"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Accuracy, AccuracyGroup, AccuracyRow } from "@/lib/types";

const TARGET = 0.95; // the client's success metric (PRD §2)
const GROUPS: { group: AccuracyGroup; label: string }[] = [
  { group: "field", label: "By field" },
  { group: "supplier", label: "By supplier" },
];

const share = (r: AccuracyRow) => (r.fields ? r.correct / r.fields : 1);

function pct(x: number) {
  const v = Math.floor(x * 1000) / 10; // never round 99.96% up to 100%
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}

export function AccuracyView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const group: AccuracyGroup = params.get("group") === "supplier" ? "supplier" : "field";

  const q = useQuery({
    queryKey: ["accuracy", group],
    queryFn: () => api<Accuracy>(`/reports/accuracy?group=${group}`),
    placeholderData: keepPreviousData,
  });

  if (q.isError && q.error instanceof ApiError && q.error.status === 403) {
    return (
      <EmptyState
        title="Only managers can see this"
        body="The accuracy report is for the documentation manager."
        action={
          <Link href="/shipments" className="text-accent hover:underline">
            Back to shipments
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Accuracy</h1>
      <p className="mt-0.5 max-w-2xl text-muted">
        Of the values the AI read on exported shipments, the share people left unchanged. The target
        is {pct(TARGET)}. A shipment counts once it&apos;s exported, so this measures what was
        filed.
      </p>

      {q.isPending ? (
        <div className="mt-5 space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
          <div className="skeleton h-64 w-full" />
        </div>
      ) : q.isError ? (
        <div className="mt-5 rounded-md border border-line bg-surface">
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        </div>
      ) : q.data.shipments === 0 ? (
        <div className="mt-5 rounded-md border border-line bg-surface">
          <EmptyState
            title="No exported shipments yet"
            body="Accuracy is counted when a shipment is exported, so it reflects the values that were filed."
            action={
              <Link href="/shipments?status=cleared" className="text-accent hover:underline">
                See cleared shipments
              </Link>
            }
          />
        </div>
      ) : (
        <Report
          data={q.data}
          group={group}
          stale={q.isPlaceholderData}
          onGroup={(g) =>
            router.replace(g === "field" ? pathname : `${pathname}?group=${g}`, { scroll: false })
          }
        />
      )}
    </div>
  );
}

function Report({
  data,
  group,
  stale,
  onGroup,
}: {
  data: Accuracy;
  group: AccuracyGroup;
  stale: boolean;
  onGroup: (g: AccuracyGroup) => void;
}) {
  const t = data.total;
  const [showAll, setShowAll] = useState(false);
  const below = data.rows.filter((r) => share(r) < TARGET).length;
  // Rows nobody corrected say the same thing; fold them so the ones that matter stand out.
  const changed = data.rows.filter((r) => r.corrected > 0);
  const untouched = data.rows.length - changed.length;
  const visible = showAll || !changed.length ? data.rows : changed;
  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Left unchanged"
          value={pct(share(t))}
          note={`${t.correct.toLocaleString("en-IN")} of ${t.fields.toLocaleString("en-IN")} values`}
          warn={share(t) < TARGET}
        />
        <Stat label="Corrected by people" value={String(t.corrected)} note="AI value changed" />
        <Stat
          label="Missed by the flags"
          value={String(t.missed)}
          note={`Corrected, but scored ≥ ${data.threshold} and never flagged`}
          warn={t.missed > 0}
        />
        <Stat
          label="Exported shipments"
          value={String(data.shipments)}
          note={
            `${data.documents} documents` +
            (data.manual_documents ? ` · ${data.manual_documents} typed by hand, not counted` : "")
          }
        />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.group}
            type="button"
            onClick={() => onGroup(g.group)}
            aria-pressed={group === g.group}
            className={clsx(
              "rounded-full border px-3 py-1 text-sm",
              group === g.group
                ? "border-ink bg-ink text-surface"
                : "border-line-strong bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {g.label}
          </button>
        ))}
        <p className="ml-auto text-xs text-muted">
          {below ? `${below} below target, worst first` : "All at or above target"}
        </p>
      </div>

      <div className={clsx("mt-3 rounded-md border border-line bg-surface", stale && "opacity-60")}>
        <div
          className="hidden gap-4 border-b border-line px-4 py-2 text-xs text-muted md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px_90px]"
          aria-hidden
        >
          <span>{group === "field" ? "Field" : "Supplier"}</span>
          <span>Left unchanged</span>
          <span className="text-right">Corrected</span>
          <span className="text-right">Not flagged</span>
        </div>
        <ul className="divide-y divide-line">
          {visible.map((r) => (
            <Row key={r.key} r={r} />
          ))}
        </ul>
        {changed.length > 0 && untouched > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="flex w-full items-center justify-between border-t border-line px-4 py-2.5 text-left text-sm text-ink-2 hover:bg-paper"
          >
            {showAll
              ? "Hide the rows with no corrections"
              : `${untouched} more ${group === "field" ? "fields" : "suppliers"} with no corrections`}
            <ChevronDown
              aria-hidden
              className={clsx("size-4 text-muted transition-transform", showAll && "rotate-180")}
            />
          </button>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-xs text-muted">
        Values are compared the way the cross-checks read them, so &ldquo;3,165.00 KGS&rdquo; and
        &ldquo;3165&rdquo; are the same and a change of letter case isn&apos;t a correction. A line
        a person added counts as a miss. Documents typed by hand after the AI couldn&apos;t read
        them aren&apos;t counted.
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">
        <span className={clsx("num text-2xl font-semibold tracking-tight", warn && "text-unsure")}>
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{note}</span>
      </dd>
    </div>
  );
}

function Row({ r }: { r: AccuracyRow }) {
  const s = share(r);
  const low = s < TARGET;
  return (
    <li className="px-4 py-3 text-sm">
      <div className="grid items-center gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px_90px]">
        <p className="min-w-0 truncate font-medium" title={r.label}>
          {r.label}
        </p>
        <div className="flex items-center gap-3">
          <Meter value={s} label={`${r.correct} of ${r.fields} left unchanged`} />
          <span className="num w-14 shrink-0 text-right">{pct(s)}</span>
          {low && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-unsure">
              <AlertTriangle aria-hidden className="size-3.5" />
              <span className="sr-only md:not-sr-only">Below</span>
            </span>
          )}
        </div>
        <p className="num text-ink-2 md:text-right">
          <span className="text-muted md:hidden">Corrected </span>
          {r.corrected}
          <span className="text-muted"> / {r.fields}</span>
        </p>
        <p className={clsx("num md:text-right", r.missed ? "text-unsure" : "text-muted")}>
          <span className="text-muted md:hidden">Not flagged </span>
          {r.missed}
        </p>
      </div>
      {r.examples.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-xs text-ink-2">
          {r.examples.map((e, i) => (
            <li key={i} className="min-w-0">
              <Link
                href={`/shipments/${e.shipment_id}`}
                className="num text-accent hover:underline"
              >
                {e.shipment_ref}
              </Link>{" "}
              <span className="text-muted">{e.field}:</span>{" "}
              <span className="num">
                {e.ai_value ?? "(empty)"} → {e.final_value ?? "(empty)"}
              </span>{" "}
              <span className="text-muted">· {e.flagged ? "was flagged" : "not flagged"}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A plain bar with a tick at the target. Neutral ink: colour is kept for state. */
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={label}
      title={label}
      className="relative h-2 min-w-0 flex-1 rounded-full bg-info-soft"
    >
      <div
        className="h-full rounded-full bg-ink-2"
        style={{ width: `${Math.max(value * 100, 1)}%` }}
      />
      <div
        aria-hidden
        className="absolute -top-1 h-4 w-px bg-ink"
        style={{ left: `${TARGET * 100}%` }}
      />
    </div>
  );
}
