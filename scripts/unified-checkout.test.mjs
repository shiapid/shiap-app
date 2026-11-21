import assert from "node:assert/strict";
import test from "node:test";
import { eligibleUnifiedCart, unifiedCartPayload } from "../src/lib/unified-checkout.ts";

const stay = { serviceType: "stay", partnerStay: true, propertyId: "property", roomTypeId: "room" };
const trip = { serviceType: "trip", tripId: "trip", departureId: "departure" };

test("mixed selection admits only distinct supported services with real catalog selection", () => {
  assert.equal(eligibleUnifiedCart([stay, trip]), true);
  assert.equal(eligibleUnifiedCart([trip]), true);
  assert.equal(eligibleUnifiedCart([stay]), true);
  assert.equal(eligibleUnifiedCart([stay, stay]), false);
  assert.equal(eligibleUnifiedCart([{ ...stay, partnerStay: false }, trip]), false);
  assert.equal(eligibleUnifiedCart([{ ...trip, departureId: null }]), false);
  assert.equal(eligibleUnifiedCart([stay, { serviceType: "rental" }]), false);
});

test("mixed checkout sends selections without client prices or vendor economics", () => {
  const [item] = unifiedCartPayload([{ ...stay, unitPrice: 1, commission: 100, guests: 2,
    selectedAddons: [{ id: "breakfast", price: 1, name: "Breakfast" }] }]);
  assert.deepEqual(item.selected_addons, [{ id: "breakfast" }]);
  assert.equal(item.property_id, stay.propertyId);
  assert.equal(item.room_type_id, stay.roomTypeId);
  assert.equal(item.guests, 2);
  assert.equal("unitPrice" in item, false);
  assert.equal("commission" in item, false);
});
