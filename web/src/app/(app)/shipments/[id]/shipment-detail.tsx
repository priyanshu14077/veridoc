"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Eye, FileText, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { ChecksPanel } from "@/components/checks-panel";
import { DocumentsPanel } from "@/components/documents-panel";
import { ExportCard } from "@/components/export-card";
import { ExportPreview } from "@/components/export-preview";
import { StatusChip } from "@/components/status-chip";
import { Button, EmptyState, ErrorState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Contact, ShipmentDetail } from "@/lib/types";

export function ShipmentDetailView() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["shipment", id],
    queryFn: () => api<ShipmentDetail>(`/shipments/${encodeURIComponent(id)}`),
    // Poll only while something is being read; stop as soon as extraction settles.
    refetchInterval: (query) => {
      const waiting = (query.state.data?.documents ?? []).filter((d) =>
        ["pending", "running"].includes(d.extraction_status),
      );
      if (!waiting.length) return false;
      // Documents waiting out a daily quota won't change for a while; poll gently.
      return waiting.every((d) => d.error) ? 30_000 : 2000;
    },
  });

  useEffect(() => {
    if (q.data) document.title = `${q.data.ref} · Veridoc`;
  }, [q.data]);

  return (
    <div>
      <Link
        href="/shipments"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" /> Shipments
      </Link>

      {q.isPending ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72" />
          <div className="skeleton mt-6 h-40 w-full" />
        </div>
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState
            title="Shipment not found"
            body="It doesn't exist, or it's assigned to someone else."
            action={
              <Link href="/shipments" className="text-accent hover:underline">
                Back to shipments
              </Link>
            }
          />
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="num text-2xl font-medium tracking-tight">{q.data.ref}</h1>
            <StatusChip status={q.data.status} />
          </div>
          <p className="mt-1 text-muted">
            {q.data.supplier
              ? `${q.data.supplier.name}, ${q.data.supplier.country}`
              : "Supplier not set"}{" "}
            → {q.data.importer.name}
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-6">
              <FlagSummary shipment={q.data} />
              {/* On a phone the export comes straight after the summary, not below everything. */}
              <ExportCard shipment={q.data} className="lg:hidden" />
              <ChecksPanel shipment={q.data} />
              <DocumentsPanel shipment={q.data} />
              <ExportPreview shipment={q.data} />
            </div>

            <aside className="min-w-0 space-y-6">
              <ExportCard shipment={q.data} className="hidden lg:block" />
              <dl className="rounded-md border border-line bg-surface p-4 text-sm">
                <Row label="Assignee" value={q.data.assignee?.name ?? "Unassigned"} />
                <Row
                  label="Importer IEC"
                  value={<span className="num">{q.data.importer_iec}</span>}
                />
              </dl>
              <ContactCard
                shipmentId={q.data.id}
                initial={q.data.contact}
                canReveal={q.data.can_reveal_contact}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function ContactCard({
  shipmentId,
  initial,
  canReveal,
}: {
  shipmentId: number;
  initial: Contact;
  canReveal: boolean;
}) {
  const reveal = useMutation({
    mutationFn: () => api<Contact>(`/shipments/${shipmentId}/contact/reveal`, { method: "POST" }),
  });
  const c = reveal.data ?? initial;

  return (
    <section className="rounded-md border border-line bg-surface p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Importer contact</h2>
        {c.masked && <Lock aria-label="Masked" className="size-3.5 text-muted" />}
      </div>
      <dl className="mt-2">
        <Row label="Name" value={c.name ?? "Not shared yet"} />
        <Row label="Phone" value={<span className="num">{c.phone ?? "Not shared yet"}</span>} />
        <Row label="Email" value={c.email ?? "Not shared yet"} />
      </dl>
      {c.masked &&
        (canReveal ? (
          <Button
            className="mt-3 w-full"
            onClick={() => reveal.mutate()}
            loading={reveal.isPending}
          >
            <Eye aria-hidden className="size-4" /> Show contact
          </Button>
        ) : (
          <p className="mt-3 text-xs text-muted">
            Only the assigned executive or a manager can see contact details.
          </p>
        ))}
      {c.masked && canReveal && (
        <p className="mt-2 text-xs text-muted">Personal data. Viewing it is recorded.</p>
      )}
      {reveal.isError && <p className="mt-2 text-xs text-conflict">{reveal.error.message}</p>}
      {!c.masked && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <FileText aria-hidden className="size-3.5" /> This view was added to the audit log.
        </p>
      )}
    </section>
  );
}

function FlagSummary({ shipment }: { shipment: ShipmentDetail }) {
  const reviewable = shipment.flags.filter((f) => f.kind !== "extraction_pending");
  if (shipment.documents.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
        Start by uploading the invoice, packing list and bill of lading below. Each one is read
        automatically, and anything uncertain is flagged for you.
      </p>
    );
  }
  if (shipment.status === "extracting") {
    return (
      <p className="rounded-md bg-accent-soft px-4 py-3 text-sm text-accent">
        Reading documents. This usually takes 10 to 20 seconds per document. You can leave this
        page; it keeps going.
      </p>
    );
  }
  if (shipment.status === "exported") {
    return (
      <p className="flex items-center gap-2 rounded-md bg-info-soft px-4 py-3 text-sm text-ink-2">
        <Lock aria-hidden className="size-4 shrink-0" />
        Exported. Everything here is read-only until a manager reopens it.
      </p>
    );
  }
  if (reviewable.length === 0) {
    const accepted = shipment.checks.filter((c) => c.accepted).length;
    return (
      <p className="flex items-center gap-2 rounded-md bg-clear-soft px-4 py-3 text-sm text-clear">
        <CheckCircle2 aria-hidden className="size-4 shrink-0" />
        {accepted
          ? `Ready to export. ${accepted} mismatch${accepted > 1 ? "es were" : " was"} accepted with a reason.`
          : "Ready to export. Every field was read with confidence and every cross-check passes."}
      </p>
    );
  }
  const byDoc = new Map<number | null, number>();
  for (const f of reviewable) byDoc.set(f.document_id, (byDoc.get(f.document_id) ?? 0) + 1);
  return (
    <div className="rounded-md bg-unsure-soft px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-unsure">
        <TriangleAlert aria-hidden className="size-4" />
        {reviewable.length} thing{reviewable.length > 1 ? "s" : ""} need
        {reviewable.length > 1 ? "" : "s"} you before export
      </p>
      <ul className="mt-2 space-y-1 text-ink-2">
        {reviewable.slice(0, 5).map((f, i) => (
          <li key={i}>
            ·{" "}
            {f.check_id ? (
              <a
                href={`#check-${f.check_id}`}
                className="underline decoration-line-strong underline-offset-2 hover:decoration-ink"
              >
                {f.message}
              </a>
            ) : f.document_id && f.field_id ? (
              <Link
                href={`/shipments/${shipment.id}/documents/${f.document_id}?field=${f.field_id}`}
                className="underline decoration-line-strong underline-offset-2 hover:decoration-ink"
              >
                {f.message}
              </Link>
            ) : (
              f.message
            )}
          </li>
        ))}
        {reviewable.length > 5 && <li className="text-muted">and {reviewable.length - 5} more</li>}
      </ul>
    </div>
  );
}
