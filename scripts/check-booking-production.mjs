import { readFile, readdir, realpath, readlink } from "node:fs/promises";

const projectRef = "sbomjhwmjmqteybsegdl";
const variables = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "NODE_ENV", "NEXT_PUBLIC_SHIAP_ENVIRONMENT", "NEXT_PUBLIC_SHIAP_DEMO_MODE"];

export async function checkBookingConfiguration(env, fetcher = fetch) {
  const presence = Object.fromEntries(variables.map((name) => [name, Boolean(env[name]?.trim())]));
  const result = { presence, projectMatch: false, ok: false, code: "MISSING_CONFIGURATION" };
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!presence.NEXT_PUBLIC_SUPABASE_URL) return result;
  let url;
  try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL); }
  catch { return { ...result, code: "INVALID_URL" }; }
  result.projectMatch = url.origin === "https://" + projectRef + ".supabase.co";
  if (!result.projectMatch) return { ...result, code: "PROJECT_MISMATCH" };
  if (!presence.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !key?.trim()) return result;
  if (!key.startsWith("sb_secret_")) {
    try {
      const claim = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
      if (claim.role !== "service_role") return { ...result, code: "INVALID_SERVER_KEY_ROLE" };
      if (claim.ref !== projectRef) return { ...result, code: "SERVER_KEY_PROJECT_MISMATCH" };
    } catch { return { ...result, code: "INVALID_SERVER_KEY" }; }
  }
  try {
    // A zero-row read validates the actual credential against the canonical
    // project and the private Booking V2 schema without creating records.
    const response = await fetcher(url.origin + "/rest/v1/booking_guest_sessions?select=id&limit=0", {
      headers: { apikey: key, Authorization: "Bearer " + key }, signal: AbortSignal.timeout(12000),
    });
    const status = response.status;
    await response.body?.cancel();
    if (status === 200) return { ...result, ok: true, code: "BOOKING_CONFIGURATION_OK" };
    const code = status === 401 ? "INVALID_CREDENTIALS" : status === 403 ? "DATABASE_PERMISSION_DENIED" : status === 404 ? "BOOKING_SCHEMA_MISSING" : "SUPABASE_UNAVAILABLE";
    return { ...result, code, status };
  } catch { return { ...result, code: "SUPABASE_CONNECTION_FAILURE" }; }
}

export async function inspectPassenger() {
  const root = "/home/shiapsit/shiap-app";
  const results = [];
  for (const pid of (await readdir("/proc")).filter((name) => /^\d+$/.test(name))) {
    let env;
    try {
      const cwd = await realpath("/proc/" + pid + "/cwd");
      const exe = await readlink("/proc/" + pid + "/exe");
      if (!(cwd === root || cwd.startsWith(root + "/")) || !exe.includes("node")) continue;
      env = Object.fromEntries((await readFile("/proc/" + pid + "/environ", "utf8")).split("\0").filter(Boolean).map((item) => {
        const separator = item.indexOf("=");
        return [item.slice(0, separator), item.slice(separator + 1)];
      }));
    } catch { continue; }
    results.push(await checkBookingConfiguration(env));
  }
  return results;
}

if (process.argv.includes("--inspect-passenger")) {
  try {
    const results = await inspectPassenger();
    for (const result of results) console.log(JSON.stringify(result));
    if (!results.length || results.some((result) => !result.ok)) {
      console.log("BOOKING_PREFLIGHT_FAILED");
      process.exitCode = 1;
    } else {
      const response = await fetch("https://app.shiap.id/api/bookings", { signal: AbortSignal.timeout(15000), headers: { "Cache-Control": "no-cache" } });
      const body = response.ok ? await response.json() : null;
      if (!response.ok || !Array.isArray(body?.orders) || body.orders.length !== 0 || body.guest !== true) {
        console.log("BOOKING_API_PREFLIGHT_FAILED HTTP=" + response.status);
        process.exitCode = 1;
      } else console.log("BOOKING_PRODUCTION_PREFLIGHT_OK");
    }
  } catch {
    console.log("BOOKING_PREFLIGHT_RUNTIME_OR_CONNECTION_FAILURE");
    process.exitCode = 1;
  }
}
