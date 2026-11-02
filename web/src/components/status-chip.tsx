import { CheckCircle2, CircleDashed, FileUp, Loader2, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { ShipmentStatus } from "@/lib/types";

export const STATUS_META: Record<
  ShipmentStatus,
  { label: string; className: string; Icon: typeof CheckCircle2; spin?: boolean }
> = {
  draft: { label: "Draft", className: "bg-info-soft text-info", Icon: CircleDashed },
  extracting: {
    label: "Extracting",
    className: "bg-accent-soft text-accent",
    Icon: Loader2,
    spin: true,
  },
  needs_review: {
    label: "Needs review",
    className: "bg-unsure-soft text-unsure",
    Icon: TriangleAlert,
  },
  cleared: { label: "Cleared", className: "bg-clear-soft text-clear", Icon: CheckCircle2 },
  exported: { label: "Exported", className: "bg-info-soft text-ink-2", Icon: FileUp },
};

export const STATUS_ORDER: ShipmentStatus[] = [
  "needs_review",
  "extracting",
  "cleared",
  "draft",
  "exported",
];

export function StatusChip({ status }: { status: ShipmentStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        m.className,
      )}
    >
      <m.Icon aria-hidden className={clsx("size-3.5", m.spin && "animate-spin")} />
      {m.label}
    </span>
  );
}
