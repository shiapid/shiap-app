import assert from "node:assert/strict";
import test from "node:test";
import { bookingStatus, canSubmitProof } from "../src/lib/booking-status.ts";

const order = { order_status: "pending_confirmation", payment_status: "unpaid", payment_enabled: true, inventory_hold_expires_at: "2030-01-01T01:00:00Z" };

test("proof submission keeps a reservation in verification without presenting it as paid", () => {
  const pending = { ...order, payment_status: "pending" };
  assert.equal(bookingStatus(pending).key, "verification");
  assert.equal(canSubmitProof(pending, Date.parse("2030-01-01T00:00:00Z")), false);
});

test("expired and cancelled bookings cannot resume payment", () => {
  assert.equal(canSubmitProof(order, Date.parse("2030-01-01T01:00:00Z")), false);
  for (const state of ["expired", "cancelled", "rejected"]) {
    assert.equal(canSubmitProof({ ...order, order_status: state }, 0), false);
  }
});

test("request approval and rejected proof use compatible backend states", () => {
  assert.equal(bookingStatus({ ...order, payment_enabled: false }).label, "Menunggu Persetujuan");
  assert.equal(canSubmitProof({ ...order, payment_enabled: false }, 0), false);
  assert.equal(bookingStatus(order, true).key, "action");
  assert.equal(bookingStatus({ ...order, order_status: "confirmed", payment_status: "paid" }).key, "confirmed");
});
