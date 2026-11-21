import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { partnerIdentity } from "@/lib/places/partner";
import { requestStayWithdrawal } from "./actions";

const statuses = {
  EARLY: "Memenuhi syarat awal",
  FINAL: "Stay selesai",
  PENDING: "Menunggu pemenuhan",
  HELD: "Dalam peninjauan Finance",
} as const;

const payoutStatuses = {
  PENDING: "Menunggu Finance",
  APPROVED: "Disetujui",
  PROCESSING: "Diproses",
  PAID: "Dibayar",
  REJECTED: "Ditolak",
  FAILED: "Gagal",
  RETURNED: "Dikembalikan bank",
} as const;

type Wallet = {
  totals: { verified_earnings_idr: string; pending_idr: string; held_idr: string; eligibility_idr: string; reserved_idr: string; payout_paid_idr: string; refund_exposure_idr: string };
  properties: { places_id: string; name: string }[];
  items: {
    item_id: string;
    places_id: string;
    order_number: string;
    property_name: string;
    net_idr: string;
    commission_idr: string;
    eligible_idr: string;
    eligibility: keyof typeof statuses;
  }[];
  withdrawals: {
    id: string;
    status: "PENDING" | "APPROVED" | "PROCESSING" | "PAID" | "REJECTED" | "FAILED" | "RETURNED";
    amount_idr: string;
    account_last4: string;
    order_number: string;
  }[];
  truncated: boolean;
};

function rupiah(amount: string) {
  return BigInt(amount).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
}

type PayoutAccount = { id: string; places_id: string; bank_name: string; last4: string };

const messages: Record<string, string> = {
  requested: "Permintaan pencairan sudah masuk antrean Finance.",
  invalid: "Masukkan nominal pencairan dalam Rupiah.",
  blocked: "Permintaan belum bisa diproses. Periksa saldo dan rekening terverifikasi.",
};

export default async function PartnerStayWallet({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (process.env.SHIAP_STAY_WALLET_READ_ENABLED !== "true") notFound();
  const identity = await partnerIdentity().catch(() => null);
  if (!identity) redirect("/login?next=/partner/stay/wallet");

  const { data, error } = await identity.client.rpc("read_stay_partner_wallet");
  const wallet = data as Wallet | null;
  const payoutUi = process.env.SHIAP_STAY_PAYOUT_UI_ENABLED === "true";
  const accounts = payoutUi
    ? (await identity.client.rpc("read_stay_partner_payout_accounts")).data as PayoutAccount[] | null : null;
  const status = (await searchParams).status ?? "";
  const message = Object.hasOwn(messages, status) ? messages[status] : null;

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#1265D8]" href="/partner/stay/operations">
          Kembali ke Operasional Stay
        </Link>
        <h2 className="text-xl font-extrabold text-[#0A2E63]">Wallet Partner Stay</h2>
        <p className="text-sm text-slate-600">Ringkasan pendapatan dari pembayaran Stay yang telah diverifikasi.</p>
      </header>

      {message && <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm" role="status">{message}</p>}
      {error || !wallet ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Saldo belum dapat dimuat. Coba lagi.
        </p>
      ) : wallet.properties.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Wallet tersedia untuk pemilik properti Stay Partner yang terverifikasi.
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ["Pendapatan terverifikasi", wallet.totals.verified_earnings_idr],
              ["Saldo menunggu", wallet.totals.pending_idr],
              ["Saldo ditahan", wallet.totals.held_idr],
              ["Estimasi memenuhi syarat", wallet.totals.eligibility_idr],
              ["Dana dicadangkan", wallet.totals.reserved_idr],
              ["Payout tercatat", wallet.totals.payout_paid_idr],
              ["Eksposur refund", wallet.totals.refund_exposure_idr],
            ] as const).map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                <dt className="text-xs text-slate-600">{label}</dt>
                <dd className="mt-1 break-words text-lg font-extrabold text-[#0A2E63]">{rupiah(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-[#0A2E63]">
            {payoutUi ? "Permintaan ditinjau Finance sebelum transfer." : "Pencairan belum tersedia."} Estimasi mengikuti verifikasi booking dan pemenuhan Stay.
          </p>
          <section aria-labelledby="wallet-bookings" className="space-y-2">
            <h3 id="wallet-bookings" className="font-bold text-[#0A2E63]">Pendapatan per booking</h3>
            {wallet.items.length === 0 ? <p className="text-sm text-slate-600">Belum ada pendapatan tercatat untuk properti Anda.</p> : null}
            <ul className="space-y-2">
              {wallet.items.map(item => {
                const account = accounts?.find(entry => entry.places_id === item.places_id);
                return (
                <li key={item.item_id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-[#0A2E63]">{item.property_name}</p>
                    <p className="break-words text-xs text-slate-600">{item.order_number}</p>
                  </div>
                  <div className="min-w-0 text-xs text-slate-600">
                    <p>Bersih <strong className="break-words text-[#0A2E63]">{rupiah(item.net_idr)}</strong></p>
                    <p>Komisi SHIAP {rupiah(item.commission_idr)}</p>
                  </div>
                  <div className="min-w-0 text-xs text-slate-600">
                    <p className="font-semibold text-[#0A2E63]">{statuses[item.eligibility]}</p>
                    <p>{rupiah(item.eligible_idr)} estimasi memenuhi syarat</p>
                  </div>
                  {account && payoutUi && BigInt(item.eligible_idr) > BigInt(0) && (
                    <form action={requestStayWithdrawal} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 sm:col-span-3">
                      <input type="hidden" name="requestId" value={randomUUID()} />
                      <input type="hidden" name="itemId" value={item.item_id} />
                      <input type="hidden" name="accountId" value={account.id} />
                      <label className="min-w-0 text-xs font-semibold text-slate-700">
                        Nominal ke {account.bank_name} ••••{account.last4}
                        <input name="amount" type="number" inputMode="numeric" step="1" min="1" max={item.eligible_idr}
                          required className="mt-1 block h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm" />
                      </label>
                      <button className="min-h-11 rounded-lg bg-[#1265D8] px-4 text-sm font-semibold text-white">
                        Ajukan pencairan
                      </button>
                    </form>
                  )}
                </li>
                );
              })}
            </ul>
            {wallet.truncated ? <p className="text-xs text-slate-600">Daftar menampilkan 100 booking terbaru. Ringkasan mencakup seluruh booking yang dapat Anda akses.</p> : null}
          </section>
          {wallet.withdrawals.length > 0 ? (
            <section aria-labelledby="wallet-withdrawals" className="space-y-2">
              <h3 id="wallet-withdrawals" className="font-bold text-[#0A2E63]">Riwayat pencairan</h3>
              <ul className="space-y-2">
                {wallet.withdrawals.map(payout => (
                  <li key={payout.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                    <span className="break-words">{payout.order_number} · Rekening ••••{payout.account_last4}</span>
                    <strong>{rupiah(payout.amount_idr)} · {payoutStatuses[payout.status]}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
