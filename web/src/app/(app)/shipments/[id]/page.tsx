import { Suspense } from "react";
import { ShipmentDetailView } from "./shipment-detail";

export default function ShipmentPage() {
  return (
    <Suspense>
      <ShipmentDetailView />
    </Suspense>
  );
}
