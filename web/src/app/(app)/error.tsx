"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/** Last-resort boundary for a render error inside the signed-in app. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-md border border-line bg-surface">
      <ErrorState
        message="Something on this page broke. Your saved work is safe; try again."
        onRetry={retry}
      />
    </div>
  );
}
