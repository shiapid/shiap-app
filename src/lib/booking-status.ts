export type BookingState = {
  order_status: string; payment_status: string; payment_enabled: boolean;
  inventory_hold_expires_at: string | null;
};

export function bookingStatus(order: BookingState, rejectedProof = false) {
  if (["cancelled", "rejected"].includes(order.order_status)) return { key: "cancelled", label: "Dibatalkan" };
  if (order.order_status === "expired") return { key: "expired", label: "Kedaluwarsa" };
  if (["confirmed", "completed"].includes(order.order_status) && order.payment_status === "paid") return { key: "confirmed", label: "Terkonfirmasi" };
  if (order.payment_status === "paid") return { key: "confirmed", label: "Lunas · menunggu konfirmasi" };
  if (order.payment_status === "pending") return { key: "verification", label: "Menunggu Verifikasi" };
  if (order.payment_status === "refunded") return { key: "action", label: "Dana Dikembalikan" };
  if (!order.payment_enabled) return { key: "action", label: "Menunggu Persetujuan" };
  if (rejectedProof || order.payment_status === "failed") return { key: "action", label: "Perlu Tindakan" };
  return { key: "payment", label: "Menunggu Pembayaran" };
}

export function canSubmitProof(order: BookingState, now: number) {
  return order.payment_enabled && ["pending_confirmation", "confirmed"].includes(order.order_status)
    && !["paid", "pending", "refunded"].includes(order.payment_status)
    && (order.order_status === "confirmed" || !order.inventory_hold_expires_at || new Date(order.inventory_hold_expires_at).getTime() > now);
}
