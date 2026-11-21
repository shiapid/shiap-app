import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const database = process.argv[2];
assert.match(database ?? "", /^shiap_phase4b_test_[0-9a-f]{8}$/);
const container = "supabase_db_shiap-stay-v2-qa";
function sql(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database]);
    let out = "", error = "";
    child.stdout.on("data", (data) => { out += data; });
    child.stderr.on("data", (data) => { error += data; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out: out.trim(), error }));
    child.stdin.end(script);
  });
}

function read(name) {
  return readFileSync(new URL(name, import.meta.url), "utf8").replaceAll("\r\n", "\n");
}

const demo = read("unified_checkout_smoke.sql").split("do $$")[0].replace(/^begin;\n/, "").replace(/^\\ir .*\n/gm, "");
const fixture = (read("unified_checkout_fixture.sql") + "\n" + demo)
  .replaceAll("pg_temp.", "unified_test.")
  .replaceAll("create temp table", "create table");
const init = await sql(`
  begin;
  create schema unified_test;
  grant usage on schema unified_test to authenticated;
  set local search_path=unified_test,public;
  ${fixture}
  commit;
`);
assert.equal(init.code, 0, init.error);

function checkout() {
  return sql(`
    begin;
    set local lock_timeout='12s';
    set local statement_timeout='20s';
    set local search_path=unified_test,public;
    select unified_test.unified_book(104,array['stay','trip','experience']);
    select pg_sleep(2);
    commit;
  `);
}
const attempts = await Promise.all([checkout(), checkout()]);
assert.equal(attempts.filter(({ code }) => code === 0).length, 1, JSON.stringify(attempts));
assert.match(attempts.find(({ code }) => code !== 0).error, /tidak tersedia|mencukupi/);

function approve(stay) {
  return sql(`
    begin;
    set local statement_timeout='20s';
    set local search_path=unified_test,public;
    select set_config('request.jwt.claim.sub',(select ${stay ? "owner_id" : "admin"}::text from unified_test.f),true);
    select set_config('unified_test.stay_item',(select item_id from public.stay_partner_fulfillment where order_id=(select id from public.booking_orders where customer_name='QA Customer'))::text,true);
    select set_config('unified_test.exp_record',(select id from public.shiap_experience_booking_records where booking_id=(select id from public.booking_orders where customer_name='QA Customer'))::text,true);
    set local role authenticated;
    ${stay
      ? "select public.manage_stay_partner_item(current_setting('unified_test.stay_item')::uuid,'APPROVE','QA race approval');"
      : "select public.admin_review_experience_request(current_setting('unified_test.exp_record')::uuid,'approve','QA race approval');"}
    commit;
  `);
}
const approvals = await Promise.all([approve(true), approve(false)]);
assert.ok(approvals.every(({ code }) => code === 0), JSON.stringify(approvals));

const invariant = await sql(`
  select count(*) from shiap_private.unified_orders;
  select count(*) from shiap_private.unified_order_items;
  select count(*) from public.booking_orders where customer_name='QA Customer' and payment_enabled;
  select count(*) from public.booking_order_events where event_type='unified_payment_opened';
  select count(*) from public.booking_orders where customer_name='QA Customer' and payment_status='paid';
`);
assert.equal(invariant.code, 0, invariant.error);
assert.equal(invariant.out, "1\n3\n1\n1\n0");
console.log("PASS simultaneous checkout: one reservation, three service items, no oversell");
console.log("PASS simultaneous Experience and Stay approvals: one activation, no implicit Paid status");
