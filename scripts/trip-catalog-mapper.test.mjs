import test from "node:test";
import assert from "node:assert/strict";
import { mapTripPackage } from "../src/lib/catalog-mappers.ts";

const base = {
  slug: "teluk-tamiang",
  title: "Jelajah Teluk Tamiang",
  location: "Kotabaru",
};

test("maps grouped admin itinerary into day, activity, time, and description", () => {
  const trip = mapTripPackage({
    ...base,
    itinerary: [{
      day: "Hari 1",
      title: "Island hopping",
      activities: [
        { time: "08:30", title: "Berangkat ke dermaga", description: "Berkumpul di titik temu" },
        { time: "10:00", title: "Snorkeling", description: "Eksplorasi spot terumbu" },
      ],
    }],
  });

  assert.deepEqual(trip.itinerary, [
    { day: "Hari 1", dayTitle: "Island hopping", time: "08:30", title: "Berangkat ke dermaga", description: "Berkumpul di titik temu" },
    { day: "Hari 1", dayTitle: "Island hopping", time: "10:00", title: "Snorkeling", description: "Eksplorasi spot terumbu" },
  ]);
});

test("keeps legacy flat itinerary rows compatible", () => {
  const trip = mapTripPackage({
    ...base,
    itinerary: [{ time: "09:00", title: "Menyeberang", description: "Naik kapal" }],
  });

  assert.equal(trip.itinerary.length, 1);
  assert.equal(trip.itinerary[0].time, "09:00");
  assert.equal(trip.itinerary[0].title, "Menyeberang");
  assert.equal(trip.itinerary[0].description, "Naik kapal");
});
