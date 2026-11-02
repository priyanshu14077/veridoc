"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileText, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { StatusChip } from "@/components/status-chip";
import { Button, EmptyState, ErrorState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Contact, ShipmentDetail } from "@/lib/types";

export function ShipmentDetailView() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["shipment", id],
    queryFn: () => api<ShipmentDetail>(`/shipments/${encodeURIComponent(id)}`),
  });

  useEffect(() => {
    if (q.data) document.title = `${q.data.ref} · Crosscheck`;
  }, [q.data]);

  return (
    <div>
      <Link href="/shipments" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
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
            {q.data.supplier ? `${q.data.supplier.name}, ${q.data.supplier.country}` : "Supplier not set"}{" "}
            → {q.data.importer.name}
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="rounded-md border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 font-medium">Documents</h2>
              <EmptyState
                title="No documents yet"
                body="The invoice, packing list and bill of lading for this shipment will appear here."
              />
            </section>

            <aside className="space-y-6">
              <dl className="rounded-md border border-line bg-surface p-4 text-sm">
                <Row label="Assignee" value={q.data.assignee?.name ?? "Unassigned"} />
                <Row label="Importer IEC" value={<span className="num">{q.data.importer_iec}</span>} />
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
          <Button className="mt-3 w-full" onClick={() => reveal.mutate()} loading={reveal.isPending}>
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
