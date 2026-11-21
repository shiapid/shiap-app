import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const database = process.argv[2];
assert.match(database ?? "", /^shiap_phase5b_test_[0-9a-f]{8}$/);
const container = "supabase_db_shiap-stay-v2-qa";

function sql(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1",
      "-U", "supabase_admin", "-d", database]);
    let output = "";
    let error = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { error += data; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, output: output.trim(), error }));
    child.stdin.end(script);
  });
}

function read(filename) {
  return readFileSync(new URL(filename, import.meta.url), "utf8").replaceAll("\r\n", "\n");
}

const smoke = read("stay_v2_wallet_smoke.sql");
const fixtureEnd = "  update shiap_private.stay_payout_control set enabled=true where id;";
assert.ok(smoke.includes(fixtureEnd));
const seed = await sql(`
  begin;
  create schema wallet_race;
  grant usage on schema wallet_race to authenticated;
  set local search_path=wallet_race,public;
  ${read("payment_integrity_test_helpers.sql").replaceAll("pg_temp.", "wallet_race.")}
  ${read("unified_checkout_fixture.sql").replaceAll("create temp table", "create table")}
  create table wallet_race.test_case(owner_id uuid,item_id uuid,account_id uuid,amount bigint);
  ${smoke.slice(smoke.indexOf("do $$"), smoke.indexOf(fixtureEnd) + fixtureEnd.length)
    .replaceAll("pg_temp.", "wallet_race.")}
  insert into wallet_race.test_case values(owner_id,item,account_id,expected_net/2);
  end $$;
  commit;
`);
assert.equal(seed.code, 0, seed.error);
const data = await sql("select * from wallet_race.test_case;");
assert.equal(data.code, 0, data.error);
const [owner, item, account, amount] = data.output.split("|");
assert.match(amount, /^[1-9][0-9]*$/);

function request(id) {
  return sql(`
    begin;
    set local statement_timeout='15s';
    set local role authenticated;
    set local request.jwt.claim.sub='${owner}';
    select public.partner_request_stay_withdrawal('${id}','${item}','${account}',${amount});
    select pg_sleep(1);
    commit;
  `);
}

const result = await Promise.all([request(randomUUID()), request(randomUUID())]);
assert.equal(result.filter(entry => entry.code === 0).length, 1, JSON.stringify(result));
assert.match(result.find(entry => entry.code !== 0).error, /Saldo tersedia/);
const reserved = await sql(`select count(*)||'|'||sum(amount_idr) from shiap_private.stay_withdrawals
  where item_id='${item}' and status='PENDING';`);
assert.equal(reserved.code, 0, reserved.error);
assert.equal(reserved.output, "1|" + amount);
console.log("PASS concurrent wallet requests reserved one cumulative early limit.");
