import assert from "node:assert/strict";
import test from "node:test";
import { bookingItemCategory, bookingServiceFilter } from "../src/lib/admin/booking-category.ts";

test("classifies all five booking categories, including Rental stored as activity", () => {
  for (const category of ["trip", "stay", "activity", "documentation"]) {
    assert.equal(bookingItemCategory({ service_type: category, service_category: category }), category);
  }
  assert.equal(bookingItemCategory({ service_type: "activity", service_category: "rental" }), "rental");
});

test("uses the booking type when the stored category is a placeholder or missing", () => {
  for (const category of ["trip", "stay", "activity", "documentation"]) {
    for (const stored of ["other", "", null, undefined]) {
      assert.equal(bookingItemCategory({ service_type: category, service_category: stored }), category);
    }
  }
  assert.equal(bookingItemCategory({ service_type: "other", service_category: "other" }), "other");
});

test("normalizes legacy service names and query parameters", () => {
  assert.equal(bookingItemCategory({ service_type: " Strip " }), "trip");
  assert.equal(bookingItemCategory({ service_type: "Shinema" }), "documentation");
  assert.equal(bookingServiceFilter("shinema"), "documentation");
  assert.equal(bookingServiceFilter("strip"), "trip");
  assert.equal(bookingServiceFilter("unknown"), "all");
});
