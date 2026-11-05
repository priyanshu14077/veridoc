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
  | "extraction_pending"
  | "missing_document";

export interface Flag {
  kind: FlagKind;
  document_id: number | null;
  field_id: number | null;
  check_id: number | null;
  message: string;
}

export type CheckStatus = "pass" | "fail" | "not_checkable";

export interface CheckShown {
  label: string;
  doc: DocType | null;
  value: string;
  field_id: number | null;
}

export interface Check {
  id: number;
  rule_id: string;
  title: string;
  status: CheckStatus;
  message: string;
  shown: CheckShown[];
  field_ids: number[];
  tolerance: string | null;
  accepted: boolean;
  accept_reason: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
}

export interface Conflict {
  check_id: number;
  rule_id: string;
  status: CheckStatus;
  message: string;
}

export interface ShipmentDetail extends ShipmentRow {
  importer_iec: string;
  contact: Contact;
  can_reveal_contact: boolean;
  documents: DocumentSummary[];
  flags: Flag[];
  checks: Check[];
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
  conflicts: Conflict[];
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

export interface ExportRecord {
  id: number;
  version: number;
  format: string;
  sha256: string;
  row_count: number;
  created_by: string;
  created_at: string;
  file_name: string;
}

export interface ExportPreview {
  status: ShipmentStatus;
  blockers: Flag[];
  columns: string[];
  rows: Record<string, string>[];
}

export type OverrideKind = "accepted" | "edited" | "reopened";

export interface OverrideRow {
  id: number;
  kind: OverrideKind;
  at: string;
  actor: string | null;
  shipment_id: number | null;
  shipment_ref: string | null;
  subject: string;
  detail: string;
  reason: string | null;
  still_applies: boolean | null;
}

export interface Overrides {
  since: string;
  items: OverrideRow[];
  counts: Record<OverrideKind, number>;
}

export type AccuracyGroup = "field" | "supplier";

export interface AccuracyMiss {
  shipment_id: number;
  shipment_ref: string;
  field: string;
  ai_value: string | null;
  final_value: string | null;
  flagged: boolean;
}

export interface AccuracyRow {
  key: string;
  label: string;
  fields: number;
  correct: number;
  corrected: number;
  flagged: number;
  /** Corrected, but never flagged: the errors only a careful reviewer catches. */
  missed: number;
  examples: AccuracyMiss[];
}

export interface Accuracy {
  group: AccuracyGroup;
  threshold: number;
  shipments: number;
  documents: number;
  manual_documents: number;
  total: AccuracyRow;
  rows: AccuracyRow[];
}
