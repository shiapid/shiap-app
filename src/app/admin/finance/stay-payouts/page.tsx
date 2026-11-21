import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { manageStayPayout } from "./actions";

type Payout = {
  id: string;
  order_number: string;
  property_name: string;
  amount_idr: string;
  status: string;
  bank_name: string;
  last4: string;
  account_evidence: string;
};

const field = "mt-1 block h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm";
const button = "min-h-11 rounded-lg bg-[#1265D8] px-4 text-sm font-semibold text-white";

const messages: Record<string, string> = {
  recorded: "Tindakan Finance tercatat.",
  invalid: "Periksa nilai dan bukti bank. Ukuran file maksimum 800 KB.",
  blocked: "Tindakan ditolak. Periksa tahap proses, saldo, dan bukti bank.",
};

function EvidenceField() {
  return <label className="min-w-0">Bukti bank privat
    <input required name="proof" type="file" accept="application/pdf,image/png,image/jpeg" className="mt-1 block w-full min-w-0" />
  </label>;
}

function PayoutForm({ payout }: { payout: Payout }) {
  const processing = payout.status === "PROCESSING";
  if (!processing && payout.status !== "PENDING" && payout.status !== "APPROVED") return null;

  return (
    <form action={manageStayPayout} className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
      <input type="hidden" name="event" value={randomUUID()} />
      <input type="hidden" name="id" value={payout.id} />
      <label>Keputusan
        <select name="action" className={field}>
          {processing ? <>
            <option value="PAY">Catat transfer berhasil</option>
            <option value="FAIL">Catat transfer gagal</option>
          </> : <>
            <option value={payout.status === "PENDING" ? "APPROVE" : "START"}>
              {payout.status === "PENDING" ? "Setujui permintaan" : "Otorisasi transfer manual"}
            </option>
            <option value="REJECT">Tolak</option>
          </>}
        </select>
      </label>
      <label>Alasan Finance<input required name="reason" minLength={10} maxLength={500} className={field} /></label>
      {processing && <>
        <EvidenceField />
        <label>ID mutasi bank<input name="bankId" className={field} /></label>
        <label>Waktu transfer (WITA)<input name="bankTime" type="datetime-local" className={field} /></label>
        <label>Nominal transfer<input name="amount" type="number" min="1" step="1" className={field} /></label>
        <label>Rekening SHIAP<input name="source" inputMode="numeric" autoComplete="off" className={field} /></label>
        <label>Rekening tujuan<input name="beneficiary" inputMode="numeric" autoComplete="off" className={field} /></label>
      </>}
      <button className={button + " sm:col-span-2"}>Simpan tindakan Finance</button>
    </form>
  );
}

export default async function StayPayoutQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (process.env.SHIAP_STAY_PAYOUT_UI_ENABLED !== "true") notFound();
  const client = await createClient();
  const [authorization, result] = await Promise.all([
    client.rpc("can_manage_stay_payouts"), client.rpc("admin_read_stay_payout_queue"),
  ]);
  if (!authorization.data) notFound();
  const payouts = (result.data ?? []) as Payout[];
  const status = (await searchParams).status ?? "";
  const message = Object.hasOwn(messages, status) ? messages[status] : null;
  const evidencePaths = [...new Set(payouts.map(row => row.account_evidence))];
  const evidence = evidencePaths.length
    ? await client.storage.from("stay-payout-evidence").createSignedUrls(evidencePaths, 60, { download: true }) : null;
  const signed = new Map(evidence?.data?.map(row => [row.path, row.signedUrl]));

  return (
    <section className="space-y-4 text-[#0A2E63]">
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#1265D8]" href="/admin/finance">Kembali ke Finance</Link>
      <h1 className="text-xl font-extrabold">Pencairan Partner Stay</h1>
      {message && <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm">{message}</p>}
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-bold">Verifikasi rekening payout</summary>
        <form action={manageStayPayout} className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <input type="hidden" name="event" value={randomUUID()} />
          <input type="hidden" name="action" value="ACCOUNT" />
          <label>ID properti Places<input required name="id" className={field} /></label>
          <label>Nama bank<input required name="bank" className={field} /></label>
          <label>Nomor rekening<input required inputMode="numeric" autoComplete="off" name="beneficiary" className={field} /></label>
          <EvidenceField />
          <button className={button + " sm:col-span-2"}>Catat rekening terverifikasi</button>
        </form>
      </details>
      {result.error ? <p role="alert">Antrean pencairan belum dapat dimuat.</p> : payouts.length === 0 ? <p>Belum ada permintaan pencairan.</p> : null}
      {payouts.map(payout => (
        <article key={payout.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="break-words font-bold">{payout.property_name} · {payout.order_number}</h2>
          <p className="mt-1 text-sm">{BigInt(payout.amount_idr).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })} · {payout.status}</p>
          <p className="mt-1 break-words text-xs">{payout.bank_name} ••••{payout.last4}</p>
          {signed.get(payout.account_evidence) && <a className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-[#1265D8]" href={signed.get(payout.account_evidence) ?? undefined}>Unduh bukti rekening</a>}
          <PayoutForm payout={payout} />
        </article>
      ))}
    </section>
  );
}
