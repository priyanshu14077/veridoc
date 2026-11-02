"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  FileText,
  Keyboard,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { api, ApiError, uploadFile } from "@/lib/api";
import { DOC_LABEL, fileSize } from "@/lib/format";
import type { DocType, DocumentSummary, ShipmentDetail } from "@/lib/types";

const SLOTS: DocType[] = ["invoice", "packing_list", "bill_of_lading"];
const MAX_MB = 15;
const ACCEPT = "application/pdf,image/png,image/jpeg";

export function DocumentsPanel({ shipment }: { shipment: ShipmentDetail }) {
  const byType = new Map(shipment.documents.map((d) => [d.doc_type, d]));
  const locked = shipment.status === "exported";
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-medium">Documents</h2>
        <span className="text-xs text-muted">PDF, PNG or JPG · up to {MAX_MB} MB · 10 pages</span>
      </div>
      <ul className="divide-y divide-line">
        {SLOTS.map((t) => (
          <Slot key={t} shipmentId={shipment.id} docType={t} doc={byType.get(t)} locked={locked} />
        ))}
      </ul>
    </section>
  );
}

function Slot({
  shipmentId,
  docType,
  doc,
  locked,
}: {
  shipmentId: number;
  docType: DocType;
  doc: DocumentSummary | undefined;
  locked: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shipment", String(shipmentId)] });
    qc.invalidateQueries({ queryKey: ["shipments"] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("doc_type", docType);
      form.set("file", file);
      setProgress(0);
      return uploadFile<DocumentSummary>(`/shipments/${shipmentId}/documents`, form, setProgress);
    },
    onSettled: () => setProgress(null),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: () => api(`/documents/${doc!.id}/retry`, { method: "POST" }),
    onSuccess: refresh,
  });
  const manual = useMutation({
    mutationFn: () => api(`/documents/${doc!.id}/manual`, { method: "POST" }),
    onSuccess: refresh,
  });

  function pick(files: FileList | null) {
    setLocalError(null);
    const f = files?.[0];
    if (!f) return;
    // Fast feedback here; the server checks the bytes again and is the authority.
    if (!ACCEPT.split(",").includes(f.type)) {
      setLocalError("Upload a PDF, PNG or JPG.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setLocalError(`That file is ${fileSize(f.size)}. Files can be up to ${MAX_MB} MB.`);
      return;
    }
    upload.mutate(f);
  }

  const error =
    localError ??
    (upload.error instanceof ApiError ? upload.error.message : null) ??
    (retry.error as Error | null)?.message ??
    (manual.error as Error | null)?.message ??
    null;
  const busy = progress !== null;

  return (
    <li
      className={clsx("px-4 py-4 transition-colors", dragging && "bg-accent-soft")}
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!locked) pick(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={`Upload ${DOC_LABEL[docType]}`}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StateIcon doc={doc} busy={busy} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{DOC_LABEL[docType]}</div>
          <Subline doc={doc} progress={progress} />
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 pl-9 sm:w-auto sm:pl-0">
          {doc && (doc.extraction_status === "done" || doc.extraction_status === "manual") && (
            <Link
              href={`/shipments/${shipmentId}/documents/${doc.id}`}
              className="inline-flex h-9 items-center rounded-md border border-line-strong px-3 text-sm font-medium hover:bg-paper"
            >
              {doc.flag_count > 0 ? "Review" : "View fields"}
            </Link>
          )}
          {doc?.extraction_status === "failed" && (
            <Button onClick={() => retry.mutate()} loading={retry.isPending}>
              <RefreshCw aria-hidden className="size-4" /> Retry
            </Button>
          )}
          {(doc?.extraction_status === "failed" ||
            (doc?.extraction_status === "pending" && doc.error)) && (
            <Button variant="ghost" onClick={() => manual.mutate()} loading={manual.isPending}>
              <Keyboard aria-hidden className="size-4" /> Enter by hand
            </Button>
          )}
          {!locked && (
            <Button
              variant={doc ? "ghost" : "primary"}
              onClick={() => input.current?.click()}
              disabled={busy || doc?.extraction_status === "running"}
            >
              <Upload aria-hidden className="size-4" />
              {doc ? "Replace" : "Upload"}
            </Button>
          )}
        </div>
      </div>
      {!doc && !busy && !locked && (
        <p className="mt-2 pl-9 text-xs text-muted">Or drop the file onto this row.</p>
      )}
      {doc?.detected_type && doc.detected_type !== docType && (
        <p className="mt-2 flex items-center gap-1.5 pl-9 text-sm text-unsure">
          <TriangleAlert aria-hidden className="size-4" />
          This looks like a {DOC_LABEL[doc.detected_type].toLowerCase()}. Check you uploaded the
          right file.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 pl-9 text-sm text-conflict">
          {error}
        </p>
      )}
    </li>
  );
}

function StateIcon({ doc, busy }: { doc: DocumentSummary | undefined; busy: boolean }) {
  const base = "size-5 shrink-0";
  if (doc?.extraction_status === "pending" && doc.error)
    return <Clock aria-hidden className={clsx(base, "text-unsure")} />;
  if (busy || doc?.extraction_status === "pending" || doc?.extraction_status === "running")
    return <Loader2 aria-hidden className={clsx(base, "animate-spin text-accent")} />;
  if (!doc) return <FileText aria-hidden className={clsx(base, "text-muted")} />;
  if (doc.extraction_status === "failed")
    return <AlertOctagon aria-hidden className={clsx(base, "text-conflict")} />;
  if (doc.flag_count > 0)
    return <TriangleAlert aria-hidden className={clsx(base, "text-unsure")} />;
  return <CheckCircle2 aria-hidden className={clsx(base, "text-clear")} />;
}

function Subline({ doc, progress }: { doc: DocumentSummary | undefined; progress: number | null }) {
  if (progress !== null)
    return (
      <div className="mt-1.5 flex items-center gap-3">
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-info-soft">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="num text-xs text-muted">{Math.round(progress * 100)}%</span>
      </div>
    );
  if (!doc) return <div className="text-sm text-muted">Not uploaded</div>;
  const meta = (
    <span className="text-muted">
      {doc.file_name} · {fileSize(doc.size_bytes)}
      {doc.page_count ? ` · ${doc.page_count} page${doc.page_count > 1 ? "s" : ""}` : ""}
    </span>
  );
  switch (doc.extraction_status) {
    case "pending":
      // A pending document with an error is waiting out the AI provider's daily quota.
      return doc.error ? (
        <div className="text-sm text-unsure">{doc.error}</div>
      ) : (
        <div className="text-sm">Queued for reading… {meta}</div>
      );
    case "running":
      return <div className="text-sm text-accent">Reading the document…</div>;
    case "failed":
      return <div className="text-sm text-conflict">{doc.error}</div>;
    case "manual":
      return (
        <div className="text-sm">
          <span className="text-unsure">Enter by hand</span>{" "}
          <span className="text-muted">· the AI couldn&apos;t read it reliably</span>
        </div>
      );
    default:
      return (
        <div className="text-sm">
          {doc.flag_count > 0 ? (
            <span className="text-unsure">
              {doc.flag_count} field{doc.flag_count > 1 ? "s" : ""} to check
            </span>
          ) : (
            <span className="text-clear">All fields confident</span>
          )}{" "}
          · {meta}
        </div>
      );
  }
}
