"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import type { Check } from "@/lib/types";

const MIN = 10;

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
  const [reason, setReason] = useState("");
  const accept = useMutation({
    mutationFn: () =>
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
  const length = reason.trim().length;
  const id = `accept-${checkId}`;

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (length >= MIN) accept.mutate();
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        Why is this difference acceptable?
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
        placeholder="e.g. Supplier confirmed by email that the invoice weight excludes pallets"
        className="input mt-1 h-auto w-full py-2"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {length < MIN
          ? `At least ${MIN} characters (${length}/${MIN}). Your name and reason go in the audit log.`
          : "Your name and reason go in the audit log. A manager can review it."}
      </p>
      {accept.isError && (
        <p role="alert" className="mt-1 text-sm text-conflict">
          {accept.error.message}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button type="submit" variant="primary" disabled={length < MIN} loading={accept.isPending}>
          Accept mismatch
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
