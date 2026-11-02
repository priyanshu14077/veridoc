export type Role = "executive" | "manager";
export type ShipmentStatus = "draft" | "extracting" | "needs_review" | "cleared" | "exported";

export interface Me {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface Party {
  id: number;
  name: string;
}

export interface ShipmentRow {
  id: number;
  ref: string;
  status: ShipmentStatus;
  importer: Party;
  supplier: (Party & { country: string }) | null;
  assignee: Party | null;
  open_flags: number;
  updated_at: string;
}

export interface ShipmentList {
  items: ShipmentRow[];
  total: number;
  page: number;
  page_size: number;
  status_counts: Partial<Record<ShipmentStatus, number>>;
}

export interface Contact {
  name: string | null;
  phone: string | null;
  email: string | null;
  masked: boolean;
}

export type DocType = "invoice" | "packing_list" | "bill_of_lading";
export type ExtractionStatus = "pending" | "running" | "done" | "failed" | "manual";

export interface DocumentSummary {
  id: number;
  doc_type: DocType;
  file_name: string;
  mime: string;
  size_bytes: number;
  page_count: number | null;
  extraction_status: ExtractionStatus;
  detected_type: DocType | null;
  error: string | null;
  created_at: string;
  flag_count: number;
}

export type FlagKind =
  | "low_confidence"
  | "missing_required"
  | "check_failed"
  | "check_not_checkable"
  | "extraction_failed"
  | "extraction_pending";

export interface Flag {
  kind: FlagKind;
  document_id: number | null;
  field_id: number | null;
  check_id: number | null;
  message: string;
}

export interface ShipmentDetail extends ShipmentRow {
  importer_iec: string;
  contact: Contact;
  can_reveal_contact: boolean;
  documents: DocumentSummary[];
  flags: Flag[];
}

export interface FieldValue {
  id: number;
  key: string;
  label: string;
  section: "parties" | "document" | "shipping" | "totals" | "lines";
  kind: string;
  required: boolean;
  line_index: number | null;
  value: string | null;
  normalized: unknown;
  ai_value: string | null;
  confidence: number;
  validator_errors: string[];
  status: "ai" | "confirmed" | "edited" | "manual";
  page: number | null;
  bbox: number[] | null;
  version: number;
  flag: FlagKind | null;
}

export interface DocumentDetail extends DocumentSummary {
  fields: FieldValue[];
  shipment_id: number;
  read_only_reason: string | null;
}

/** Response of every field write: what changed plus the numbers shown around it. */
export interface ReviewResult {
  fields: FieldValue[];
  document_flag_count: number;
  shipment_status: ShipmentStatus;
  shipment_open_flags: number;
}

export interface HistoryEntry {
  at: string;
  actor: string | null;
  action: string;
  before: { value: string | null; status: string } | null;
  after: { value: string | null; status: string } | null;
}

export interface Importer {
  id: number;
  name: string;
  iec_code: string;
}

export interface Supplier {
  id: number;
  name: string;
  country: string;
}

export interface TeamMember {
  id: number;
  name: string;
  role: Role;
}
