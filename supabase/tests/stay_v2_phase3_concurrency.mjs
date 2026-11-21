import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const database = "supabase_db_shiap-stay-v2-qa";
const binding = spawnSync("docker", ["port", database, "5432/tcp"], { encoding: "utf8" });
assert.equal(binding.status, 0);
assert.match(binding.stdout, /:57322/);

function run(sql, name = "stay-partner-fixture", progress = () => {}) {
  return new Promise((resolve, reject) => {
    const process = spawn("docker", ["exec", "-i", "-e", "PGAPPNAME=" + name, database,
      "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"]);
    let output = "";
    process.stdout.on("data", chunk => { output += chunk; progress(output); });
    process.stderr.on("data", chunk => { output += chunk; });
    process.once("error", reject);
    process.once("exit", status => resolve({ status, output }));
    process.stdin.end(sql);
  });
}

async function checked(sql) {
  const result = await run(sql);
  assert.equal(result.status, 0, result.output);
  return result.output.trim();
}

const lifecycle = readFileSync(new URL("./stay_v2_phase3_smoke.sql", import.meta.url), "utf8");
const fixtureSql = lifecycle.split("insert into public.stay_partner_addons")[0];
assert(fixtureSql.includes("Activate synthetic request mode"));
const seed = await checked(fixtureSql + `
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
set local role authenticated;
select public.manage_stay_partner_booking_config(stay,'APPROVE_INSTANT','Verified synthetic room rates') from f;
reset role;
select json_build_object('stay',stay,'room',room,'place',place,'admin',admin,'owner',owner_id,'customer',customer,'agreement',contract,'application',app) from f;
commit;
`);
const fixture = JSON.parse(seed.split(/\r?\n/).findLast(line => line.startsWith("{")));
for (const id of Object.values(fixture)) assert.match(id, /^[a-f0-9-]{36}$/);

const book = `
select set_config('request.jwt.claim.sub','${fixture.customer}',false);
set role authenticated;
select id from public.create_booking_order('Synthetic Partner Last Unit','+620000000000',null,null,
  jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Synthetic concurrency unit',
    'property_id','${fixture.stay}','room_type_id','${fixture.room}','date_start',current_date+150,'date_end',current_date+151,
    'quantity',1,'guests',1)));
`;
try {
  let started;
  const reserved = new Promise(resolve => { started = resolve; });
  const first = run(`begin; ${book}\n\\echo STAY_PARTNER_HOLD_READY\nselect pg_sleep(8); commit;`,
    "stay-partner-winner", text => { if (text.includes("STAY_PARTNER_HOLD_READY")) started(); });
  await Promise.race([reserved, first.then(result => { throw Error(result.output); })]);
  const second = run(book, "stay-partner-contender");
  let sawLock = false;
  for (let attempt = 0; attempt < 8 && !sawLock; attempt++) {
    sawLock = await checked("select exists(select 1 from pg_stat_activity where application_name='stay-partner-contender' and wait_event_type='Lock')") === "t";
    if (!sawLock) await new Promise(resolve => setTimeout(resolve, 300));
  }
  const [winner, loser] = await Promise.all([first, second]);
  assert(sawLock, "The competitor did not wait on the reservation lock");
  assert.equal(winner.status, 0, winner.output);
  assert.notEqual(loser.status, 0, loser.output);
  assert.match(loser.output, /Ketersediaan kamar tidak mencukupi/);
  assert.equal(await checked(`select count(*) from public.stay_partner_fulfillment where property_id='${fixture.stay}' and mode='INSTANT'`), "1");
  console.log("STAY_PARTNER_CONCURRENCY_PASS one reservation for the last unit");
} finally {
  await checked(`
begin;
delete from public.stay_partner_operations_audit where property_id='${fixture.stay}';
delete from public.stay_partner_fulfillment where property_id='${fixture.stay}';
delete from public.booking_orders where user_id='${fixture.customer}' and customer_name='Synthetic Partner Last Unit' and payment_status='unpaid';
delete from public.stay_partner_units where room_type_id='${fixture.room}';
delete from public.stay_room_inventory_blocks where room_type_id='${fixture.room}';
delete from public.stay_partner_booking_config where property_id='${fixture.stay}';
delete from public.stay_agreement_members where agreement_id='${fixture.agreement}';
delete from public.stay_service_agreements where id='${fixture.agreement}';
delete from public.stay_service_applications where id='${fixture.application}';
delete from public.places_property_members where property_id='${fixture.place}';
delete from public.notification_events
 where places_subscription_id in(select id from public.places_subscriptions where property_id='${fixture.place}');
delete from public.places_subscriptions where property_id='${fixture.place}';
delete from public.places_partner_audit_logs where property_id='${fixture.place}';
delete from public.places_properties where id='${fixture.place}' and name='Synthetic Places Partner';
delete from public.stay_room_types where id='${fixture.room}';
delete from public.stay_properties where id='${fixture.stay}' and name='Synthetic Partner Stay';
delete from auth.users where id in ('${fixture.customer}','${fixture.owner}','${fixture.admin}');
commit;
`);
}
