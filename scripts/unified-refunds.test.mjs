import assert from "node:assert/strict";
import test from "node:test";
import { refundableRupiah } from "../src/lib/unified-refunds.ts";
import { renderEmail } from "../src/lib/notifications/messages.ts";

test("refund inputs require positive whole Rupiah within the database contract", () => {
  assert.equal(refundableRupiah(" 45000 "), 45000);
  assert.equal(refundableRupiah("999999999999"), 999999999999);
  for (const value of [null, "0", "-50", "20.01", "1e3", "1.000", "1000000000000"]) {
    assert.equal(refundableRupiah(value), null);
  }
});

test("partner refund notifications omit guest identity and parent payment", () => {
  const context = {
    booking: { id: "qa", order_number: "QA-1", customer_name: "PRIVATE GUEST NAME",
      payment_enabled: false, total_amount: 987654321, booking_items: [{ service_name: "QA Stay", date_start: "2026-12-01" }] },
    bank: "PRIVATE BANK DETAILS",
  };
  const approved = renderEmail("item_refund_approved", context, "partner");
  assert.match(approved.text, /Transfer masih menunggu/);
  assert.match(approved.text, /partner\/stay\/operations/);
  assert.doesNotMatch(approved.text, /PRIVATE|987\.654\.321|Total Pembayaran/);
  assert.match(renderEmail("item_refund_paid", context, "customer").text, /mencatat transfer refund/);
});
