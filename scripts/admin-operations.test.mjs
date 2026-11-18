import test from "node:test";
import assert from "node:assert/strict";
import { canArchiveBooking, canRemoveBookingFromList, canRestoreBooking } from "../src/lib/admin/booking-eligibility.ts";

test("archive allows finalized paid history but blocks active and pending verification", () => {
  assert.equal(canArchiveBooking({ order_status: "completed", payment_status: "paid", hasPendingProof: false }), true);
  assert.equal(canArchiveBooking({ order_status: "confirmed", payment_status: "paid", hasPendingProof: false }), false);
  assert.equal(canArchiveBooking({ order_status: "cancelled", payment_status: "pending", hasPendingProof: true }), false);
});

test("trash eligibility rejects active, paid, pending-payment and proof-review bookings", () => {
  for (const state of ["pending_confirmation", "confirmed", "completed"]) {
    assert.equal(canRemoveBookingFromList({ order_status: state, payment_status: "unpaid", hasPendingProof: false }), false);
  }
  assert.equal(canRemoveBookingFromList({ order_status: "expired", payment_status: "paid", hasPendingProof: false }), false);
  assert.equal(canRemoveBookingFromList({ order_status: "cancelled", payment_status: "pending", hasPendingProof: false }), false);
  assert.equal(canRemoveBookingFromList({ order_status: "rejected", payment_status: "unpaid", hasPendingProof: true }), false);
  assert.equal(canRemoveBookingFromList({ order_status: "expired", payment_status: "unpaid", hasPendingProof: false }), true);
});

test("restore is exposed only for rows with deletion metadata", () => {
  assert.equal(canRestoreBooking("2026-11-18T10:00:00Z"), true);
  assert.equal(canRestoreBooking(null), false);
});
