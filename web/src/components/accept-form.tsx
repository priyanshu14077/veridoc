"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import type { Check } from "@/lib/types";

const MIN = 10;

/** A required, audited reason (10 to 500 characters), used to accept a mismatch or reopen. */
export function ReasonForm({
  label,
  placeholder,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const id = useId();
  const length = reason.trim().length;

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (length >= MIN) onSubmit(reason.trim());
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        autoFocus
        rows={2}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="input mt-1 h-auto w-full py-2"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {length < MIN
          ? `At least ${MIN} characters (${length}/${MIN}). Your name and reason go in the audit log.`
          : "Your name and reason go in the audit log."}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-conflict">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button type="submit" variant="primary" disabled={length < MIN} loading={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Accept a failed or uncheckable cross-check. The reason is required and audited. */
export function AcceptForm({
  checkId,
  shipmentId,
  onDone,
  onCancel,
}: {
  checkId: number;
  shipmentId: number | string;
  onDone?: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: (reason: string) =>
      api<Check>(`/checks/${checkId}/accept`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment", String(shipmentId)] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["document"] });
      onDone?.();
    },
  });

  return (
    <ReasonForm
      label="Why is this difference acceptable?"
      placeholder="e.g. Supplier confirmed by email that the invoice weight excludes pallets"
      submitLabel="Accept mismatch"
      pending={accept.isPending}
      error={accept.isError ? accept.error.message : null}
      onSubmit={(reason) => accept.mutate(reason)}
      onCancel={onCancel}
    />
  );
}
