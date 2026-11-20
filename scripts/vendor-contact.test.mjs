import assert from "node:assert/strict";
import test from "node:test";
import { parseVendorContact, vendorWhatsAppLink } from "../src/lib/admin/vendor-contact.ts";

test("vendor form normalizes Indonesian WhatsApp and validates required fields", () => {
  const form = new FormData();
  form.set("name", "  PIC Rental  ");
  form.set("whatsapp", "0812-3456-7890");
  assert.deepEqual(parseVendorContact(form), { name: "PIC Rental", whatsapp: "6281234567890", notes: "" });
  form.set("notes", "x".repeat(1001));
  assert.equal(parseVendorContact(form), null);
  form.set("notes", "");
  form.set("whatsapp", "abc");
  assert.equal(parseVendorContact(form), null);
});

test("vendor handoff encodes only requested booking details", () => {
  const link = new URL(vendorWhatsAppLink("6281234567890", "QA-001", "Kayak & Kano", "20 November 2026", 3, 2));
  assert.equal(link.origin, "https://wa.me");
  assert.equal(link.pathname, "/6281234567890");
  const message = link.searchParams.get("text");
  for (const value of ["QA-001", "Kayak & Kano", "20 November 2026", "3 peserta / 2 unit"]) assert.ok(message.includes(value));
  assert.equal(vendorWhatsAppLink("abc", "", "", "", 0, 0), null);
});
