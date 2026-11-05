"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ExportPreview as Preview, ShipmentDetail } from "@/lib/types";

const LINE_COLUMNS = ["line_no", "description", "hsn", "qty", "unit", "unit_price", "line_amount"];

/** What the CSV will contain, built from the current values. Collapsed until asked for. */
export function ExportPreview({ shipment }: { shipment: ShipmentDetail }) {
  const [open, setOpen] = useState(false);
  const id = String(shipment.id);
  const q = useQuery({
    queryKey: ["export-preview", id],
    queryFn: () => api<Preview>(`/shipments/${id}/export/preview`),
    enabled: open,
  });
  if (!shipment.documents.length) return null;

  const head = q.data?.rows.find((r) => r.record_type === "H");
  const lines = q.data?.rows.filter((r) => r.record_type === "L") ?? [];
  const headCols = q.data?.columns.filter(
    (c) =>
      c !== "record_type" &&
      c !== "shipment_ref" &&
      !LINE_COLUMNS.includes(c) &&
      c !== "country_of_origin",
  );

  return (
    <section className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-paper"
      >
        <span>
          <span className="font-medium">Export preview</span>
          <span className="ml-2 text-xs text-muted">
            {shipment.status === "exported" ? "what was filed" : "what the CSV will contain"}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={clsx("size-4 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {q.isPending ? (
            <div className="skeleton h-32 w-full" aria-busy="true" />
          ) : q.isError ? (
            <p role="alert" className="text-sm text-conflict">
              {q.error.message}{" "}
              <button className="underline" onClick={() => q.refetch()}>
                Try again
              </button>
            </p>
          ) : (
            <>
              {q.data.blockers.length > 0 && (
                <p className="mb-3 rounded-md bg-unsure-soft px-3 py-2 text-xs text-unsure">
                  Draft only: {q.data.blockers.length} open item
                  {q.data.blockers.length > 1 ? "s" : ""} still to clear, so some values may change.
                </p>
              )}
              <h3 className="text-xs font-medium text-muted">Header row (H)</h3>
              <dl className="mt-1.5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {headCols?.map((c) => (
                  <div
                    key={c}
                    className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-1"
                  >
                    <dt className="num shrink-0 text-xs text-muted">{c}</dt>
                    <dd
                      className={clsx("num truncate text-right", !head?.[c] && "text-muted")}
                      title={head?.[c]}
                    >
                      {head?.[c] || "blank"}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-4 text-xs font-medium text-muted">
                Line rows (L) · {lines.length} · origin {lines[0]?.country_of_origin || "blank"}
              </h3>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      {LINE_COLUMNS.map((c) => (
                        <th
                          key={c}
                          scope="col"
                          className={clsx(
                            "num py-1.5 pr-3 font-medium",
                            c !== "description" && c !== "unit" && "text-right",
                          )}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((r) => (
                      <tr key={r.line_no} className="border-b border-line last:border-0">
                        {LINE_COLUMNS.map((c) => (
                          <td
                            key={c}
                            className={clsx(
                              "py-1.5 pr-3",
                              c === "description" ? "max-w-[260px] truncate" : "num",
                              c !== "description" && c !== "unit" && "text-right",
                            )}
                            title={c === "description" ? r[c] : undefined}
                          >
                            {r[c] || <span className="text-muted">–</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">
                Numbers are written without thousands separators and dates as DD/MM/YYYY. A cell
                that starts with = + - or @ gets a leading &apos; so a spreadsheet can&apos;t run it
                as a formula.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
