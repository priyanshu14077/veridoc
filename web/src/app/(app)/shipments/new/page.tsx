import type { Metadata } from "next";
import { NewShipmentForm } from "./new-shipment-form";

export const metadata: Metadata = { title: "New shipment" };

export default function NewShipmentPage() {
  return <NewShipmentForm />;
}
