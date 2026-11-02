import { Suspense } from "react";
import { ReviewView } from "./review-view";

export default function DocumentPage() {
  return (
    <Suspense>
      <ReviewView />
    </Suspense>
  );
}
