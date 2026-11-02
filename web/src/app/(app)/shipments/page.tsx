import type { Metadata } from "next";
import { Suspense } from "react";
import { ShipmentListView } from "./shipment-list";

export const metadata: Metadata = { title: "Shipments" };

export default function ShipmentsPage() {
  return (
    <Suspense>
      <ShipmentListView />
    </Suspense>
  );
}
