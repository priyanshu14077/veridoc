"use client";

import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { useMe } from "@/components/app-shell";
import { ReasonForm } from "@/components/accept-form";
import { Button, buttonClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { ExportRecord, Flag, ShipmentDetail, ShipmentStatus } from "@/lib/types";

const fileUrl = (e: ExportRecord) => `/api/exports/${e.id}/file`;

function download(e: ExportRecord) {
  const a = document.createElement("a");
  a.href = fileUrl(e);
  a.download = e.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Why Export is disabled, in words, or null when it's ready. The server checks again. */
function notReady(s: ShipmentDetail): string | null {
  const n = s.open_flags;
  const reasons: Partial<Record<ShipmentStatus, string>> = {
    draft: "Upload the shipment's documents first.",
    extracting: "Wait for the documents to finish reading.",
    needs_review: n
      ? `Clear the ${n} open item${n > 1 ? "s" : ""} above first.`
      : "Clear the open items above first.",
  };
  return reasons[s.status] ?? null;
}

function blockersOf(err: unknown): Flag[] {
  if (!(err instanceof ApiError) || err.status !== 409) return [];
  const d = (err.body as { detail?: { blockers?: Flag[] } } | undefined)?.detail;
  return d?.blockers ?? [];
}

export function ExportCard({
  shipment,
  className,
}: {
  shipment: ShipmentDetail;
  className?: string;
}) {
  const me = useMe();
  const uid = useId();
  const qc = useQueryClient();
  const id = String(shipment.id);
  const [reopening, setReopening] = useState(false);

  const history = useQuery({
    queryKey: ["exports", id],
    queryFn: () => api<ExportRecord[]>(`/shipments/${id}/exports`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shipment", id] });
    qc.invalidateQueries({ queryKey: ["shipments"] });
    qc.invalidateQueries({ queryKey: ["exports", id] });
    qc.invalidateQueries({ queryKey: ["export-preview", id] });
    qc.invalidateQueries({ queryKey: ["document"] });
  };
  const run = useMutation({
    mutationFn: () => api<ExportRecord>(`/shipments/${id}/export`, { method: "POST" }),
    onSuccess: (e) => {
      download(e);
      refresh();
    },
    // A 409 means something changed since this page loaded; show the fresh state.
    onError: refresh,
  });
  const reopen = useMutation({
    mutationFn: (reason: string) =>
      api<{ status: ShipmentStatus }>(`/shipments/${id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      setReopening(false);
      refresh();
    },
  });

  const exported = shipment.status === "exported";
  const versions = history.data ?? [];
  const latest = exported ? versions[0] : undefined;
  const earlier = exported ? versions.slice(1) : versions;
  const blocked = notReady(shipment);
  const blockers = blockersOf(run.error);

  return (
    <section
      className={clsx("rounded-md border border-line bg-surface p-4 text-sm", className)}
      aria-labelledby={`${uid}-h`}
    >
      <h2 id={`${uid}-h`} className="flex items-center gap-2 font-medium">
        <FileUp aria-hidden className="size-4 text-muted" /> Export
      </h2>

      {exported ? (
        latest ? (
          <div className="mt-2">
            <p>
              <span className="font-medium">Version {latest.version}</span>
              <span className="text-muted">
                {" "}
                · {latest.created_by} · {relativeTime(latest.created_at)}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {latest.row_count} rows · SHA-256{" "}
              <span className="num" title={latest.sha256}>
                {latest.sha256.slice(0, 12)}…
              </span>
            </p>
            <a
              href={fileUrl(latest)}
              download={latest.file_name}
              className={buttonClass("primary", "mt-3 w-full")}
            >
              <Download aria-hidden className="size-4" /> Download {latest.file_name}
            </a>
          </div>
        ) : (
          <div className="skeleton mt-3 h-20 w-full" />
        )
      ) : (
        <div className="mt-2">
          <p className="text-muted">
            One CSV in the filing software&apos;s import layout: a header row and one row per
            invoice line.
          </p>
          <Button
            variant="primary"
            className="mt-3 w-full"
            disabled={Boolean(blocked)}
            loading={run.isPending}
            onClick={() => run.mutate()}
            aria-describedby={blocked ? `${uid}-why` : undefined}
          >
            <Download aria-hidden className="size-4" />
            {versions.length ? `Export version ${versions[0].version + 1}` : "Export CSV"}
          </Button>
          {blocked && (
            <p id={`${uid}-why`} className="mt-2 text-xs text-muted">
              {blocked}
            </p>
          )}
          {run.isError && (
            <div role="alert" className="mt-2 text-sm text-conflict">
              <p>{run.error.message}</p>
              {blockers.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {blockers.slice(0, 5).map((b, i) => (
                    <li key={i}>{b.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {exported && me.data?.role === "manager" && (
        <div className="mt-4 border-t border-line pt-3">
          {reopening ? (
            <ReasonForm
              label="Why reopen it?"
              placeholder="e.g. Importer sent a revised invoice with the corrected HSN"
              submitLabel="Reopen shipment"
              pending={reopen.isPending}
              error={reopen.isError ? reopen.error.message : null}
              onSubmit={(reason) => reopen.mutate(reason)}
              onCancel={() => setReopening(false)}
            />
          ) : (
            <>
              <Button className="w-full" onClick={() => setReopening(true)}>
                <RotateCcw aria-hidden className="size-4" /> Reopen for changes
              </Button>
              <p className="mt-2 text-xs text-muted">
                Version {latest?.version ?? 1} stays in the history. Exporting again makes a new
                version.
              </p>
            </>
          )}
        </div>
      )}
      {exported && me.data?.role === "executive" && (
        <p className="mt-3 text-xs text-muted">
          It&apos;s read-only now. If something needs changing, ask a manager to reopen it.
        </p>
      )}

      {earlier.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-xs font-medium text-muted">
            {exported ? "Earlier versions" : "Previous exports"}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {earlier.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  v{e.version} · {e.created_by} · {relativeTime(e.created_at)}
                </span>
                <a
                  href={fileUrl(e)}
                  download={e.file_name}
                  className="shrink-0 text-accent hover:underline"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {history.isError && (
        <p className="mt-3 text-xs text-conflict">Couldn&apos;t load the export history.</p>
      )}
    </section>
  );
}
