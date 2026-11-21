import type { BookingState } from "./booking-status";

import type { FeeLine } from "./service-fees";
import type { UnifiedBookingView } from "./unified-checkout";

export type CustomerOrder = BookingState & {
  id: string; order_number: string; customer_name: string; customer_whatsapp: string;
  customer_email: string | null; customer_notes: string | null; total_amount: number; created_at: string;
  package_subtotal: number | null; service_fee_total: number; service_fee_snapshot: FeeLine[];
  booking_items: {
    id: string; service_type: string; service_category: string | null; service_name: string;
    variant: string | null; date_start: string; date_end: string | null; guests: number; quantity: number;
  }[];
};

export type ProofRecord = {
  id: string; original_file_name: string; status: string; rejection_reason: string | null;
  submitted_at: string; review_due_at: string;
};
export type BankSettings = { bank_name: string; account_number: string; account_name: string; instructions: string; is_active: boolean };
export type BookingDetail = {
  order: CustomerOrder; proofs: ProofRecord[]; settings: BankSettings | null; serverNow: string;
  supportPhone: string | null; guest: boolean; canClaim: boolean;
  unified?: UnifiedBookingView | null;
  experience: { request_status: string; review_note: string | null } | null;
};
export function bookingDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value.slice(0, 10) + "T00:00:00Z"));
}
