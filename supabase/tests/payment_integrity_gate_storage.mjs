import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const { PHASE4A_QA_URL: url, PHASE4A_QA_ANON: anon, PHASE4A_QA_SERVICE: key } = process.env;
assert.equal(url, "http://127.0.0.1:57321");
const makeClient = (token) => createClient(url, token, { auth: { persistSession: false } });
const service = makeClient(key);
const bankBucket = "finance-bank-evidence";
const ids = [];
let evidencePath;
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8" });
const container = "supabase_db_shiap-stay-v2-qa";
assert.match(docker(["port", container, "5432"]), /:57322(?:\r?\n|$)/);
const db = (sql) => docker(["exec", "-i", container, "psql", "-Xq", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], sql);
function checked(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message);
  return result.data;
}

try {
  const password = randomUUID() + "A7!qa";
  const clients = [];
  for (const role of ["admin", "customer"]) {
    const email = randomUUID() + "@phase4a.invalid";
    const { user } = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }), "Create QA actor");
    ids.push(user.id);
    if (role === "admin") db("insert into public.admin_users(user_id) values ('" + user.id + "');");
    const client = makeClient(anon);
    checked(await client.auth.signInWithPassword({ email, password }), "QA login");
    clients.push(client);
  }
  const [admin, customer] = clients;
  const file = new Blob(["%PDF-1.7 QA synthetic statement test"], { type: "application/pdf" });
  const path = ids[0] + "/" + randomUUID();
  checked(await admin.storage.from(bankBucket).upload(path, file), "Upload by Admin");
  evidencePath = path;
  checked(await admin.storage.from(bankBucket).info(path), "Read by Admin");
  assert.ok((await customer.storage.from(bankBucket).upload(ids[1] + "/" + randomUUID(), file)).error);
  assert.ok((await customer.storage.from(bankBucket).createSignedUrl(path, 60)).error);
  assert.ok((await makeClient(anon).storage.from(bankBucket).download(path)).error);
  assert.ok((await admin.storage.from(bankBucket).upload(path, file, { upsert: true })).error);
  checked(await admin.rpc("finance_bank_reconciliation", { p_limit: 5 }), "Finance read by Admin");
  assert.equal((await customer.rpc("finance_bank_reconciliation", { p_limit: 5 })).error?.code, "42501");
  console.log("PASS private Storage, Admin upload/read, no overwrites, customer and anonymous access denied");
} finally {
  const cleanup = [];
  if (evidencePath) cleanup.push(await service.storage.from(bankBucket).remove([evidencePath]));
  if (ids[0]) db("delete from public.admin_users where user_id='" + ids[0] + "';");
  for (const id of ids) cleanup.push(await service.auth.admin.deleteUser(id));
  if (cleanup.some((item) => item.error)) {
    console.error("QA fixture cleanup failed");
    process.exitCode = 1;
  }
}
