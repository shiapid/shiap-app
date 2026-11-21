import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Fixture writes are restricted to the isolated Phase 2 QA stack.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const app = "http://127.0.0.1:3274";
assert.equal(url, "http://127.0.0.1:57321");
assert(publishable && secret);
const service = createClient(url, secret, { auth: { persistSession: false } });

function result(response) {
  assert(!response.error, response.error?.message);
  return response.data;
}

async function user(isAdmin = false) {
  const email = "stay-v2-" + randomUUID() + "@example.invalid";
  const password = randomUUID() + "Aa!";
  const { user } = result(await service.auth.admin.createUser({ email, password, email_confirm: true }));
  if (isAdmin) result(await service.from("admin_users").insert({ user_id: user.id }));
  const cookies = new Map();
  const client = createServerClient(url, publishable, {
    cookies: {
      getAll: () => [...cookies.values()],
      setAll: values => values.forEach(cookie => cookies.set(cookie.name, cookie)),
    },
  });
  result(await client.auth.signInWithPassword({ email, password }));
  return { client, id: user.id, cookie: [...cookies.values()].map(cookie => cookie.name + "=" + cookie.value).join("; ") };
}

async function http(path, status, viewer, marker) {
  const response = await fetch(app + path, {
    redirect: "manual",
    headers: viewer ? { Cookie: viewer.cookie } : undefined,
    signal: AbortSignal.timeout(45_000),
  });
  assert.equal(response.status, status, path);
  const html = await response.text();
  if (marker) assert(html.includes(marker), "Expected page content at " + path);
  return html;
}

const [admin, owner, outsider] = await Promise.all([user(true), user(), user()]);
const destination = result(await service.from("places_destinations").select("id").eq("is_active", true).limit(1).single());
const suffix = randomUUID().slice(0, 8);
const publicListingName = "Synthetic Places " + suffix;
const placesId = result(await admin.client.rpc("admin_create_free_places_listing", {
  p_name: publicListingName, p_destination_id: destination.id, p_whatsapp: "080000000000",
}));
const places = result(await service.from("places_properties").select("id,slug").eq("id", placesId).single());
const stays = result(await service.from("stay_properties").insert([
  { name: "Synthetic Linked Stay " + suffix, slug: "stay-linked-" + suffix, location: "Synthetic", status: "published", destination_id: destination.id },
  { name: "Synthetic Legacy Stay " + suffix, slug: "stay-legacy-" + suffix, location: "Synthetic", status: "published", destination_id: destination.id },
]).select("id,name,slug"));
const [linked, legacy] = stays;
result(await service.from("places_property_members").insert({
  property_id: places.id, user_id: owner.id, role: "OWNER", verified_at: new Date().toISOString(), verified_by: admin.id,
}));

await http("/admin/stay/reconciliation", 307);
await http("/admin/stay/reconciliation", 307, owner);
await http("/admin/stay/reconciliation", 200, admin, "Pemetaan Properti Stay");
await http("/admin/places", 200, admin, publicListingName);
await http("/admin/stay/partners", 200, admin, "Buat draft perjanjian");
await http("/places/partners", 200, undefined, "1.950.000");
await http("/stay/" + legacy.slug, 200, undefined, legacy.name);
await http("/places/" + places.slug, 200, undefined, publicListingName);
const free = await http("/partner/places/" + places.id, 200, owner, "Profil dasar");
assert(!free.includes("Pratinjau draft tersimpan"));
await http("/partner/places/" + places.id, 404, outsider);
await http("/api/partner/places/media?propertyId=" + places.id, 403, owner);
await http("/partner/billing", 200, owner, "Invoice Premium");
await http("/booking", 200);
await http("/api/bookings", 200, undefined, '"guest":true');

result(await admin.client.rpc("admin_reconcile_stay_v2_property", {
  p_places_id: places.id, p_stay_id: linked.id, p_note: "Synthetic verified match",
}));
await http("/admin/stay/reconciliation", 200, admin, linked.name);
await http("/stay/" + linked.slug, 200, undefined, linked.name);
await http("/places/" + places.slug, 200, undefined, publicListingName);
console.log("STAY_V2_AUTH_HTTP_PASS admin, owner, non-owner, guest, legacy URLs, mapping and invoice history");
