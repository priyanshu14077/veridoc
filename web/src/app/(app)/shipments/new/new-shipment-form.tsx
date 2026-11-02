"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/components/app-shell";
import { Button, ErrorState } from "@/components/ui";
import { api } from "@/lib/api";
import type { Importer, ShipmentDetail, Supplier, TeamMember } from "@/lib/types";

export function NewShipmentForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const importers = useQuery({ queryKey: ["importers"], queryFn: () => api<Importer[]>("/importers") });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<TeamMember[]>("/users") });
  const [importerId, setImporterId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<ShipmentDetail>("/shipments", {
        method: "POST",
        body: JSON.stringify({
          importer_id: Number(importerId),
          supplier_id: supplierId ? Number(supplierId) : null,
          assignee_id: assigneeId ? Number(assigneeId) : null,
        }),
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.setQueryData(["shipment", String(s.id)], s);
      router.push(`/shipments/${s.id}`);
    },
  });

  const loading = importers.isPending || suppliers.isPending;
  const failed = importers.error ?? suppliers.error;
  const isManager = me.data?.role === "manager";

  return (
    <div className="max-w-xl">
      <Link href="/shipments" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Shipments
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">New shipment</h1>
      <p className="mt-1 text-muted">
        Create the record first. You&apos;ll add the invoice, packing list and bill of lading next.
      </p>

      {failed ? (
        <ErrorState
          message={failed.message}
          onRetry={() => {
            importers.refetch();
            suppliers.refetch();
          }}
        />
      ) : (
        <form
          className="mt-6 space-y-5 rounded-md border border-line bg-surface p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Select
            id="importer"
            label="Importer"
            required
            value={importerId}
            onChange={setImporterId}
            disabled={loading}
            placeholder={loading ? "Loading…" : "Choose the importer"}
            options={(importers.data ?? []).map((i) => ({
              value: String(i.id),
              label: `${i.name} · IEC ${i.iec_code}`,
            }))}
          />
          <Select
            id="supplier"
            label="Supplier"
            hint="Optional. Helps read the supplier's number and date format."
            value={supplierId}
            onChange={setSupplierId}
            disabled={loading}
            placeholder="Not known yet"
            options={(suppliers.data ?? []).map((s) => ({
              value: String(s.id),
              label: `${s.name} · ${s.country}`,
            }))}
          />
          {isManager && (
            <Select
              id="assignee"
              label="Assign to"
              value={assigneeId}
              onChange={setAssigneeId}
              placeholder="Leave unassigned"
              options={(team.data ?? [])
                .filter((t) => t.role === "executive")
                .map((t) => ({ value: String(t.id), label: t.name }))}
            />
          )}
          {!isManager && me.data && (
            <p className="text-sm text-muted">It will be assigned to you.</p>
          )}
          {create.isError && (
            <p role="alert" className="rounded-md bg-conflict-soft px-3 py-2 text-sm text-conflict">
              {create.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Link href="/shipments" className="inline-flex h-9 items-center rounded-md px-3.5 text-sm text-ink-2 hover:bg-info-soft">
              Cancel
            </Link>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!importerId}>
              Create shipment
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Select({
  id,
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
      </label>
      <select
        id={id}
        className="input"
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
