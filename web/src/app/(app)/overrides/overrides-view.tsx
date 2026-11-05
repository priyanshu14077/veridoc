"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { PencilLine, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { OverrideKind, OverrideRow, Overrides } from "@/lib/types";

const KINDS: { kind: OverrideKind | null; label: string }[] = [
  { kind: null, label: "All" },
  { kind: "accepted", label: "Accepted mismatches" },
  { kind: "edited", label: "Corrected values" },
  { kind: "reopened", label: "Reopens" },
];
const RANGES = [7, 30, 90, 365];

const KIND_META: Record<OverrideKind, { label: string; Icon: typeof ShieldCheck }> = {
  accepted: { label: "Accepted", Icon: ShieldCheck },
  edited: { label: "Corrected", Icon: PencilLine },
  reopened: { label: "Reopened", Icon: RotateCcw },
};

function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function OverridesView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const kind = params.get("kind") as OverrideKind | null;
  const days = RANGES.includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;

  function set(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const qs = new URLSearchParams({ since: isoDaysAgo(days) });
  if (kind) qs.set("kind", kind);
  const q = useQuery({
    queryKey: ["overrides", qs.toString()],
    queryFn: () => api<Overrides>(`/reports/overrides?${qs}`),
    placeholderData: keepPreviousData,
  });

  if (q.isError && q.error instanceof ApiError && q.error.status === 403) {
    return (
      <EmptyState
        title="Only managers can see this"
        body="The overrides log is for the documentation manager's after-the-fact review."
        action={
          <Link href="/shipments" className="text-accent hover:underline">
            Back to shipments
          </Link>
        }
      />
    );
  }

  const counts = q.data?.counts;
  const total = counts ? counts.accepted + counts.edited + counts.reopened : undefined;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Overrides</h1>
      <p className="mt-0.5 max-w-2xl text-muted">
        Every mismatch someone accepted, every value changed from what the AI read, and every
        reopen, with who did it and why. Executives export on their own, so this is where they get
        reviewed.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => {
          const n = k.kind ? counts?.[k.kind] : total;
          const active = kind === k.kind;
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => set({ kind: k.kind })}
              aria-pressed={active}
              className={clsx(
                "rounded-full border px-3 py-1 text-sm",
                active
                  ? "border-ink bg-ink text-surface"
                  : "border-line-strong bg-surface text-ink-2 hover:text-ink",
              )}
            >
              {k.label}
              {n !== undefined && <span className="num ml-1.5 opacity-70">{n}</span>}
            </button>
          );
        })}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          Since
          <select
            className="input h-8 py-0"
            value={days}
            onChange={(e) => set({ days: e.target.value === "30" ? null : e.target.value })}
          >
            {RANGES.map((d) => (
              <option key={d} value={d}>
                {d === 365 ? "the last year" : `the last ${d} days`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={clsx(
          "mt-4 rounded-md border border-line bg-surface",
          q.isPlaceholderData && "opacity-60",
        )}
      >
        {q.isPending ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            body={
              kind
                ? "No entries of this kind in this period. Try a longer range or All."
                : "No one accepted a mismatch, corrected a value or reopened a shipment in this period."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items.map((r) => (
              <Entry key={r.id} r={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Entry({ r }: { r: OverrideRow }) {
  const { label, Icon } = KIND_META[r.kind];
  return (
    <li className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm md:grid-cols-[140px_110px_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center gap-2 md:block">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon aria-hidden className="size-4 text-muted" /> {label}
        </span>
        <span
          className="text-xs text-muted md:mt-0.5 md:block"
          title={new Date(r.at).toLocaleString("en-IN")}
        >
          {relativeTime(r.at)} · {r.actor ?? "Unknown"}
        </span>
      </div>
      <div>
        {r.shipment_id && r.shipment_ref ? (
          <Link href={`/shipments/${r.shipment_id}`} className="num text-accent hover:underline">
            {r.shipment_ref}
          </Link>
        ) : (
          <span className="text-muted">–</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-medium">{r.subject}</p>
        <p className={clsx("text-ink-2", r.kind === "edited" && "num")}>{r.detail}</p>
      </div>
      <div className="min-w-0">
        {r.reason ? (
          <p className="text-ink-2">“{r.reason}”</p>
        ) : (
          <p className="text-muted">
            {r.kind === "edited" ? "No reason needed for a correction" : "–"}
          </p>
        )}
        {r.still_applies === false && (
          <p className="mt-1 inline-block rounded bg-info-soft px-1.5 py-0.5 text-xs text-muted">
            No longer applies: the values changed after it was accepted
          </p>
        )}
      </div>
    </li>
  );
}
