import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.development.local");
let envText;

try {
  envText = readFileSync(envPath, "utf8");
} catch {
  console.error("Local Supabase config missing: create .env.development.local first.");
  process.exit(1);
}

function readValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${name}=`));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") ?? "";
}

const url = readValue("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = readValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const localUrl = /^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(url);
const unsafeKey = /^(sb_secret_|service_role)/i.test(publishableKey);

if (!localUrl || !publishableKey || unsafeKey) {
  console.error("Refusing to start local dev: expected local Supabase URL and a publishable key in .env.development.local.");
  process.exit(1);
}

console.log("Supabase target verified: local development stack.");
