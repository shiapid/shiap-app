import type { ItemRefundSummary } from "./unified-refunds";
import type { BookingItem } from "./booking-engine";

export const unifiedCheckoutEnabled = process.env.NEXT_PUBLIC_SHIAP_UNIFIED_CHECKOUT === "true";

export function eligibleUnifiedCart(items: BookingItem[]) {
  return items.length >= 1 && items.length <= 2 &&
    new Set(items.map((item) => item.serviceType)).size === items.length &&
    items.every((item) => (item.serviceType === "trip" && !!item.departureId && !!item.tripId) ||
      (item.serviceType === "stay" && item.partnerStay === true && !!item.roomTypeId && !!item.propertyId));
}

export function unifiedCartPayload(items: BookingItem[]) {
  return items.map((item) => ({
    service_type: item.serviceType,
    trip_id: item.tripId,
    departure_id: item.departureId,
    property_id: item.propertyId,
    room_type_id: item.roomTypeId,
    date_start: item.dateStart,
    date_end: item.dateEnd,
    quantity: item.quantity,
    guests: item.guests,
    selected_addons: item.selectedAddons?.map(({ id }) => ({ id })) ?? [],
  }));
}

export type UnifiedItemState = {
  item_id: string;
  service: "stay" | "trip" | "experience";
  subtotal: number;
  fee: number;
  approval: string;
  review_open: boolean;
  cancelled_at?: string | null;
  refund?: ItemRefundSummary | null;
  fulfillment: string;
  reservation: "held" | "reserved" | "released" | "expired";
};

export type UnifiedBookingView = { payment_available: boolean; items: UnifiedItemState[] };

export const unifiedApprovalLabels: Record<string, string> = {
  pending: "Menunggu persetujuan", approved: "Disetujui", not_required: "Tidak perlu persetujuan",
  rejected: "Ditolak", cancelled: "Dibatalkan",
};

export const unifiedReservationLabels: Record<UnifiedItemState["reservation"], string> = {
  held: "Ditahan sementara", reserved: "Reservasi terjamin", released: "Dilepas", expired: "Kedaluwarsa",
};

export const unifiedFulfillmentLabels: Record<string, string> = {
  PENDING: "Menunggu pemenuhan", REQUESTED: "Permintaan diterima", AWAITING_PAYMENT: "Menunggu operasional",
  CONFIRMED: "Terkonfirmasi", CHECKED_IN: "Sudah check-in", CHECKED_OUT: "Sudah check-out",
  COMPLETED: "Selesai", CANCELLED: "Dibatalkan", REJECTED: "Ditolak",
};
