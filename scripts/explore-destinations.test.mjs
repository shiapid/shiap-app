import assert from "node:assert/strict";
import test from "node:test";
import { catalogDestinations, matchesSearch } from "../src/lib/explore-destinations.ts";

test("deduplicates spelling variants and adds unambiguous catalog context", () => {
  const resolve = catalogDestinations(["Kotabaru", " KOTABARU ", "Kotabaru, Kalimantan Selatan", "Kotabaru, Kalimantan Selatan, Indonesia"]);
  assert.deepEqual(resolve(" KOTABARU "), { id: "kotabaru,kalimantan selatan", label: "Kotabaru, Kalimantan Selatan" });
  assert.equal(resolve("Kotabaru, Kalimantan Selatan, Indonesia").id, resolve("Kotabaru").id);
});

test("keeps same-named places distinct when qualified by different cities", () => {
  const places = catalogDestinations(["Sukamaju", "Sukamaju, Bandung, Jawa Barat", "Sukamaju, Depok, Jawa Barat"]);
  assert.notEqual(places("Sukamaju, Bandung, Jawa Barat").id, places("Sukamaju, Depok, Jawa Barat").id);
  assert.equal(places("Sukamaju").id, "sukamaju");
  assert.equal(places(""), null);
});

test("search matches product and geographic terms in any order", () => {
  assert.ok(matchesSearch("Private Dinner — Kuta, Badung, Bali • Experience", "bali PRIVATE dinner"));
  assert.ok(!matchesSearch("Private Dinner — Kuta, Badung, Bali", "Lombok dinner"));
});
