import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsApp, whatsappUrl, renderWhatsApp, renderEmail, validEmail } from "../src/lib/notifications/messages.ts";
import { resendProvider } from "../src/lib/notifications/provider.ts";
import { validCronAuthorization } from "../src/lib/notifications/authorization.ts";

const context={booking:{id:"00000000-0000-4000-8000-000000000001",order_number:"LOCAL-QA",customer_name:'<script>alert("x")</script>',customer_whatsapp:"081234567890",customer_email:"qa@example.invalid",user_id:null,payment_enabled:true,total_amount:102000,inventory_hold_expires_at:"2026-11-18T01:15:00Z",booking_items:[{id:"item",service_name:"Local & test",date_start:"2026-11-19",date_end:null}]},bank:"",location:""};
test("Indonesian WhatsApp normalization rejects invalid recipients and encodes messages",()=>{
  for(const phone of ["081234567890","+62 812-3456-7890","6281234567890","81234567890","006281234567890"])assert.equal(normalizeWhatsApp(phone),"6281234567890");
  for(const phone of ["0000000000","+1234567890","0812<script>","62812"])assert.equal(normalizeWhatsApp(phone),null);
  assert.equal(whatsappUrl("081234567890","a&b\n"),"https://wa.me/6281234567890?text=a%26b%0A");
  assert.equal(whatsappUrl("invalid","text"),null);
  assert.ok(renderWhatsApp("{{booking_code}}: {{total}} {{access_instructions}}",context).includes("perangkat saat memesan"));
});
test("email templates escape customer input and preserve guest authorization and pending proof semantics",()=>{
  const email=renderEmail("proof_received",context,"customer");
  assert.ok(email.html.includes("&lt;script&gt;"));assert.ok(!email.html.includes('<script>'));
  assert.ok(email.text.includes("belum berarti pembayaran berhasil atau lunas"));
  assert.ok(email.text.includes("tidak memberikan akses di perangkat lain"));
  assert.ok(!email.text.includes("secret="));assert.ok(!email.html.includes("payment-proof"));
  assert.equal(validEmail("x\ny@example.invalid"),false);assert.equal(validEmail("qa@example.invalid"),true);
});
test("provider retry reuses the exact same payload and idempotency key without leaking errors",async()=>{
  const requests=[];
  const provider=resendProvider("fixture-secret",async(_url,options)=>{
    requests.push(options);
    return requests.length===1?new Response('sensitive provider error',{status:503}):Response.json({id:"local-provider-reference"});
  });
  const message={from:"SHIAP <qa@example.invalid>",to:["test@example.invalid"],...renderEmail("booking_created",context,"customer")};
  const first=await provider.send(message,"same-delivery-id");
  assert.equal(first.state,"retry");assert.equal(first.error,"PROVIDER_HTTP_503");
  assert.equal((await provider.send(message,"same-delivery-id")).state,"sent");
  assert.equal(requests[0].headers["Idempotency-Key"],requests[1].headers["Idempotency-Key"]);
  assert.equal(requests[0].body,requests[1].body);
  assert.equal((await resendProvider("fixture",async()=>new Response("bad",{status:422})).send(message,"id")).state,"failed");
  assert.equal((await resendProvider("fixture",async()=>{throw new Error("secret detail");}).send(message,"id")).error,"PROVIDER_CONNECTION_FAILURE");
});
test("sender domain must be verified and cron requires a strong matching server secret",async()=>{
  assert.equal(await resendProvider("fixture",async()=>Response.json({data:[{name:"example.invalid",status:"pending"}]})).verifySender("qa@example.invalid"),false);
  assert.equal(await resendProvider("fixture",async()=>Response.json({data:[{name:"example.invalid",status:"verified"}]})).verifySender("qa@example.invalid"),true);
  const secret="local-fixture-".repeat(4);
  assert.equal(validCronAuthorization(null,secret),false);assert.equal(validCronAuthorization("Bearer wrong",secret),false);
  assert.equal(validCronAuthorization("Bearer short","short"),false);assert.equal(validCronAuthorization("Bearer "+secret,secret),true);
});
