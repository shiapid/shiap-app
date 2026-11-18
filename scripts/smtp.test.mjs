import test from "node:test";
import assert from "node:assert/strict";
import {smtpConfiguration,smtpProvider,classifySmtpFailure} from "../src/lib/notifications/smtp.ts";
const fixture={SMTP_HOST:"mail.example.invalid",SMTP_PORT:"465",SMTP_SECURE:"true",SMTP_USER:"notifications@example.invalid",SMTP_PASSWORD:"local-test-fixture",SMTP_FROM_EMAIL:"notifications@example.invalid",SMTP_FROM_NAME:"SHIAP"};
test("SMTP requires server credentials, implicit TLS, certificate validation and disabled debug logs",()=>{
  const config=smtpConfiguration(fixture);
  assert.ok(config);assert.equal(config.port,465);assert.equal(config.secure,true);assert.equal(config.tls.rejectUnauthorized,true);assert.equal(config.logger,false);assert.equal(config.debug,false);
  assert.equal(config.disableFileAccess,true);assert.equal(config.disableUrlAccess,true);
  for(const override of [{SMTP_PASSWORD:""},{SMTP_SECURE:"false"},{SMTP_PORT:"587"},{SMTP_FROM_NAME:"unsafe\r\nheader"},{SMTP_FROM_EMAIL:"other@example.invalid"}])assert.equal(smtpConfiguration({...fixture,...override}),null);
});
test("SMTP retries only definite pre-delivery failures and rejects ambiguous DATA timeouts",()=>{
  assert.equal(classifySmtpFailure({code:"ETIMEDOUT",command:"CONN"}).state,"retry");
  assert.equal(classifySmtpFailure({responseCode:451,command:"DATA"}).state,"retry");
  assert.equal(classifySmtpFailure({responseCode:550}).state,"failed");
  assert.equal(classifySmtpFailure({code:"EAUTH"}).error,"SMTP_AUTHENTICATION_FAILED");
  assert.deepEqual(classifySmtpFailure({code:"ETIMEDOUT",command:"DATA"}),{state:"failed",error:"SMTP_DELIVERY_UNCERTAIN"});
});
test("Nodemailer adapter verifies SMTP and keeps a stable Message-ID without claiming inbox delivery",async()=>{
  let verified=0;const messages=[];
  const adapter=smtpProvider(smtpConfiguration(fixture),{async verify(){verified++;return true;},async sendMail(message){messages.push(message);return {accepted:["admin@example.invalid"],messageId:message.messageId};}});
  assert.equal(adapter.idempotent,false);assert.equal(await adapter.verifySender(fixture.SMTP_FROM_EMAIL),true);assert.equal(verified,1);
  const result=await adapter.send({from:"SHIAP <notifications@example.invalid>",to:["admin@example.invalid"],subject:"Local test",text:"No booking",html:"<p>No booking</p>"},"test-id");
  assert.equal(result.state,"sent");assert.ok(messages[0].messageId.includes("test-id"));
  assert.ok(!JSON.stringify(result).includes(fixture.SMTP_PASSWORD));
});
