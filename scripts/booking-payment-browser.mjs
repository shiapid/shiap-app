// Run with server-only local Supabase keys injected in memory. Never target Cloud.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
assert.equal(process.env.NEXT_PUBLIC_SHIAP_DEMO_MODE, "false");
const base = "http://127.0.0.1:3231";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fixture = { rental: randomUUID(), activity: randomUUID(), user: null, other: null };
const sql = (text) => {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_shiap-app", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
};
const bank = await admin.from("payment_settings").select("bank_name,account_name,account_number,instructions,is_active").eq("id", true).single();
if (bank.error) throw bank.error;
const originalFee = await admin.from("service_fee_settings").select("enabled,mode,percentage_bps,fixed_amount,max_percentage_bps").eq("category", "rental").single();
if (originalFee.error) throw originalFee.error;
let feeAdmin = false;
let server;
let chrome;
let socket;
let sequence = 0;
let checkoutRequest;
let bookingId;
let guestId;
const requests = new Map();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch {}
    await wait(150);
  }
  throw new Error(label);
}
function cdp(method, params = {}) {
  const id = ++sequence;
  const response = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method, params }));
  return response;
}
async function evaluate(fn, ...args) {
  const result = await cdp("Runtime.evaluate", { expression: "(" + fn.toString() + ")(..." + JSON.stringify(args) + ")", returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function click(label) {
  await until(()=>evaluate(label=>{const b=[...document.querySelectorAll("button")].find(item=>item.getAttribute("aria-label")===label||item.textContent.trim()===label);return b&&Object.keys(b).some(k=>k.startsWith('__reactProps$'));},label),'Button hydration missing: '+label);
  await evaluate(label=>{const b=[...document.querySelectorAll("button")].find(item=>item.getAttribute("aria-label")===label||item.textContent.trim()===label);b.scrollIntoView({block:"center",behavior:"instant"});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},label);
  const target=await evaluate(label=>{const b=[...document.querySelectorAll("button")].find(item=>item.getAttribute("aria-label")===label||item.textContent.trim()===label),box=b.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);return {x,y,ready:!!hit&&(hit===b||b.contains(hit)),hit:hit?.tagName};},label);
  assert.ok(target.ready,'Click target obscured: '+label+' hit='+target.hit);
  await cdp("Input.dispatchMouseEvent",{type:"mouseMoved",x:target.x,y:target.y});
  await cdp("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,x:target.x,y:target.y});
  await cdp("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,x:target.x,y:target.y});
}
async function field(selector, value) {
  await evaluate((selector, value) => {
    const input = document.querySelector(selector);
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
}
async function api(url, options) {
  return evaluate(async (url, options) => {
    const response = await fetch(url, options);
    return { status: response.status, body: await response.json() };
  }, url, options);
}
async function setViewport(width) {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 740 : 900, deviceScaleFactor: 1, mobile: width < 768 });
}
async function navigate(route, selector) {
  await cdp("Page.navigate", { url: base + route });
  await until(() => evaluate((selector) => Boolean(document.querySelector(selector)), selector), "Page unavailable: " + route);
}

try {
  sql(`insert into public.shiap_experiences(id,experience_type,catalog_category,title,slug,base_price,price_basis,status,location) values
    ('${fixture.rental}','activity','rental','QA V2 Rental','qa-${fixture.rental}',100000,'per_unit','published','QA local'),
    ('${fixture.activity}','activity','activity','QA V2 Activity','qa-${fixture.activity}',150000,'per_unit','published','QA local');`);
  const enabled = await admin.from("payment_settings").update({ is_active: true, bank_name: "QA LOCAL", account_name: "QA SHIAP", account_number: "QA-" + randomUUID(), instructions: "Isolated local regression" }).eq("id", true);
  if (enabled.error) throw enabled.error;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3231"], { stdio: ["ignore", "inherit", "inherit"] });
  chrome = spawn(process.env.SHIAP_QA_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-mode", "--disable-background-networking", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9341", "--user-data-dir=" + path.join(process.cwd(), ".next", "booking-payment-qa-" + Date.now()), "about:blank"], { stdio: "ignore" });
  await until(async () => (await fetch(base + "/booking")).ok, "Local Next server did not start");
  const publicList = await fetch(base + "/api/bookings");
  assert.equal(publicList.status, 200);
  assert.deepEqual(await publicList.json(), { orders: [], guest: true });
  const page = await until(async () => (await (await fetch("http://127.0.0.1:9341/json/list")).json()).find((item) => item.type === "page"), "Chrome unavailable");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Network.requestWillBeSent" && message.params.request.url === base + "/api/bookings" && message.params.request.method === "POST") checkoutRequest = message.params.request;
    const pending = requests.get(message.id);
    if (!pending) return;
    requests.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
  });
  await cdp("Page.enable");
  // Each local run represents a different proxy client. Preserve production
  // throttling while preventing previous QA runs sharing a loopback IP bucket.
  const qaAddress="2001:db8:"+randomUUID().replaceAll("-","").slice(0,4)+":"+randomUUID().replaceAll("-","").slice(0,4)+"::1";
  await cdp("Page.addScriptToEvaluateOnNewDocument",{source:`const qaFetch=window.fetch.bind(window);window.fetch=(input,init={})=>{init=init || {};const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin===location.origin && url.pathname.startsWith('/api/')){const headers=new Headers(init.headers || (input instanceof Request?input.headers:undefined));headers.set('X-Real-IP',${JSON.stringify(qaAddress)});return qaFetch(input,{...init,headers});}return qaFetch(input,init);};`});
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await setViewport(390);
  await navigate("/booking", "#booking-service-form button:not(:disabled)");
  const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  for (const [name, id] of [["Rental", fixture.rental], ["Wahana", fixture.activity]]) {
    await click(name);
    await field("#booking-service-form select", id);
    await field('#booking-service-form input[type="date"]', date);
    await click("Tambahkan ke keranjang");
  }
  await until(() => evaluate(() => document.querySelectorAll('[aria-labelledby="booking-cart-title"] li').length === 2), "Multi-service cart failed");
  await field('input[placeholder="Nama pemesan"]', "Guest QA Customer");
  await field('input[placeholder="08xxxxxxxxxx"]', "081234567890");
  await until(() => evaluate(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Kirim permintaan booking" && !button.disabled)), "Server fee quote did not become available");
  await click("Kirim permintaan booking");
  bookingId = await until(() => evaluate(() => location.pathname.startsWith("/my-booking/") && document.body.innerText.includes("Full Payment 100%") ? location.pathname.split("/").pop() : null), "Guest booking did not redirect to payment");
  assert.ok(checkoutRequest?.postData);
  assert.equal(await evaluate(() => sessionStorage.getItem("shiap_checkout:booking")), null);
  const key = Object.entries(checkoutRequest.headers).find(([name]) => name.toLowerCase() === "idempotency-key")[1];
  const retry = await api("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: checkoutRequest.postData });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, bookingId);
  const details = await api("/api/bookings/" + bookingId);
  const guestList = await api("/api/bookings");
  assert.equal(guestList.status, 200);
  assert.ok(guestList.body.orders.some((order) => order.id === bookingId));
  assert.equal(details.body.order.booking_items.length, 2);
  assert.equal(details.body.order.total_amount, 250000);
  guestId = details.body.order.guest_session_id;
  assert.ok(guestId);
  assert.equal(details.body.order.user_id, null);
  assert.ok(await evaluate(() => !document.cookie.includes("shiap_booking")));
  assert.equal((await fetch(base + "/api/bookings/" + bookingId)).status, 404);
  assert.equal((await api("/api/bookings/" + randomUUID())).status, 404);
  const evil = await fetch(base + "/api/bookings/session", { method: "POST", headers: { Origin: "https://elsewhere.invalid" } });
  assert.equal(evil.status, 403);

  for (const width of [320, 375, 390, 430, 1280]) {
    await setViewport(width);
    await wait(100);
    assert.ok(await evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
    await evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await wait(100);
    if (width < 768) assert.ok(await evaluate(() => document.querySelector("main").lastElementChild.getBoundingClientRect().bottom <= document.querySelector('nav[aria-label="Navigasi utama"]').getBoundingClientRect().top));
    console.log(width + "px payment detail: no overflow and bottom navigation clearance passed");
  }
  await cdp("Page.reload");
  await until(() => evaluate(() => document.body.innerText.includes("QA LOCAL")), "Bank details did not survive reload");
  const evidence = await sharp({ create: { width: 80, height: 100, channels: 3, background: "#1265D8" } }).png().toBuffer();
  await evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], "qa-proof.png", { type: "image/png" }));
    const input = document.querySelector('input[type="file"]');
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, evidence.toString("base64"));
  await until(() => evaluate(() => document.body.innerText.includes("Menunggu Verifikasi")), "Proof did not enter verification");
  const submitted = await api("/api/bookings/" + bookingId);
  assert.equal(submitted.body.order.payment_status, "pending");
  assert.equal(submitted.body.proofs.length, 1);
  const repeatedProof = await evaluate(async (id, bytes) => {
    const response = await fetch("/api/bookings/" + id + "/proof", { method: "PUT", headers: { "Content-Type": "image/png", "X-File-Name": "qa-proof.png" }, body: Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)) });
    return { status: response.status, data: await response.json() };
  }, bookingId, evidence.toString("base64"));
  assert.equal(repeatedProof.status, 200);
  assert.equal(repeatedProof.data.id, submitted.body.proofs[0].id);
  const finance = await admin.from("finance_transaction_entries").select("id").eq("booking_id", bookingId).eq("entry_type", "payment");
  assert.equal(finance.data.length, 0);
  const invalidFile = await api('/api/bookings/' + bookingId + '/proof', {method:'PUT',headers:{'Content-Type':'image/png'},body:'invalid'});
  assert.equal(invalidFile.status,415);
  const directProof = await fetch(base + "/api/bookings/" + bookingId + "/proof?proof=" + submitted.body.proofs[0].id, { redirect: "manual" });
  assert.equal(directProof.status, 404);
  const listed = await api("/api/bookings");
  assert.equal(listed.body.orders.length, 1);
  assert.equal(listed.body.orders[0].id, bookingId);
  await navigate("/my-booking", "main ul li a");
  assert.ok(await evaluate(() => document.body.innerText.includes("Menunggu Verifikasi")));
  await navigate("/booking", "#booking-service-form button:not(:disabled)");
  const iconCount = await evaluate(() => document.querySelectorAll('[aria-label="Pilih layanan"] button svg').length);
  assert.equal(iconCount, 5);
  for (const width of [320, 375, 390, 430, 1280]) {
    await setViewport(width);
    await wait(100);
    assert.ok(await evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
    assert.ok(await evaluate(() => [...document.querySelectorAll('[aria-label="Pilih layanan"] button')].every((button) => button.getBoundingClientRect().height >= 44)));
  }
  await navigate("/explore", '[aria-label="Kategori layanan"] button');
  await until(() => evaluate(() => document.querySelectorAll('[aria-label="Kategori layanan"] button svg').length === 6), "Explore category icons missing");
  for (const width of [320, 375, 390, 430, 1280]) {
    await setViewport(width);
    await wait(100);
    assert.ok(await evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
    const targets = await evaluate(() => [...document.querySelectorAll('[aria-label="Kategori layanan"] button')].map((button) => ({ text: button.textContent, height: button.getBoundingClientRect().height, minHeight: getComputedStyle(button).minHeight })));
    assert.ok(targets.every((target) => target.height >= 44), JSON.stringify({ width, targets }));
  }
  await setViewport(390);
  console.log("Guest checkout, replay, refresh persistence, configured bank details, proof verification and icons passed");

  const user = await admin.auth.admin.createUser({ email: "qa-claim-" + randomUUID() + "@example.test", password: randomUUID(), email_confirm: true });
  if (user.error) throw user.error;
  fixture.user = user.data.user.id;
  const { createServerClient } = await import("@supabase/ssr");
  const jar = new Map();
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll() { return [...jar.values()]; }, setAll(items) { for (const item of items) jar.set(item.name, item); } } });
  const token = await admin.auth.admin.generateLink({ type: "magiclink", email: user.data.user.email });
  if (token.error) throw token.error;
  const verified = await auth.auth.verifyOtp({ token_hash: token.data.properties.hashed_token, type: "magiclink" });
  if (verified.error) throw verified.error;
  // The verified account alone cannot access the guest order.
  const ownerCookies = [...jar.values()].map(({ name, value }) => name + "=" + value).join("; ");
  assert.equal((await fetch(base + "/api/bookings/" + bookingId, { headers: { Cookie: ownerCookies } })).status, 404);
  assert.equal((await fetch(base + "/api/bookings/" + bookingId + "/proof?proof=" + submitted.body.proofs[0].id, { headers: { Cookie: ownerCookies }, redirect: "manual" })).status, 404);
  for (const { name, value } of jar.values()) await cdp("Network.setCookie", { name, value, url: base, path: "/", sameSite: "Lax" });
  const claimed = await api("/api/bookings/" + bookingId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "claim" }) });
  assert.equal(claimed.status, 200);
  const owned = await fetch(base + "/api/bookings/" + bookingId, { headers: { Cookie: ownerCookies } });
  assert.equal(owned.status, 200);
  const claimedData = await owned.json();
  assert.equal(claimedData.order.user_id, fixture.user);
  assert.equal(claimedData.order.guest_session_id, null);
  const download = await fetch(base + "/api/bookings/" + bookingId + "/proof?proof=" + submitted.body.proofs[0].id, { headers: { Cookie: ownerCookies }, redirect: "manual" });
  assert.equal(download.status, 303);
  const downloaded = await fetch(download.headers.get("location"));
  assert.equal(downloaded.status, 200);
  assert.equal((await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata()).format, "webp");
  assert.equal((await api("/api/bookings/session", { method: "DELETE" })).status, 200);
  const guestGrant = await admin.from("booking_guest_sessions").select("revoked_at").eq("id", guestId).single();
  assert.ok(guestGrant.data.revoked_at);
  const accountBooking = await api('/api/bookings', {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:checkoutRequest.postData});
  assert.equal(accountBooking.status,200);
  const accountDetails = await api('/api/bookings/' + accountBooking.body.id);
  assert.equal(accountDetails.body.order.user_id,fixture.user);
  console.log("Verified account claim, authenticated checkout, account isolation and guest revocation passed");

  sql(`insert into public.admin_users(user_id) values('${fixture.user}');`);
  feeAdmin = true;
  await navigate("/admin/settings", '[data-fee-category="rental"]');
  const formSelector = '[data-fee-category="rental"]';
  await evaluate((selector) => document.querySelector(selector + ' input[type="checkbox"]').click(), formSelector);
  await field(formSelector + " select", "fixed");
  await field(formSelector + ' input[name="fixed_amount"]', "500000");
  await field(formSelector + ' input[name="preview_subtotal"]', "100000");
  await until(() => evaluate((selector) => document.querySelector(selector).textContent.includes("dibatasi") && !document.querySelector(selector + " button").disabled, formSelector), "Admin cap preview unavailable");
  await evaluate((selector) => document.querySelector(selector + " button").click(), formSelector);
  await until(() => evaluate((selector) => document.querySelector(selector).textContent.includes("Tarif tersimpan"), formSelector), "Admin fee save failed");
  for (const width of [320,375,390,430,1280]) {
    await setViewport(width);
    assert.ok(await evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth), "Admin fee UI overflow at " + width);
  }
  const feeSample = await api('/api/bookings/fee-quote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subtotals:[{category:'rental',subtotal:100000},{category:'activity',subtotal:150000}]})});
  assert.equal(feeSample.body.fee,10000);
  assert.equal(feeSample.body.total,260000);
  const withFee = await api('/api/bookings', {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:checkoutRequest.postData});
  assert.equal(withFee.status,200);
  const feeDetails = await api('/api/bookings/' + withFee.body.id);
  assert.equal(feeDetails.body.order.service_fee_total,10000);
  assert.equal(feeDetails.body.order.total_amount,260000);
  await navigate('/my-booking/' + withFee.body.id, '#payment-title');
  assert.ok(await evaluate(() => document.body.innerText.includes('Biaya Layanan SHIAP')));
  await navigate('/admin/settings', formSelector);
  await evaluate((selector) => document.querySelector(selector + ' input[type="checkbox"]').click(), formSelector);
  await until(() => evaluate((selector) => !document.querySelector(selector + " button").disabled, formSelector), 'Disabled preview unavailable');
  await evaluate((selector) => document.querySelector(selector + " button").click(), formSelector);
  await until(() => evaluate((selector) => document.querySelector(selector).textContent.includes("Tarif tersimpan"), formSelector), 'Disable fee failed');
  const preservedFee = await api('/api/bookings/' + withFee.body.id);
  assert.equal(preservedFee.body.order.service_fee_total,10000);
  console.log('Admin fixed-fee preview, cap, save, disable, checkout snapshot and mobile layouts passed');
  const cronDenied = await fetch(base + '/api/internal/notifications/dispatch', {method:'POST'});
  assert.equal(cronDenied.status,401);
  const notifications = await api('/api/admin/notifications');
  assert.equal(notifications.status,200);
  const createdEvent = notifications.body.events.find((event)=>event.booking_id===bookingId && event.event_type==='booking_created');
  assert.ok(createdEvent);
  assert.equal(notifications.body.events.filter((event)=>event.booking_id===bookingId && event.event_type==='booking_created').length,1);
  assert.ok(notifications.body.events.some((event)=>event.booking_id===bookingId && event.event_type==='proof_received'));
  assert.equal((await api('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:createdEvent.id})})).status,200);
  await navigate('/admin/notifications','[data-notification-id]');
  await cdp('Page.reload');
  await until(()=>evaluate((id)=>{const row=document.querySelector('[data-notification-id="'+id+'"]');return row && !row.innerText.includes('Baru');},createdEvent.id),'Read state did not survive reload');
  for(const width of [320,375,390,430,1280]) {
    await setViewport(width);
    assert.ok(await evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth),'Notification UI overflow at '+width);
  }
  const settings = await api('/api/admin/notifications/settings');
  assert.equal(settings.body.settings.email_enabled,false);
  const unverified = await api('/api/admin/notifications/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...settings.body.settings,email_enabled:true})});
  assert.equal(unverified.status,400);
  const falsePaid = await api('/api/admin/bookings/'+withFee.body.id+'/whatsapp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare',template:'payment_verified'})});
  assert.equal(falsePaid.status,400);
  await setViewport(320);
  const waTemplates = await api('/api/admin/bookings/'+withFee.body.id+'/whatsapp');
  assert.equal(waTemplates.status,200);
  assert.ok(waTemplates.body.templates.some((template)=>template.id==='booking_created'));
  await navigate('/admin/bookings/'+withFee.body.id,'button[aria-label="WhatsApp pelanggan"]');
  await click('WhatsApp pelanggan');
  await until(()=>evaluate(()=>Boolean(document.querySelector('dialog[open] select option[value="booking_created"]'))),'WhatsApp templates unavailable');
  await click('Buat preview');
  await until(()=>evaluate(()=>Boolean(document.querySelector('dialog[open] textarea')?.value.includes('SH-'))),'WhatsApp preview unavailable');
  assert.ok(await evaluate(()=>document.querySelector('dialog[open] a').href.startsWith('https://wa.me/6281234567890?text=')));
  assert.ok(await evaluate(()=>{const box=document.querySelector('dialog[open]').getBoundingClientRect();return box.x>=0 && box.right<=innerWidth;}));
  // Exercise the click handler while preventing navigation to an external app.
  await evaluate(()=>{const link=document.querySelector('dialog[open] a');link.addEventListener('click',(event)=>event.preventDefault(),{once:true});link.click();});
  await until(()=>evaluate(()=>document.querySelector('dialog[open]').innerText.includes('Belum dikonfirmasi terkirim')),'WhatsApp opened audit failed');
  const waAudit = await admin.from('notification_whatsapp_activity').select('state,operator_id,manually_confirmed_at').eq('booking_id',withFee.body.id).single();
  assert.equal(waAudit.data.state,'opened');
  assert.equal(waAudit.data.operator_id,fixture.user);
  assert.equal(waAudit.data.manually_confirmed_at,null);
  await click('Tutup WhatsApp');
  console.log('Notification deduplication, read persistence, mobile layouts, cron authentication, email disabled and manual WhatsApp audit passed');
} catch(error) {
  try{console.log('BROWSER_FAILURE_STATE '+JSON.stringify(await evaluate(()=>({path:location.pathname,dialogs:[...document.querySelectorAll('dialog')].map((item)=>({open:item.open,options:item.querySelectorAll('option').length})),whatsappButtons:document.querySelectorAll('button[aria-label="WhatsApp pelanggan"]').length,alerts:[...document.querySelectorAll('[role="alert"],[role="status"]')].map((item)=>item.textContent)}))));}catch{}
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id: ++sequence, method: "Browser.close" })); socket.close(); }
  else chrome?.kill();
  server?.kill();
  const fixtureItems = await admin.from('booking_items').select('booking_id').in('service_catalog_id',[fixture.rental,fixture.activity]);
  for(const orderId of new Set((fixtureItems.data || []).map(item=>item.booking_id))) {
    const records=await admin.from('booking_payment_records').select('storage_path').eq('booking_id',orderId);
    if(records.data?.length) await admin.storage.from('booking-payment-proofs').remove(records.data.map(item=>item.storage_path));
    sql("delete from public.booking_orders where id='"+orderId+"';");
  }
  sql(`delete from public.shiap_experiences where id in ('${fixture.rental}','${fixture.activity}');`);
  if (guestId) await admin.from("booking_guest_sessions").delete().eq("id", guestId);
  if (feeAdmin) {
    const value = originalFee.data;
    sql(`begin; select set_config('request.jwt.claim.sub','${fixture.user}',true);
      update public.service_fee_settings set enabled=${value.enabled},mode='${value.mode}',percentage_bps=${value.percentage_bps},fixed_amount=${value.fixed_amount},max_percentage_bps=${value.max_percentage_bps} where category='rental';
      delete from public.service_fee_settings_audit where actor_id='${fixture.user}'; commit;`);
  }
  if (fixture.user) await admin.auth.admin.deleteUser(fixture.user);
  const restored = await admin.from("payment_settings").update(bank.data).eq("id", true);
  if (restored.error) throw restored.error;
}
