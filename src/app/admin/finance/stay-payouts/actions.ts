"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uuidPattern } from "@/lib/customer-bookings";

const returnPath = "/admin/finance/stay-payouts";
const actions = ["APPROVE", "START", "REJECT", "PAY", "FAIL", "ACCOUNT"];

function value(form: FormData, field: string) {
  return String(form.get(field) ?? "").trim();
}

export async function manageStayPayout(form: FormData) {
  if (process.env.SHIAP_STAY_PAYOUT_UI_ENABLED !== "true") redirect(returnPath);
  const event = value(form, "event");
  const id = value(form, "id");
  const action = value(form, "action");
  const reason = value(form, "reason");
  if (!uuidPattern.test(event) || !uuidPattern.test(id) || !actions.includes(action)) redirect(returnPath + "?status=invalid");

  const client = await createClient();
  const [{ data: identity }, { data: authorized }] = await Promise.all([
    client.auth.getUser(), client.rpc("can_manage_stay_payouts"),
  ]);
  if (!identity.user || !authorized) redirect(returnPath);
  const needsEvidence = ["PAY", "FAIL", "ACCOUNT"].includes(action);
  const path = identity.user.id + "/" + event;
  let transfer: Record<string, string> | null = null;

  if (needsEvidence) {
    const proof = form.get("proof");
    if (!(proof instanceof File) || proof.size === 0 || proof.size > 800_000 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(proof.type)) redirect(returnPath + "?status=invalid");

    if (action === "PAY") {
      const occurredAt = new Date(value(form, "bankTime") + ":00+08:00");
      const bankId = value(form, "bankId");
      const amount = value(form, "amount");
      if (!Number.isFinite(occurredAt.getTime()) || bankId.length < 3 || !/^[1-9]\d{0,11}$/.test(amount)) {
        redirect(returnPath + "?status=invalid");
      }
      transfer = {
        evidence: path, bank_id: bankId, occurred_at: occurredAt.toISOString(), amount,
        source_account: value(form, "source"), beneficiary_account: value(form, "beneficiary"),
      };
    } else {
      transfer = { evidence: path };
    }
    const bytes = Buffer.from(await proof.arrayBuffer());
    const validSignature = proof.type === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-"
      : proof.type === "image/jpeg" ? bytes.subarray(0, 3).toString("hex") === "ffd8ff"
      : bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    if (!validSignature) redirect(returnPath + "?status=invalid");

    const storage = client.storage.from("stay-payout-evidence");
    const { error } = await storage.upload(path, proof, { contentType: proof.type, upsert: false });
    if (error) {
      const existing = await storage.download(path);
      if (!existing.data || !bytes.equals(Buffer.from(await existing.data.arrayBuffer()))) {
        redirect(returnPath + "?status=invalid");
      }
    }
  }

  const result = action === "ACCOUNT"
    ? await client.rpc("admin_verify_stay_payout_account", {
      p_places: id, p_bank: value(form, "bank"), p_account: value(form, "beneficiary"), p_evidence: path,
    })
    : await client.rpc("admin_manage_stay_withdrawal", {
      p_event: event, p_id: id, p_action: action, p_reason: reason, p_transfer: transfer,
    });
  redirect(returnPath + (result.error ? "?status=blocked" : "?status=recorded"));
}
