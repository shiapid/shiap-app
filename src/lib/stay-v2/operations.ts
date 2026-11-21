import type { ItemRefundSummary } from "../unified-refunds";

export type StayPartnerOperations = {
  properties: { property_id: string; places_id: string; agreement_id: string; name: string; status: string; booking_mode: string; bank_verified: boolean; instant_approved: boolean }[];
  bookings: { item_id: string; property_id: string; room_type_id: string; order_number: string; status: string; payment_status: string; guest_name: string | null; guest_whatsapp: string | null; service_name: string; guests: number; quantity: number; check_in_at: string; check_out_at: string; operational_hold: boolean; refund?: ItemRefundSummary | null }[];
  rooms: { id: string; property_id: string; name: string; capacity: number; total_units: number; weekday_price: number; weekend_price: number; extra_guest_price: number; partner_included_guests: number | null }[];
  units: { id: string; room_type_id: string; label: string }[];
  blocks: { id: string; room_type_id: string; starts_on: string; ends_on: string; blocked_units: number | null; reason: string }[];
  rates: { id: string; room_type_id: string; starts_on: string; ends_on: string; price: number }[];
  addons: { id: string; property_id: string; name: string; price_idr: number; enabled: boolean }[];
};
export type StayPartnerCalendarNight = { night: string; total: number; booked: number; blocked: number; available: number; calendar_closed: boolean };

export function stayPartnerItemActions(item: StayPartnerOperations["bookings"][number], admin: boolean) {
  if (["CANCELLED","REJECTED","EXPIRED","COMPLETED"].includes(item.status.toUpperCase())) return [];
  const actions: { id: string; label: string }[] = [];
  if (!item.operational_hold) {
    if (item.status === "REQUESTED") actions.push({ id: "APPROVE", label: "Setujui permintaan" });
    if (item.status === "AWAITING_PAYMENT" && item.payment_status === "paid") actions.push({ id: "CONFIRM", label: "Konfirmasi reservasi" });
    if (item.status === "CONFIRMED") actions.push({ id: "CHECK_IN", label: "Catat check-in" });
    if (item.status === "CHECKED_IN") actions.push({ id: "CHECK_OUT", label: "Catat check-out" });
    if (item.status === "CHECKED_OUT") actions.push({ id: "COMPLETE", label: "Selesaikan pemenuhan" });
  }
  if (item.status === "REQUESTED") actions.push({ id: "REJECT", label: "Tolak permintaan" });
  if (admin) actions.push(item.operational_hold ? { id: "RELEASE_HOLD", label: "Lepas hold" } : { id: "HOLD", label: "Pasang hold" });
  return actions;
}
