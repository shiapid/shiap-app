import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const app = process.env.PHASE4C_BROWSER_APP ?? "http://127.0.0.1:3278";
assert.match(app, /^http:\/\/127\.0\.0\.1:327[89]$/);
const qa = "http://127.0.0.1:57321";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, qa);
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = createClient(qa, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let adminId;
const id = "8dc30267-0e49-4ce8-84f5-e4b09ddbc82d";
const port = randomInt(9400, 9900);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--remote-debugging-port=" + port,
  "--user-data-dir=" + resolve("tmp", "refund-browser-" + randomUUID()), "about:blank",
], { stdio: "ignore", windowsHide: true });
let socket;

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { const value = await check(); if (value) return value; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(label);
}

try {
  const tab = await waitFor(async () => (await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()).find((entry) => entry.type === "page"), "Chrome did not start");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", (event) => {
    const answer = JSON.parse(event.data);
    if (answer.method === "Runtime.exceptionThrown") {
      console.error(answer.params.exceptionDetails.exception?.description ?? answer.params.exceptionDetails.text);
    }
    const call = pending.get(answer.id);
    if (!call) return;
    clearTimeout(call.timer);
    pending.delete(answer.id);
    if (answer.error) call.reject(new Error(answer.error.message)); else call.resolve(answer.result);
  });
  function cdp(method, params = {}) {
    const token = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(token); reject(new Error("Timeout " + method)); }, method === "Page.navigate" ? 60000 : 15000);
      pending.set(token, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: token, method, params }));
    });
  }
  async function body() {
    return (await cdp("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true })).result.value;
  }
  await cdp("Runtime.enable");
  const idStay = "stay";
  const idTrip = "trip";
  const date = "2030-01-06";
  const detail = {
    order: {
      id, order_number: "QA-REFUND-DETAIL", customer_name: "Synthetic QA", customer_whatsapp: "620000000000",
      total_amount: 907000, package_subtotal: 900000, service_fee_total: 7000, service_fee_snapshot: [],
      order_status: "confirmed", payment_status: "paid", payment_enabled: true, created_at: new Date().toISOString(),
      booking_items: [
        { id: idStay, service_type: "stay", service_name: "QA Stay masih aktif", date_start: date, date_end: "2030-01-07", quantity: 1, guests: 2 },
        { id: idTrip, service_type: "trip", service_name: "QA Trip dibatalkan", date_start: date, quantity: 1, guests: 2 },
      ],
    },
    proofs: [], settings: null, serverNow: new Date().toISOString(), guest: false, experience: null,
    unified: { payment_available: false, items: [
      { item_id: idStay, service: "stay", subtotal: 650000, fee: 3500, approval: "approved",
        fulfillment: "CONFIRMED", reservation: "reserved", review_open: false, cancelled_at: null },
      { item_id: idTrip, service: "trip", subtotal: 250000, fee: 3500, approval: "not_required",
        fulfillment: "CANCELLED", reservation: "released", review_open: false, cancelled_at: new Date().toISOString(),
        refund: { eligible: 250000, paid: 200000, requests: [
          { id: "request", status: "PAID", requested: 250000, approved: 200000, paid: 200000 },
        ] } },
    ] },
  };
  socket.addEventListener("message", (event) => {
    const entry = JSON.parse(event.data);
    if (entry.method !== "Fetch.requestPaused") return;
    const responseBody = Buffer.from(JSON.stringify(detail)).toString("base64");
    void cdp("Fetch.fulfillRequest", { requestId: entry.params.requestId, responseCode: 200, body: responseBody,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }] }).catch((error) => console.error(error.message));
  });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: app + "/api/bookings/" + id }] });

  async function checkWidths(label) {
    await cdp("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
    for (const width of [320, 375, 390, 430, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 800, mobile: width < 768, deviceScaleFactor: 1 });
      const measure = await cdp("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth))))", awaitPromise: true, returnByValue: true });
      if (measure.result.value >= 2) {
        const details = await cdp("Runtime.evaluate", {
          expression: `(() => {
            const viewport = document.documentElement.clientWidth;
            return { viewport, overflow: document.documentElement.scrollWidth - viewport,
              elements: [...document.querySelectorAll("body *")].flatMap((element) => {
                const rect = element.getBoundingClientRect();
                if (rect.right <= viewport + 2 && element.scrollWidth <= element.clientWidth + 2) return [];
                return [[element.tagName, element.getAttribute("class")?.slice(0, 100), Math.round(rect.right), element.scrollWidth, element.clientWidth, element.parentElement?.tagName]];
              }).slice(0, 35),
            };
          })()`, returnByValue: true,
        });
        throw new Error(label + " overflows at " + width + "px: " + JSON.stringify(details.result.value));
      }
    }
  }

  await cdp("Page.navigate", { url: app + "/my-booking/" + id });
  await waitFor(async () => (await body()).includes("QA Trip dibatalkan"), "Customer refund detail failed to render");
  const customer = await body();
  assert.match(customer, /QA Stay masih aktif/);
  assert.match(customer, /Refund dibayar/);
  assert.match(customer, /200.000/);
  await checkWidths("Customer refund");

  const credentials = { email: randomUUID() + "@refund-mobile.invalid", password: randomUUID() + "A7!" };
  const signup = await service.auth.admin.createUser({ ...credentials, email_confirm: true });
  assert.ifError(signup.error);
  adminId = signup.data.user.id;
  assert.ifError((await service.from("admin_users").insert({ user_id: adminId })).error);
  const cookies = new Map();
  const session = createServerClient(qa, key, {
    cookies: { getAll: () => [...cookies.values()], setAll: (entries) => entries.forEach((cookie) => cookies.set(cookie.name, cookie)) },
  });
  assert.ifError((await session.auth.signInWithPassword(credentials)).error);
  assert.ok(cookies.size > 0, "QA Auth did not return session cookies");
  const cookieHeader = [...cookies.values()].map(({ name, value }) => name + "=" + value).join("; ");
  const finance = await fetch(app + "/admin/finance", {
    headers: { Cookie: cookieHeader }, redirect: "manual", signal: AbortSignal.timeout(120000),
  });
  assert.equal(finance.status, 200, "Authorized Finance HTTP status, redirect: " + finance.headers.get("location"));
  await finance.arrayBuffer();
  await cdp("Network.enable");
  await cdp("Network.setCookies", { cookies: [...cookies.values()].map(({ name, value }) => ({ name, value, url: app, path: "/" })) });
  await cdp("Page.navigate", { url: app + "/admin/finance" });
  try {
    await waitFor(async () => (await body()).includes("Refund per layanan"), "Authorized Finance refund panel did not render");
  } catch (error) {
    console.error((await body())?.slice(0, 1100));
    throw error;
  }
  const admin = await body();
  assert.match(admin, /Liabilitas persetujuan dan transfer/);
  assert.doesNotMatch(admin, /Antrean refund belum dapat dimuat|Laporan keuangan tidak lengkap/);
  await checkWidths("Admin Finance");
  console.log("PASS customer refund fixture and authenticated Finance queue at 320/375/390/430/768/1024/1280px");
} finally {
  socket?.close();
  chrome.kill();
  if (adminId) {
    assert.ifError((await service.from("admin_users").delete().eq("user_id", adminId)).error);
    assert.ifError((await service.auth.admin.deleteUser(adminId)).error);
  }
}
