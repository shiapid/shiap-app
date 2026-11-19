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

import { DEFAULT_PLACES_WHATSAPP_TEMPLATE, validPlacesWhatsAppTemplate, renderPlacesWhatsAppTemplate } from '../src/lib/places/whatsapp-template.ts';
test('custom Places templates require both known variables and preserve encoded references',()=>{
 assert.equal(validPlacesWhatsAppTemplate(DEFAULT_PLACES_WHATSAPP_TEMPLATE),true);
 for(const value of ['', '{nama_properti}', '{nama_properti} {kode_referensi} {unknown}', '{nama_properti} {kode_referensi} {', 'x'.repeat(2001)]) assert.equal(validPlacesWhatsAppTemplate(value),false);
 const template='Halo 👋 *{nama_properti}* & harga? Ref {kode_referensi}';
 const url=buildWhatsAppUrl({phone:'08562130222',propertyName:'Villa A & B',refCode:'SHP-2ABCD',template});
 assert.equal(new URL(url).pathname,'/628562130222');
 assert.equal(new URL(url).searchParams.get('text'),'Halo 👋 *Villa A & B* & harga? Ref SHP-2ABCD');
 assert.equal(renderPlacesWhatsAppTemplate('{nama_properti} {kode_referensi}','A {kode_referensi}','SHP-2ABCD'),'A {kode_referensi} SHP-2ABCD');
 assert.match(new URL(buildWhatsAppUrl({phone:'08562130222',propertyName:'Villa',refCode:'SHP-2ABCD'})).searchParams.get('text'),/Halo Kak 👋/);
});

import { validatePlacesLead, PLACES_PRIVACY_VERSION } from '../src/lib/places/leads.ts';
test('lead validation normalizes contacts and rejects spam, malformed input and obsolete notices',()=>{
 const body={name:'Synthetic Visitor',phone:'08562130222',propertyId:'77777777-7777-4777-8777-777777777777',requestId:'88888888-8888-4888-8888-888888888888',privacyVersion:PLACES_PRIVACY_VERSION};
 assert.equal(validatePlacesLead(body).phone,'628562130222');
 for(const change of [{name:''},{name:'x'.repeat(101)},{phone:'abc'},{privacyVersion:'old'},{propertyId:'bad'},{requestId:'bad'},{website:'spam'}]) assert.equal(validatePlacesLead({...body,...change}),null);
});

test("compact Places navigation combines filters, preserves unrelated parameters and resets pagination", async () => {
  const { placesSearchHref } = await import("../src/lib/places/search-navigation.ts");
  const href = placesSearchHref("?page=3&utm_source=home&q=old", "Villa & Stay", "pantai-tamiang");
  const url = new URL(href, "https://app.shiap.id");
  assert.equal(url.searchParams.get("q"), "Villa & Stay");
  assert.equal(url.searchParams.get("destination"), "pantai-tamiang");
  assert.equal(url.searchParams.get("utm_source"), "home");
  assert.equal(url.searchParams.has("page"), false);
  assert.equal(placesSearchHref("?q=old&destination=old&page=2", "", ""), "/places");
});

test("Premium content validation rejects unsafe fields and preserves integer display prices", async()=>{
 const {validatePremiumProfile,premiumPeriodActive}=await import("../src/lib/places/premium.ts");
 assert.equal(validatePremiumProfile({starting_price_idr:100000}).starting_price_idr,100000);
 assert.equal(validatePremiumProfile({starting_price_idr:0}).starting_price_idr,0);
 for(const body of [{starting_price_idr:-1},{starting_price_idr:1.5},{cover_image_url:"javascript:alert(1)"},{gallery_urls:["https://user:password@example.invalid/x"]},{social_links:{unknown:"https://example.invalid"}},{reviewed_by:"forged"},{room_summaries:[{name:"Room",capacity:0}]}])assert.equal(validatePremiumProfile(body),null);
 const now=Date.parse("2026-11-19T00:00:00Z");assert(premiumPeriodActive("TRIALING","2026-11-18","2026-11-20",now));assert(!premiumPeriodActive("ACTIVE","2026-11-18","2026-11-19",now));assert(!premiumPeriodActive("PENDING_VERIFICATION","2026-11-18","2026-11-20",now));
});

test("partner return paths reject external redirects and retain booking recovery",async()=>{const {safeAuthNext}=await import("../src/lib/auth-next.ts");for(const x of ["https://evil.invalid","//evil.invalid","/\\evil.invalid","/partner/../../evil","/partner?next=https://evil.invalid"])assert.equal(safeAuthNext(x),"/profile");assert.equal(safeAuthNext('/partner/claims'),'/partner/claims');const id='11111111-1111-4111-8111-111111111111';assert.equal(safeAuthNext('/my-booking/'+id),'/my-booking/'+id);assert.equal(safeAuthNext('/partner/places/'+id),'/partner/places/'+id);});

test("managed property media only matches the canonical asset URL",async()=>{const {profileUsesMedia}=await import("../src/lib/places/media.ts");const id='11111111-1111-4111-8111-111111111111';assert(profileUsesMedia({cover_image_url:'https://app.shiap.id/api/places/media/'+id},id));assert(!profileUsesMedia({cover_image_url:'https://evil.invalid/api/places/media/'+id},id));assert(!profileUsesMedia({gallery_urls:['javascript:alert(1)']},id));});
