export type ItemRefundState = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PENDING_PAYMENT" | "PAID" | "FAILED";

export const itemRefundLabels: Record<ItemRefundState, string> = {
  REQUESTED: "Diminta",
  UNDER_REVIEW: "Sedang ditinjau",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  PENDING_PAYMENT: "Menunggu transfer",
  PAID: "Refund dibayar",
  FAILED: "Transfer gagal",
};

export type ItemRefundSummary = {
  eligible: number;
  paid: number;
  requests: { id: string; status: ItemRefundState; requested: number; approved: number | null; paid: number }[];
};

export type RefundRequest = {
  id: string;
  item_id: string;
  booking_id: string;
  status: ItemRefundState;
  reason: string;
  requested_idr: number;
  approved_idr: number | null;
  paid_idr: number;
  reconcile_required: boolean;
  bank_id: string | null;
  paid_at: string | null;
  evidence_path: string | null;
  history: { action: string; actor_id: string; old_status: string | null; new_status: string | null; reason: string; occurred_at: string }[];
};

export type RefundAllocation = {
  item_id: string;
  booking_id: string;
  service: string;
  vendor_kind: string;
  vendor_id: string;
  service_name: string;
  order_number: string;
  payment_status: string;
  order_status: string;
  cancelled_at: string | null;
  gross: number;
  discount: number;
  tax: number;
  service_fee: number;
  commission_bps: number;
  original_amount: number;
  receipt_total: number;
  customer_payment: number;
  requested: number;
  liability: number;
  executed: number;
  issues: number;
  remaining_value: number;
  remaining_eligible: number;
  remaining_commission: number | null;
  remaining_vendor_share: number | null;
};

export type RefundReport = { items: RefundAllocation[]; requests: RefundRequest[] };

export function refundableRupiah(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return /^[1-9][0-9]{0,11}$/.test(text) ? Number(text) : null;
}
