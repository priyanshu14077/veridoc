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

export interface ShipmentDetail extends ShipmentRow {
  importer_iec: string;
  contact: Contact;
  can_reveal_contact: boolean;
}

export interface TeamMember {
  id: number;
  name: string;
  role: Role;
}
