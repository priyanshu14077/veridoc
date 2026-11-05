import type { Metadata } from "next";
import { Suspense } from "react";
import { AccuracyView } from "./accuracy-view";

export const metadata: Metadata = { title: "Accuracy" };

export default function AccuracyPage() {
  return (
    <Suspense>
      <AccuracyView />
    </Suspense>
  );
}
