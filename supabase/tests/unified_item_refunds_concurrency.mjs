import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const database = process.argv[2];
assert.match(database ?? "", /^shiap_phase4c_test_[0-9a-f]{8}$/);
function sql(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_shiap-stay-v2-qa", "psql", "-XAtq",
      "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database]);
    let out = "", error = "";
    child.stdout.on("data", (data) => { out += data; });
    child.stderr.on("data", (data) => { error += data; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out: out.trim(), error }));
    child.stdin.end(script);
  });
}

function read(file) {
  return readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
}

const fixtures = [
  read("unified_checkout_fixture.sql"),
  read("unified_checkout_catalog_fixture.sql"),
  read("payment_integrity_test_helpers.sql"),
  read("unified_item_refunds_smoke.sql").split("\ndo $$")[0].replace(/^begin;\n/, "").replace(/^\\ir .*\n/gm, ""),
].join("\n").replaceAll("pg_temp.", "refund_test.").replaceAll("create temp table", "create table");
const secondAdmin = randomUUID();
const seed = await sql(`
  begin;
  create schema refund_test;
  grant usage on schema refund_test to authenticated;
  set local search_path=refund_test,public;
  ${fixtures}
  insert into auth.users(id,email) values('${secondAdmin}','${secondAdmin}@refund.invalid');
  insert into public.admin_users(user_id) values('${secondAdmin}');
  create table refund_test.target as
    select refund_test.unified_book(101,array['stay','trip','experience']) as booking;
  select refund_test.pay_booking((select booking from refund_test.target),'QA-REFUND-RACE-IN');
  commit;
`);
assert.equal(seed.code, 0, seed.error);

const lookup = await sql(`
  select admin from refund_test.f;
  select item_id from shiap_private.unified_order_items where booking_id=(select booking from refund_test.target) and service='trip';
`);
assert.equal(lookup.code, 0, lookup.error);
const [firstAdmin, item] = lookup.out.split(/\r?\n/);
function operation(actor, action, amount, refund = null, delay = false) {
  const key = randomUUID();
  return sql(`
    begin;
    set local statement_timeout='15s';
    set local request.jwt.claim.sub='${actor}';
    set local role authenticated;
    select public.admin_manage_unified_refund('${key}','${action}','${item}',${refund ? "'" + refund + "'" : "null"},
      jsonb_build_object('reason','Synthetic concurrency Finance action','amount',${amount}));
    ${delay ? "select pg_sleep(1);" : ""}
    commit;
  `);
}
const requests = await Promise.all([
  operation(firstAdmin, "request", 180000, null, true),
  operation(secondAdmin, "request", 180000, null, true),
]);
assert.equal(requests.filter((r) => r.code === 0).length, 1, JSON.stringify(requests));
assert.match(requests.find((r) => r.code !== 0).error, /melebihi sisa alokasi/);
const one = requests.find((r) => r.code === 0).out.split(/\r?\n/).find((line) => /^[0-9a-f-]{36}$/.test(line));
const two = await operation(secondAdmin, "request", 60000);
assert.equal(two.code, 0, two.error);
for (const id of [one, two.out]) {
  const result = await operation(firstAdmin, "review", 0, id);
  assert.equal(result.code, 0, result.error);
}
const contenders = await Promise.all([
  operation(firstAdmin, "approve", 180000, one, true),
  operation(secondAdmin, "approve", 180000, one, true),
  operation(secondAdmin, "approve", 60000, two.out, true),
]);
assert.equal(contenders.filter((r) => r.code === 0).length, 2, JSON.stringify(contenders));
assert.match(contenders.find((r) => r.code !== 0).error, /Status atau tinjauan/);
const totals = await sql(`
  select count(*)||'|'||sum(approved_idr)||'|'||sum(paid_idr)
    from shiap_private.unified_item_refunds where item_id='${item}' and status='APPROVED';
  select count(*) from public.finance_transaction_entries where entry_type='refund';
`);
assert.equal(totals.code, 0, totals.error);
assert.deepEqual(totals.out.split(/\r?\n/), ["2|240000|0", "0"]);
console.log("PASS concurrent oversubscribed requests and competing approvals. Liability 240000 IDR, posted refunds 0.");

for (const id of [one, two.out]) {
  const result = await operation(firstAdmin, "queue", 0, id);
  assert.equal(result.code, 0, result.error);
}
function payout(actor, id, amount) {
  return sql(`
    begin;
    set local statement_timeout='15s';
    set local search_path=refund_test,public;
    set local request.jwt.claim.sub='${actor}';
    select refund_test.confirm_refund('${item}','${id}',${amount},'QA-OUT-RACE',gen_random_uuid());
    select pg_sleep(1);
    commit;
  `);
}
const payouts = await Promise.all([payout(firstAdmin, one, 180000), payout(secondAdmin, two.out, 60000)]);
assert.equal(payouts.filter((result) => result.code === 0).length, 1, JSON.stringify(payouts));
assert.match(payouts.find((result) => result.code !== 0).error, /duplicate key value/);
const paid = await sql(`
  select count(*) from public.finance_transaction_entries where entry_type='refund' and status='posted';
  select count(*) from shiap_private.unified_item_refunds where item_id='${item}' and status='PAID';
`);
assert.equal(paid.code, 0, paid.error);
assert.deepEqual(paid.out.split(/\r?\n/), ["1", "1"]);
console.log("PASS concurrent payout reference reuse. One posted refund and one PAID request.");
