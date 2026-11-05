import type { Metadata } from "next";
import { Suspense } from "react";
import { OverridesView } from "./overrides-view";

export const metadata: Metadata = { title: "Overrides" };

export default function OverridesPage() {
  return (
    <Suspense>
      <OverridesView />
    </Suspense>
  );
}
