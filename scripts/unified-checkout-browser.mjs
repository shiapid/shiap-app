import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const app = process.env.PHASE4B_BROWSER_APP ?? "http://127.0.0.1:3276";
assert.match(app, /^http:\/\/127\.0\.0\.1:327[67]$/);
const id = "8dc30267-0e49-4ce8-84f5-e4b09ddbc82d";
const port = randomInt(9400, 9900);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--remote-debugging-port=" + port,
  "--user-data-dir=" + resolve("tmp", "unified-browser-" + randomUUID()), "about:blank",
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
      const timer = setTimeout(() => { pending.delete(token); reject(new Error("Timeout " + method)); }, 15000);
      pending.set(token, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: token, method, params }));
    });
  }
  async function body() {
    return (await cdp("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true })).result.value;
  }
  await cdp("Runtime.enable");
  const services = ["stay", "trip", "experience"];
  const date = new Date(Date.now() + 86400000).toISOString();
  function detail(ready) {
    return {
      order: {
        id, order_number: "QA-UNIFIED-DETAIL", customer_name: "Synthetic QA", customer_whatsapp: "620000000000",
        total_amount: 926000, package_subtotal: 915500, service_fee_total: 10500, service_fee_snapshot: [],
        order_status: "pending_confirmation", payment_status: "unpaid", payment_enabled: ready,
        inventory_hold_expires_at: date, created_at: new Date().toISOString(),
        booking_items: services.map((service) => ({
          id: service, service_type: service === "experience" ? "activity" : service, service_name: "QA " + service,
          date_start: date.slice(0, 10), date_end: null, quantity: 1, guests: 2,
        })),
      },
      proofs: [], settings: ready ? { bank_name: "Bank Sintetis QA", account_number: "00000000",
        account_name: "QA Only", instructions: "", is_active: true } : null,
      unified: { payment_available: ready, items: services.map((service, index) => ({
        item_id: service, service: service, subtotal: [300000, 215500, 400000][index], fee: 3500,
        approval: ready || service === "trip" ? "approved" : "pending", fulfillment: "PENDING",
        reservation: "held", review_open: false,
      })) },
      serverNow: new Date().toISOString(), supportPhone: null, guest: false, canClaim: false,
    };
  }

  // Render the real Next.js page with synthetic API responses. Database and
  // authentication behavior are covered separately by SQL/RLS integration tests.
  let mockedReady = false;
  socket.addEventListener("message", (event) => {
    const entry = JSON.parse(event.data);
    if (entry.method !== "Fetch.requestPaused") return;
    const responseBody = Buffer.from(JSON.stringify(detail(mockedReady))).toString("base64");
    void cdp("Fetch.fulfillRequest", {
      requestId: entry.params.requestId, responseCode: 200, body: responseBody,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    }).catch((error) => console.error(error.message));
  });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: app + "/api/bookings/" + id }] });
  for (const ready of [false, true]) {
    mockedReady = ready;
    await cdp("Page.navigate", { url: app + "/my-booking/" + id + (ready ? "?ready=1" : "") });
    const expected = ready ? "Bank Sintetis QA" : "Menunggu persetujuan";
    try {
      await waitFor(async () => (await body()).includes(expected), "Unified detail failed to render " + expected);
    } catch (error) {
      console.error((await body())?.slice(0, 1300));
      throw error;
    }
    const text = await body();
    assert.match(text, /QA stay/);
    assert.match(text, /QA trip/);
    assert.match(text, /QA experience/);
    assert.match(text, /926.000/);
    if (!ready) assert.doesNotMatch(text, /Bank Sintetis QA/);
    else assert.match(text, /Salin nomor rekening|Unggah bukti/i);
    await checkWidths("Booking detail");
  }
  async function checkWidths(label) {
    for (const width of [320, 375, 390, 430, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 800, mobile: width < 768, deviceScaleFactor: 1 });
      const measure = await cdp("Runtime.evaluate", { expression: "Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-document.documentElement.clientWidth", returnByValue: true });
      assert.ok(measure.result.value < 2, label + " overflows at " + width);
    }
  }
  const cart = [
    { id: "stay", serviceType: "stay", serviceName: "QA Stay Partner", partnerStay: true, propertyId: id, roomTypeId: id,
      unitPrice: 300000, priceStatus: "quoted", quantity: 1, guests: 2, dateStart: date.slice(0, 10), dateEnd: date.slice(0, 10) },
    { id: "trip", serviceType: "trip", serviceName: "QA Scheduled Trip", tripId: id, departureId: id,
      unitPrice: 150000, priceStatus: "quoted", quantity: 1, guests: 2, dateStart: date.slice(0, 10) },
  ];
  await cdp("Runtime.evaluate", { expression: "localStorage.setItem('shiap_universal_booking_v1'," + JSON.stringify(JSON.stringify(cart)) + ")" });
  await cdp("Page.navigate", { url: app + "/booking" });
  await waitFor(async () => (await body()).includes("Tambahkan Experience ke pesanan"), "Mixed cart entry was not available");
  const cartText = await body();
  assert.match(cartText, /QA Stay Partner/);
  assert.match(cartText, /QA Scheduled Trip/);
  await checkWidths("Booking cart");
  console.log("PASS mixed cart, booking detail, approval and transfer states at 320/375/390/430/768/1024/1280px");
} finally {
  socket?.close();
  chrome.kill();
}
