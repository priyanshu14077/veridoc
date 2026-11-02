import { Suspense } from "react";
import { DocumentView } from "./document-view";

export default function DocumentPage() {
  return (
    <Suspense>
      <DocumentView />
    </Suspense>
  );
}
