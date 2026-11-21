"use server";

import { redirect } from "next/navigation";
import { partnerIdentity } from "@/lib/places/partner";
import { uuidPattern } from "@/lib/customer-bookings";

const walletPath = "/partner/stay/wallet";

export async function requestStayWithdrawal(form: FormData) {
  if (process.env.SHIAP_STAY_PAYOUT_UI_ENABLED !== "true") redirect(walletPath);
  const id = String(form.get("requestId") ?? "");
  const item = String(form.get("itemId") ?? "");
  const account = String(form.get("accountId") ?? "");
  const amount = String(form.get("amount") ?? "");
  if (![id, item, account].every(value => uuidPattern.test(value)) || !/^[1-9]\d{0,11}$/.test(amount)) {
    redirect(walletPath + "?status=invalid");
  }
  const identity = await partnerIdentity().catch(() => null);
  if (!identity) redirect("/login?next=" + walletPath);
  const { error } = await identity.client.rpc("partner_request_stay_withdrawal", {
    p_id: id,
    p_item: item,
    p_account: account,
    p_amount: Number(amount),
  });
  redirect(walletPath + (error ? "?status=blocked" : "?status=requested"));
}
