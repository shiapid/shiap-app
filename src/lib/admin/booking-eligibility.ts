export type BookingManageEligibility = {
  order_status: string;
  payment_status: string;
  hasPendingProof: boolean;
};

const finalizedStatuses = new Set(["completed", "cancelled", "expired", "rejected"]);

export function canArchiveBooking(booking: BookingManageEligibility) {
  return finalizedStatuses.has(booking.order_status) && !booking.hasPendingProof;
}

export function canRemoveBookingFromList(booking: BookingManageEligibility) {
  return ["cancelled", "expired", "rejected"].includes(booking.order_status)
    && !["paid", "pending"].includes(booking.payment_status)
    && !booking.hasPendingProof;
}

export function canRestoreBooking(deletedAt: string | null | undefined) {
  return Boolean(deletedAt);
}
