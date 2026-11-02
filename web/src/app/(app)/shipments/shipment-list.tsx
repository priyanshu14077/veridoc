"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/components/app-shell";
import { STATUS_META, STATUS_ORDER, StatusChip } from "@/components/status-chip";
import { Button, EmptyState, ErrorState } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { ShipmentList, ShipmentRow, ShipmentStatus, TeamMember } from "@/lib/types";

const PAGE_SIZE = 25;

function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = params.get("status") as ShipmentStatus | null;
  const q = params.get("q") ?? "";
  const assignee = params.get("assignee") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  function set(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!("page" in next)) p.delete("page");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  return { status, q, assignee, page, set };
}

export function ShipmentListView() {
  const f = useFilters();
  const me = useMe();
  const [search, setSearch] = useState(f.q);

  // Debounce typing into the URL (and so into the query key).
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== f.q) f.set({ q: search.trim() || null });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const qs = new URLSearchParams();
  if (f.status) qs.set("status", f.status);
  if (f.q) qs.set("q", f.q);
  if (f.assignee) qs.set("assignee", f.assignee);
  qs.set("page", String(f.page));
  qs.set("page_size", String(PAGE_SIZE));

  const list = useQuery({
    queryKey: ["shipments", qs.toString()],
    queryFn: () => api<ShipmentList>(`/shipments?${qs}`),
    placeholderData: keepPreviousData,
  });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<TeamMember[]>("/users") });

  const counts = list.data?.status_counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const filtersOn = Boolean(f.status || f.q || f.assignee);
  const executives = (team.data ?? []).filter((t) => t.role === "executive");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
          <p className="mt-0.5 text-muted">
            {me.data?.role === "manager"
              ? "Every shipment across the team."
              : "Shipments assigned to you, plus the unassigned pool."}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0"
        >
          <StatusTab active={!f.status} onClick={() => f.set({ status: null })} label="All" n={all} />
          {STATUS_ORDER.map((s) => (
            <StatusTab
              key={s}
              active={f.status === s}
              onClick={() => f.set({ status: s })}
              label={STATUS_META[s].label}
              n={counts[s] ?? 0}
            />
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <label className="relative flex-1 lg:w-72 lg:flex-none">
            <span className="sr-only">Search shipments</span>
            <Search aria-hidden className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ref, importer or supplier"
              maxLength={80}
              className="input pl-9"
            />
          </label>
          <label>
            <span className="sr-only">Assignee</span>
            <select
              value={f.assignee}
              onChange={(e) => f.set({ assignee: e.target.value || null })}
              className="input w-auto pr-8"
            >
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {me.data?.role === "manager" &&
                executives.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      {/* Results */}
      <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface">
        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          filtersOn ? (
            <EmptyState
              title="No shipments match"
              body="Try a different search or clear the filters."
              action={
                <Button
                  onClick={() => {
                    setSearch("");
                    f.set({ status: null, q: null, assignee: null });
                  }}
                >
                  <X aria-hidden className="size-4" /> Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No shipments yet"
              body="Shipments you create, or that are assigned to you, show up here."
            />
          )
        ) : (
          <div className={clsx(list.isPlaceholderData && "opacity-60 transition-opacity")}>
            <DesktopTable rows={list.data.items} />
            <MobileList rows={list.data.items} />
          </div>
        )}
      </div>

      {list.data && list.data.total > PAGE_SIZE && (
        <Pager
          page={f.page}
          total={list.data.total}
          onPage={(p) => f.set({ page: String(p) })}
        />
      )}
    </div>
  );
}

function StatusTab({
  active,
  onClick,
  label,
  n,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  n: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap",
        active ? "bg-ink text-white" : "text-ink-2 hover:bg-info-soft",
      )}
    >
      {label}
      <span className={clsx("num text-xs", active ? "text-white/70" : "text-muted")}>{n}</span>
    </button>
  );
}

function Flags({ n }: { n: number }) {
  if (n === 0) return <span className="num text-muted">—</span>;
  return (
    <span className="num inline-flex min-w-6 justify-center rounded-full bg-unsure-soft px-1.5 text-xs font-medium text-unsure">
      {n}
      <span className="sr-only"> open flags</span>
    </span>
  );
}

function DesktopTable({ rows }: { rows: ShipmentRow[] }) {
  return (
    <table className="hidden w-full text-left md:table">
      <thead>
        <tr className="border-b border-line text-xs font-medium text-muted">
          <th className="py-2.5 pr-4 pl-4 font-medium">Shipment</th>
          <th className="py-2.5 pr-4 font-medium">Supplier</th>
          <th className="py-2.5 pr-4 font-medium">Importer</th>
          <th className="py-2.5 pr-4 font-medium">Status</th>
          <th className="py-2.5 pr-4 text-center font-medium">Flags</th>
          <th className="py-2.5 pr-4 font-medium">Assignee</th>
          <th className="py-2.5 pr-4 text-right font-medium">Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="group relative h-11 border-b border-line last:border-0 hover:bg-paper"
          >
            <td className="pr-4 pl-4">
              {/* Whole row is clickable via the stretched link; keyboard users tab to the ref. */}
              <Link
                href={`/shipments/${r.id}`}
                className="num font-medium text-ink after:absolute after:inset-0 group-hover:text-accent"
              >
                {r.ref}
              </Link>
            </td>
            <td className="pr-4">
              {r.supplier ? (
                <>
                  {r.supplier.name} <span className="text-muted">· {r.supplier.country}</span>
                </>
              ) : (
                <span className="text-muted">Not set</span>
              )}
            </td>
            <td className="max-w-[240px] truncate pr-4 text-ink-2">{r.importer.name}</td>
            <td className="pr-4">
              <StatusChip status={r.status} />
            </td>
            <td className="pr-4 text-center">
              <Flags n={r.open_flags} />
            </td>
            <td className="pr-4 text-ink-2">
              {r.assignee?.name ?? <span className="text-muted">Unassigned</span>}
            </td>
            <td className="pr-4 text-right text-muted" title={new Date(r.updated_at).toLocaleString("en-IN")}>
              {relativeTime(r.updated_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MobileList({ rows }: { rows: ShipmentRow[] }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/shipments/${r.id}`} className="block px-4 py-3 active:bg-paper">
            <div className="flex items-center justify-between gap-3">
              <span className="num font-medium">{r.ref}</span>
              <StatusChip status={r.status} />
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted">
              <span className="truncate">
                {r.supplier?.name ?? "No supplier"} → {r.importer.name}
              </span>
              <span className="shrink-0">{relativeTime(r.updated_at)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading shipments" className="divide-y divide-line">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-6 px-4">
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-3.5 w-32" />
          <div className="skeleton hidden h-3.5 w-44 md:block" />
          <div className="skeleton h-5 w-24 rounded-full" />
          <div className="skeleton ml-auto hidden h-3.5 w-16 md:block" />
        </div>
      ))}
    </div>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span className="num">
        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
