import assert from "node:assert/strict";
import test from "node:test";
import { checkBookingConfiguration } from "./check-booking-production.mjs";

const ref = "sbomjhwmjmqteybsegdl";
const environment = { NEXT_PUBLIC_SUPABASE_URL: "https://" + ref + ".supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-fixture", SUPABASE_SECRET_KEY: "sb_secret_test_fixture" };

test("missing server credentials fail before contacting Supabase and expose no values", async () => {
  let called = false;
  const result = await checkBookingConfiguration({ ...environment, SUPABASE_SECRET_KEY: "" }, async () => { called = true; });
  assert.equal(result.code, "MISSING_CONFIGURATION");
  assert.equal(called, false);
  assert.equal(JSON.stringify(result).includes(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), false);
});

test("project, server role and runtime initialization are checked", async () => {
  assert.equal((await checkBookingConfiguration({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "invalid" })).code, "INVALID_URL");
  assert.equal((await checkBookingConfiguration({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" })).code, "PROJECT_MISMATCH");
  const jwt = (role, project) => "fixture." + Buffer.from(JSON.stringify({ role, ref: project })).toString("base64url") + ".fixture";
  assert.equal((await checkBookingConfiguration({ ...environment, SUPABASE_SECRET_KEY: jwt("anon", ref) })).code, "INVALID_SERVER_KEY_ROLE");
  assert.equal((await checkBookingConfiguration({ ...environment, SUPABASE_SECRET_KEY: jwt("service_role", "other") })).code, "SERVER_KEY_PROJECT_MISMATCH");
});

test("read-only probe distinguishes credentials, permissions, schema and connectivity", async () => {
  for (const [status, code] of [[200, "BOOKING_CONFIGURATION_OK"], [401, "INVALID_CREDENTIALS"], [403, "DATABASE_PERMISSION_DENIED"], [404, "BOOKING_SCHEMA_MISSING"], [503, "SUPABASE_UNAVAILABLE"]]) {
    const result = await checkBookingConfiguration(environment, async (url, options) => {
      assert.ok(url.endsWith("booking_guest_sessions?select=id&limit=0"));
      assert.equal(options.method, undefined);
      return new Response("[]", { status });
    });
    assert.equal(result.code, code);
    assert.equal(result.ok, status === 200);
  }
  assert.equal((await checkBookingConfiguration(environment, async () => { throw new Error("network"); })).code, "SUPABASE_CONNECTION_FAILURE");
});
