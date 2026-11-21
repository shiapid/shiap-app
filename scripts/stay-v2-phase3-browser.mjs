import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const api = "http://127.0.0.1:57321";
const app = "http://127.0.0.1:3275";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, api);
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(secret && key);
const service = createClient(api, secret, { auth: { persistSession: false } });

function verify(response) {
  assert(!response.error, response.error?.message);
  return response.data;
}
async function until(test, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const value = await test(); if (value) return value; } catch { /* Start-up or navigation in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(label);
}

async function user() {
  const email = "stay-phase3-" + randomUUID() + "@example.invalid";
  const password = randomUUID() + "Aa!";
  const { user } = verify(await service.auth.admin.createUser({ email, password, email_confirm: true }));
  const cookies = new Map();
  const client = createServerClient(api, key, {
    cookies: {
      getAll: () => [...cookies.values()],
      setAll: values => values.forEach(cookie => cookies.set(cookie.name, cookie)),
    },
  });
  verify(await client.auth.signInWithPassword({ email, password }));
  return { id: user.id, cookies: [...cookies.values()] };
}

const admin = await user();
const partner = await user();
let chrome, socket;
try {
  verify(await service.from("admin_users").insert({ user_id: admin.id }));
  const port = randomInt(9400, 9900);
  chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--no-first-run", "--remote-debugging-port=" + port,
    "--user-data-dir=" + resolve("tmp", "stay-v2-phase3-browser-" + randomUUID()), "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  const tab = await until(async () => (await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()).find(entry => entry.type === "page"), "Chrome unavailable");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const answer = JSON.parse(event.data);
    if (!pending.has(answer.id)) return;
    const { resolve, reject, timer } = pending.get(answer.id);
    pending.delete(answer.id);
    clearTimeout(timer);
    if (answer.error) reject(Error(answer.error.message)); else resolve(answer.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout " + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  async function checkPage(viewer, path, label, content) {
    await cdp("Network.clearBrowserCookies");
    await cdp("Network.setCookies", { cookies: viewer.cookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: app, path: "/" })) });
    await cdp("Page.navigate", { url: app + path });
    await until(async () => (await cdp("Runtime.evaluate", { returnByValue: true,
      expression: `location.pathname===${JSON.stringify(path)} && document.body.innerText.includes(${JSON.stringify(label)}) && document.body.innerText.includes(${JSON.stringify(content)})`,
    })).result.value, "Expected authorized page " + path);
    for (const width of [320, 375, 390, 430, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 800, mobile: width < 768, deviceScaleFactor: 1 });
      const result = await cdp("Runtime.evaluate", { returnByValue: true, expression: "Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth" });
      assert(result.result.value < 2, path + " overflows at " + width);
    }
  }
  await checkPage(admin, "/admin/stay/operations", "Operasional Stay Partner", "Daftarkan onboarding");
  await checkPage(partner, "/partner/stay/operations", "Operasional Stay Partner", "Belum ada properti Stay Partner");
  const unauth = await fetch(app + "/admin/stay/operations", { redirect: "manual" });
  assert.equal(unauth.status, 307);
  console.log("STAY_PARTNER_BROWSER_PASS admin, partner and guest 320/375/390/430/768/1024/1280px");
} finally {
  socket?.close();
  chrome?.kill();
  verify(await service.from("admin_users").delete().eq("user_id", admin.id));
  verify(await service.auth.admin.deleteUser(admin.id));
  verify(await service.auth.admin.deleteUser(partner.id));
}
