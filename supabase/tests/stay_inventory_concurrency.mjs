import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// Integration test against the SHIAP local Docker database only.
const database = "supabase_db_shiap-app";
const run = (sql, env = "stay-inventory-test", onData = () => {}) => new Promise((resolve, reject) => {
  const process = spawn("docker", ["exec", "-i", "-e", `PGAPPNAME=${env}`, database, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"]);
  let output = "";
  process.stdout.on("data", chunk => { output += chunk; onData(output); });
  process.stderr.on("data", chunk => { output += chunk; });
  process.once("error", reject);
  process.once("exit", status => resolve({ status, output }));
  process.stdin.end(sql);
});

const [customer, property, room] = Array.from({ length: 3 }, () => randomUUID());
const claimant = `stay-race-${room.slice(0, 8)}`;
const customerName = `inventory-${room}`;
const checked = async sql => {
  const result = await run(sql);
  assert.equal(result.status, 0, result.output);
  return result.output.trim();
};
const booking = `
  select set_config('request.jwt.claim.sub', '${customer}', false);
  set role authenticated;
  select id from public.create_booking_order('${customerName}','6280000000000',null,null,
    jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Synthetic race',
      'property_id','${property}','room_type_id','${room}','date_start',current_date+100,'date_end',current_date+101,
      'quantity',1,'guests',1)));
`;

await checked(`
  begin;
  insert into auth.users(id,aud,role,email)
    values ('${customer}','authenticated','authenticated','${customer}@local.test');
  insert into public.stay_properties(id,name,slug,location,status)
    values ('${property}','Synthetic concurrency test','${property}','Local test','published');
  insert into public.stay_room_types(id,property_id,name,capacity,total_units,weekday_price,weekend_price,status)
    values ('${room}','${property}','Test last unit',2,1,300000,375000,'active');
  commit;
`);
try {
  let notify;
  const started = new Promise(resolve => { notify = resolve; });
  const first = run(`begin; ${booking}\n\\echo HOLD_STARTED\nselect pg_sleep(8); commit;`,
    "stay-race-winner", output => { if (output.includes("HOLD_STARTED")) notify(); });
  await Promise.race([started, first.then(result => { throw Error(result.output); })]);
  const second = run(booking, claimant);
  let lockSeen = false;
  for (let attempt = 0; attempt < 5 && !lockSeen; attempt++) {
    lockSeen = await checked(`select exists(select 1 from pg_stat_activity where application_name='${claimant}' and wait_event_type='Lock');`) === "t";
    if (!lockSeen) await new Promise(resolve => setTimeout(resolve, 350));
  }
  const [winner, loser] = await Promise.all([first, second]);
  assert(lockSeen, "Second booking did not wait while first held the inventory lock");
  assert.equal(winner.status, 0, winner.output);
  assert.notEqual(loser.status, 0, loser.output);
  assert.match(loser.output, /Ketersediaan kamar tidak mencukupi/);
  assert.equal(await checked(`select count(*) from public.booking_items where room_type_id='${room}';`), "1");
  console.log("PASS: two concurrent checkouts competed for the last unit; one booking committed");
} finally {
  await checked(`
    begin;
    delete from public.booking_orders where user_id='${customer}' and customer_name='${customerName}';
    delete from public.stay_room_types where id='${room}';
    delete from public.stay_properties where id='${property}';
    delete from auth.users where id='${customer}';
    commit;
  `);
}
