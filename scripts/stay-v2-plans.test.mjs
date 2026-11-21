import assert from "node:assert/strict";
import { test } from "node:test";
import { stayV2CommercialTerms, stayV2OwnerMenu, stayV2PlanFeatures } from "../src/lib/stay-v2/plans.ts";

test("Stay V2 plan inventory preserves inheritance and prospective offer terms", () => {
  assert.equal(stayV2PlanFeatures.FREE.length, 11);
  assert.equal(stayV2PlanFeatures.PREMIUM.length, 27);
  assert.equal(stayV2PlanFeatures.PARTNER.length, 62);
  assert(stayV2PlanFeatures.FREE.every(feature => stayV2PlanFeatures.PREMIUM.includes(feature)));
  assert(stayV2PlanFeatures.PREMIUM.filter(feature => feature !== "trial").every(feature => stayV2PlanFeatures.PARTNER.includes(feature)));
  assert(!stayV2PlanFeatures.PARTNER.includes("trial"));
  assert.deepEqual(stayV2CommercialTerms, {
    freeIdr: 0, premiumMonthlyIdr: 199000, premiumYearlyIdr: 1950000,
    trialDays: 14, partnerSubscriptionIdr: 0, partnerCommissionBps: 1500,
  });
});

test("owner menu keeps invoice history and exposes only implemented entitled functions", () => {
  const base = { property_id: "p", commercial_plan: "FREE", premium_content: false, partner_status: "NONE", owner_verified: true, contact_verified: true };
  const free = stayV2OwnerMenu([base], true).map(item => item.href);
  assert(free.includes("/partner/billing"));
  assert(!free.includes("/partner/analytics"));
  const manager = stayV2OwnerMenu([{ ...base, commercial_plan: "PREMIUM", premium_content: true }], false).map(item => item.href);
  assert(manager.includes("/partner/analytics"));
  assert(!manager.includes("/partner/billing"));
  const active = stayV2OwnerMenu([{ ...base, commercial_plan: "PARTNER", partner_status: "MARKETING_ACTIVE", premium_content: true }], true);
  assert(!active.some(item => /wallet|payout|checkout|booking/.test(item.href)));
});
