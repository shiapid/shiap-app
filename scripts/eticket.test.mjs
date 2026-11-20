import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { ticketQrPayload, parseTicketQrPayload } from "../src/lib/etickets/credentials.ts";
import { createTicketPdf } from "../src/lib/etickets/pdf.ts";

test("opaque ticket QR contains only the credential and decodes as a real QR", async () => {
  const credential = randomUUID();
  const payload = ticketQrPayload(credential);
  assert.equal(parseTicketQrPayload(payload), credential);
  assert.equal(parseTicketQrPayload("SHIAP1:Customer Name"), null);
  assert.equal(parseTicketQrPayload("SHIAP1:" + credential + "?booking=private"), null);
  const png = PNG.sync.read(await QRCode.toBuffer(payload, { errorCorrectionLevel: "H", width: 620, margin: 3 }));
  const luminance = new Uint8ClampedArray(png.width * png.height);
  for (let pixel = 0; pixel < luminance.length; pixel++) {
    const offset = pixel * 4;
    luminance[pixel] = Math.round((png.data[offset] * 299 + png.data[offset + 1] * 587 + png.data[offset + 2] * 114) / 1000);
  }
  // A generated PNG has no perspective or camera noise. Decode its modules directly.
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]], [DecodeHintType.PURE_BARCODE, true]]);
  const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, png.width, png.height))), hints).getText();
  assert.equal(decoded, payload);
});

test("server PDF emits print-ready A4 multi-service pages with embedded font resources", async () => {
  const items = ["trip", "stay", "rental"].map((service_type, index) => ({
    id: `synthetic-${index}`, service_type, service_category: service_type,
    service_name: index === 0 ? "A long editorial itinerary title for validating line wrapping across an A4 voucher page" : `Synthetic ${service_type} voucher`,
    variant: "Synthetic package", date_start: "2026-12-14", date_end: service_type === "stay" ? "2026-12-16" : null,
    guests: 2, quantity: 1, notes: null, selected_addons: [], trip_id: null, property_id: null, room_type_id: null,
    service_catalog_id: null, session: null, location: null, check_in_time: null, check_out_time: null,
  }));
  const vouchers = items.map((item, index) => ({ isSyntheticSample: true,
    ticket: { id: `sample-${index}`, booking_item_id: item.id, ticket_code: `QA-SAMPLE-${index}`, qr_credential: randomUUID(), status: "issued", issued_at: new Date().toISOString() },
    bookingCode: "SYNTH-QA-0001", customerName: "SYNTHETIC QA - NOT A REAL CUSTOMER", orderStatus: "confirmed", items: [item],
    contacts: { contact_name: "SHIAP", whatsapp: null, email: null, website: "https://shiap.id", instagram: null },
  }));
  const pdf = await createTicketPdf(vouchers);
  const text = pdf.toString("latin1");
  assert.equal(text.slice(0, 5), "%PDF-");
  assert.match(text, /\/Count\s+3\b/);
  assert.match(text, /\/FontFile2\b/);
  assert.match(text, /\/MediaBox\s*\[0 0 595\.28 841\.89\]/);
});
