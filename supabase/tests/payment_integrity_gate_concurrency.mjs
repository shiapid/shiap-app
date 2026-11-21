import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const container = "supabase_db_shiap-stay-v2-qa";
const database = process.argv[2];
assert.match(database ?? "", /^shiap_phase4a_test_[0-9a-f]{8}$/);
const sql = (script) => new Promise((resolve, reject) => {
  const proc = spawn("docker", ["exec", "-i", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]);
  let stdout = "", stderr = "";
  proc.stdout.on("data", (chunk) => { stdout += chunk; });
  proc.stderr.on("data", (chunk) => { stderr += chunk; });
  proc.on("error", reject);
  proc.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
  proc.stdin.end(script);
});

const [adminA, adminB, bookingA, bookingB, reserveA, reserveB] = Array.from({ length: 6 }, () => randomUUID());
const source = "RACE-" + randomUUID();
const setup = await sql(`
  begin;
  update public.payment_settings set bank_name='Synthetic QA Bank',account_number='1234567890',is_active=true where id;
  insert into auth.users(id,email) values ('${adminA}','${adminA}@race.invalid'), ('${adminB}','${adminB}@race.invalid');
  insert into public.admin_users(user_id) values ('${adminA}'), ('${adminB}');
  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp,total_amount) values
    ('${bookingA}','RACE-${bookingA}','${adminA}','Synthetic','620000000000',300000),
    ('${bookingB}','RACE-${bookingB}','${adminB}','Synthetic','620000000000',300000);
  insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('finance-bank-evidence','${adminA}/${reserveA}','${adminA}','{"mimetype":"application/pdf"}'),
    ('finance-bank-evidence','${adminB}/${reserveB}','${adminB}','{"mimetype":"application/pdf"}');
  commit;
`);
assert.equal(setup.code, 0, setup.stderr);
const occurred = new Date(Date.now() - 120000).toISOString();
const race = (admin, booking, request, proof = null, bankId = source) => sql(`
  begin;
  set local role authenticated;
  set local lock_timeout='15s';
  set local statement_timeout='25s';
  set local request.jwt.claim.sub='${admin}';
  select public.finance_verify_bank_transfer('booking','${booking}',${proof ? "'"+proof+"'" : "null"},300000,'${bankId}','DISPLAY-REF',
    '${occurred}','${admin}/${request}',null,'${request}');
  select pg_sleep(2);
  commit;
`);
const results = await Promise.all([race(adminA, bookingA, reserveA), race(adminB, bookingB, reserveB)]);
assert.equal(results.filter(({ code }) => code === 0).length, 1, JSON.stringify(results));
const loser = results.find(({ code }) => code !== 0);
assert.match(loser.stderr, /Mutasi bank ini sudah dialokasikan/);
const summary = await sql(`
  select count(*) from public.booking_orders where id in ('${bookingA}','${bookingB}') and payment_status='paid';
  select count(*) from public.finance_transaction_entries where booking_id in ('${bookingA}','${bookingB}') and status='posted';
  select count(*) from shiap_private.bank_receipt_allocations where booking_id in ('${bookingA}','${bookingB}');
  select count(*) from shiap_private.verified_bank_transfers where source_transaction_id='${source}';
`);
assert.equal(summary.code, 0, summary.stderr);
assert.equal(summary.stdout, "1\n1\n1\n1");
console.log("PASS two Finance sessions, one canonical deposit, one allocation, one receipt, one Paid booking");

const [pendingOrder, proofId, approveRequest, manualRequest] = Array.from({ length: 4 }, () => randomUUID());
const pending = await sql(`
  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp,total_amount,payment_status)
  values ('${pendingOrder}','RACE-${pendingOrder}','${adminA}','Synthetic','620000000000',300000,'pending');
  insert into public.booking_payment_records(id,booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
  values ('${proofId}','${pendingOrder}','${adminA}','synthetic/${proofId}','qa.pdf','application/pdf',100);
  insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('finance-bank-evidence','${adminA}/${approveRequest}','${adminA}','{"mimetype":"application/pdf"}'),
    ('finance-bank-evidence','${adminB}/${manualRequest}','${adminB}','{"mimetype":"application/pdf"}');
`);
assert.equal(pending.code, 0, pending.stderr);
const [approval, manual] = await Promise.all([
  race(adminA, pendingOrder, approveRequest, proofId, source + "-PROOF"),
  race(adminB, pendingOrder, manualRequest, null, source + "-MANUAL"),
]);
assert.equal(approval.code, 0, approval.stderr);
assert.notEqual(manual.code, 0);
assert.match(manual.stderr, /menunggu review bukti|duplicate key/);
const proofSummary = await sql(`
  select count(*) from public.finance_transaction_entries where booking_id='${pendingOrder}' and status='posted';
  select status from public.booking_payment_records where id='${proofId}';
  select count(*) from shiap_private.verified_bank_transfers where source_transaction_id='${source}-MANUAL';
`);
assert.equal(proofSummary.code, 0, proofSummary.stderr);
assert.equal(proofSummary.stdout, "1\napproved\n0");
console.log("PASS parallel proof review and manual Finance entry, one receipt and no orphan bank transfer");
