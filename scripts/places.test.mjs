import test from "node:test";
import assert from "node:assert/strict";
import { buildWhatsAppUrl, normalizeIdPhone, normalizePlacesSearch } from "../src/lib/places/utils.ts";

test("normalizes Indonesian WhatsApp numbers to international digits", () => {
  assert.equal(normalizeIdPhone("0812 3456 7890"), "6281234567890");
  assert.equal(normalizeIdPhone("+62 (812) 3456-7890"), "6281234567890");
  assert.equal(normalizeIdPhone("81234567890"), "6281234567890");
  assert.equal(normalizeIdPhone("0012345"), null);
  assert.equal(normalizeIdPhone("0812abc"), null);
});

test("builds a safe WhatsApp URL and omits unavailable trip details", () => {
  const url = buildWhatsAppUrl({ phone: "0812-3456-7890", propertyName: "Villa Bahari", refCode: "SHP-2ABCD" });
  assert.ok(url);
  assert.equal(new URL(url).hostname, "wa.me");
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /Villa Bahari/);
  assert.match(message, /SHP-2ABCD/);
  assert.doesNotMatch(message, /Tanggal check-in|Jumlah tamu/);
});

test("includes only supplied optional message fields and rejects invalid references", () => {
  const url = buildWhatsAppUrl({ phone: "+6281234567890", propertyName: "Villa", refCode: "SHP-2ABCD", checkIn: "12 Juni 2027", guests: 3 });
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /Tanggal check-in: 12 Juni 2027/);
  assert.match(message, /Jumlah tamu: 3/);
  assert.equal(buildWhatsAppUrl({ phone: "081234567890", propertyName: "Villa", refCode: "SHP-00000" }), null);
});

test("sanitizes and bounds shared destination/property searches", () => {
  assert.equal(normalizePlacesSearch("  Villa,   Teluk Tamiang! "), "Villa Teluk Tamiang");
  assert.equal(normalizePlacesSearch("a".repeat(100)).length, 80);
});
