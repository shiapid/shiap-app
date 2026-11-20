import test from "node:test";
import assert from "node:assert/strict";
import { parseCatalogRupiah } from "../src/lib/rupiah-input.ts";

test("product prices accept exact whole Rupiah and enforce the product minimum", () => {
  for (const price of [0, 300000, 375000, 1000000]) {
    assert.equal(parseCatalogRupiah(String(price)), price);
    assert.equal(parseCatalogRupiah(price), price);
  }
  assert.equal(parseCatalogRupiah("0", 1), null);
  for (const value of ["", null, "300.000", "3e5", 1.25, "9999999999999", -1]) {
    assert.equal(parseCatalogRupiah(value), null);
  }
});
