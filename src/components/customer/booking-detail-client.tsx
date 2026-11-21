"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, RefreshCw } from "lucide-react";
import { bookingStatus, canSubmitProof } from "@/lib/booking-status";
import { bookingDate, type BookingDetail } from "@/lib/booking-view";
import { formatRupiah } from "@/lib/booking-engine";
import { bookingItemCategory } from "@/lib/admin/booking-category";
import { confirmCheckoutNavigation } from "@/lib/checkout-client";
import ServiceCategoryIcon from "@/components/booking/service-category-icon";
import PaymentProofUpload from "@/components/customer/payment-proof-upload";
import TicketVouchers from "@/components/customer/ticket-vouchers";

import { unifiedApprovalLabels, unifiedFulfillmentLabels, unifiedReservationLabels } from "@/lib/unified-checkout";

const demo = process.env.NEXT_PUBLIC_SHIAP_DEMO_MODE === "true";

export default function BookingDetailClient({ id }: { id: string }) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState({ now: 0, offset: 0 });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/bookings/" + encodeURIComponent(id), { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) setDetail(null);
        throw new Error(result.error);
      }
      if (signal?.aborted) return;
      confirmCheckoutNavigation(result.order.id);
      const server = new Date(result.serverNow).getTime();
      setClock({ now: server, offset: server - Date.now() });
      setDetail(result);
      setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Pesanan belum dapat dimuat.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    // State updates happen only after the external HTTP request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    const reload = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    const timer = setInterval(reload, 30_000);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", reload); document.removeEventListener("visibilitychange", reload); };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setClock((current) => ({ ...current, now: Date.now() + current.offset })), 1000);
    return () => clearInterval(timer);
  }, []);

  async function action(kind: "claim" | "cancel") {
    if (busy || (kind === "cancel" && !window.confirm("Batalkan pesanan ini dan lepaskan reservasi?"))) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/bookings/" + id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: kind }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice(kind === "claim" ? "Pesanan tersimpan di akun Anda." : "Pesanan dibatalkan.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Pesanan belum dapat diperbarui."); }
    finally { setBusy(false); }
  }

  const order = detail?.order;
  const state = order ? bookingStatus(order, detail.proofs[0]?.status === "rejected") : null;
  const deadline = order?.inventory_hold_expires_at ? new Date(order.inventory_hold_expires_at).getTime() : null;
  const seconds = deadline ? Math.max(0, Math.floor((deadline - clock.now) / 1000)) : 0;
  const canPay = order && canSubmitProof(order, clock.now) && !demo && detail.settings?.is_active;
  const bank = detail?.settings;
  const phone = detail?.supportPhone?.replace(/\D/g, "");
  const support = phone && /^\d{9,16}$/.test(phone) ? "https://wa.me/" + phone + "?text=" + encodeURIComponent("Halo SHIAP, mohon bantuan pesanan " + order?.order_number) : "/custom-trip";
  const overdue = detail?.proofs.some((proof) => proof.status === "pending" && new Date(proof.review_due_at).getTime() <= clock.now);

  return <main className="mx-auto min-w-0 max-w-2xl space-y-3 bg-[#F7F9FC] px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
    <header className="flex items-center justify-between gap-2">
      <Link href="/my-booking" aria-label="Pesanan Saya" className="grid size-11 place-items-center rounded-full text-[#1265D8]"><ArrowLeft size={19} /></Link>
      <h1 className="flex-1 text-xl font-bold text-[#0A2E63]">Detail Pesanan</h1>
      <button type="button" aria-label="Perbarui status pesanan" onClick={() => void refresh()} className="grid size-11 place-items-center rounded-full text-[#1265D8]"><RefreshCw size={18} /></button>
    </header>
    {loading && <p role="status" className="py-8 text-center text-sm text-slate-600">Memuat pesanan…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-[#0A2E63]">{notice}</p>}
    {!loading && !order && <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-700">Untuk pesanan tamu, gunakan perangkat dan browser saat memesan. Pemulihan lintas perangkat memerlukan pemeriksaan kepemilikan oleh bantuan SHIAP.</p>
      <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Masuk ke akun</Link>
      <Link href="/custom-trip" className="ml-4 inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Bantuan SHIAP</Link>
    </div>}
    {order && detail && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CopyValue value={order.order_number} label="Salin kode pesanan" />
          <span className="rounded-full bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-[#0A2E63]">{state?.label}</span>
        </div>
        <ul className="mt-1 divide-y divide-slate-100">
          {order.booking_items.map((item) => {
            const line = detail.unified?.items.find((entry) => entry.item_id === item.id);
            return <li key={item.id} className="flex gap-2 py-2.5">
            <ServiceCategoryIcon category={bookingItemCategory(item)} className="mt-0.5 text-[#1265D8]" />
            <div className="min-w-0 break-words"><h2 className="text-sm font-bold text-[#0A2E63]">{item.service_name}</h2>
              {item.variant && <p className="text-xs text-slate-600">{item.variant}</p>}
              <p className="text-xs text-slate-600">{bookingDate(item.date_start)}{item.date_end ? " – " + bookingDate(item.date_end) : ""}</p>
              <p className="text-xs text-slate-600">{item.guests} orang · {item.quantity} {item.service_type === "stay" ? "kamar" : "unit"}</p>
              {line && <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                <p className="font-semibold text-[#0A2E63]">{formatRupiah(line.subtotal)}{line.fee > 0 && " + " + formatRupiah(line.fee) + " biaya layanan"}</p>
                <p>{unifiedApprovalLabels[line.approval]} · {unifiedReservationLabels[line.reservation]}</p>
                {line.review_open && <p>Sedang ditinjau SHIAP</p>}
                {line.fulfillment !== "PENDING" && <p>{unifiedFulfillmentLabels[line.fulfillment]}</p>}
              </div>}
            </div>
          </li>; })}
        </ul>
      </section>

      <section aria-labelledby="payment-title" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="space-y-1 text-sm text-[#0A2E63]">
          <div className="flex justify-between gap-2"><span>Harga Paket</span><strong>{formatRupiah(Number(order.package_subtotal ?? order.total_amount))}</strong></div>
          <div className="flex justify-between gap-2"><span>Biaya Layanan SHIAP</span><strong>{formatRupiah(Number(order.service_fee_total))}</strong></div>
          {order.service_fee_snapshot?.filter((line) => line.capped).map((line) => <p key={line.category} className="text-xs text-slate-600">Biaya {line.category} dibatasi dari {formatRupiah(line.requested_fee)} menjadi {formatRupiah(line.fee)} sesuai plafon {line.max_percentage_bps / 100}%.</p>)}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 id="payment-title" className="text-sm font-bold text-[#0A2E63]">Full Payment 100%</h2><p className="text-xs text-slate-600">Transfer bank manual</p></div>
          <p className="text-xl font-bold text-[#0A2E63]">{formatRupiah(Number(order.total_amount))}</p>
        </div>
        {state?.key === "payment" || (state?.key === "action" && order.payment_enabled && order.payment_status !== "refunded") ? <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          {deadline && seconds > 0 ? <>Sisa waktu pembayaran <strong>{Math.floor(seconds / 60).toString().padStart(2, "0")}:{(seconds % 60).toString().padStart(2, "0")}</strong></> : deadline ? "Waktu reservasi habis. Perbarui status atau hubungi SHIAP jika sudah transfer." : "Ikuti instruksi pembayaran pesanan ini."}
          {deadline && <span className="mt-1 block text-xs">Batas {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(deadline))} WITA</span>}
        </p> : null}
        {state?.key === "verification" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-[#0A2E63]">Bukti diterima dan reservasi ditahan selama pemeriksaan mutasi bank.{overdue ? " Pemeriksaan perlu ditindaklanjuti. Hubungi SHIAP dengan kode pesanan." : " Status akan diperbarui setelah verifikasi admin."}</p>}
        {["expired", "cancelled"].includes(state?.key || "") && <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Reservasi telah berakhir. Jika sudah transfer, hubungi SHIAP untuk pemeriksaan manual.</p>}
        {!order.payment_enabled && !detail.unified && <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Permintaan menunggu persetujuan admin. Instruksi pembayaran muncul setelah disetujui.</p>}
        {detail.unified && !detail.unified.payment_available && order.order_status === "pending_confirmation" && order.payment_status === "unpaid" &&
          <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Instruksi pembayaran tersedia setelah seluruh layanan disetujui dan reservasi masih berlaku.</p>}
        {detail.experience?.review_note && <p className="text-sm text-slate-700">{detail.experience.review_note}</p>}
        {demo && <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Mode demo. Pembayaran dan unggah bukti dinonaktifkan.</p>}
        {canPay && bank && <div className="space-y-2 rounded-xl bg-[#0A2E63] p-3 text-white">
          <p className="text-sm font-bold">{bank.bank_name}</p>
          <CopyValue value={bank.account_number} label="Salin nomor rekening" light />
          <p className="text-sm">a.n. <strong>{bank.account_name}</strong></p>
          {bank.instructions && <p className="whitespace-pre-line text-sm text-blue-100">{bank.instructions}</p>}
          <p className="text-xs text-blue-100">Transfer tepat sebesar total pesanan. Status lunas diberikan setelah dana dan nominal diverifikasi admin.</p>
        </div>}
        {!demo && order.payment_enabled && !bank && <p className="text-sm text-slate-700">Instruksi bank belum tersedia. Hubungi SHIAP sebelum transfer.</p>}
        <PaymentProofUpload bookingId={id} records={detail.proofs} eligible={Boolean(canPay && bank?.account_number && bank?.account_name)} onSubmitted={() => refresh()} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="text-sm font-bold text-[#0A2E63]">Data pemesan</h2>
        <p className="mt-1 break-words text-sm text-slate-700">{order.customer_name}</p>
        <p className="break-words text-sm text-slate-700">{order.customer_whatsapp}</p>
        {order.customer_email && <p className="break-all text-sm text-slate-700">{order.customer_email}</p>}
        {order.customer_notes && <p className="mt-1 break-words text-sm text-slate-600">{order.customer_notes}</p>}
      </section>
      {order.payment_status === "paid" && !["cancelled", "expired", "rejected"].includes(order.order_status) && <TicketVouchers bookingId={id}/>}
      {detail.guest && <section className="rounded-xl bg-blue-50 p-3 text-sm text-[#0A2E63]">
        <p>Akses pesanan tamu tersimpan di browser ini selama maksimal 30 hari. Untuk perangkat lain, hubungi bantuan SHIAP dengan kode pesanan. Tim akan memeriksa kepemilikan.</p>
        {detail.canClaim ? <button type="button" disabled={busy} onClick={() => void action("claim")} className="mt-1 min-h-11 font-bold">Simpan pesanan ke akun saya</button> : <Link href={"/login?next=" + encodeURIComponent("/my-booking/" + id)} className="mt-1 inline-flex min-h-11 items-center font-bold">Masuk untuk menyimpan pesanan ke akun</Link>}
      </section>}
      <div className="flex flex-wrap gap-2">
        <a href={support} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#1265D8]">Hubungi SHIAP</a>
        {order.order_status === "pending_confirmation" && order.payment_status === "unpaid" && <button type="button" disabled={busy} onClick={() => void action("cancel")} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-red-700">Batalkan pesanan</button>}
      </div>
    </>}
  </main>;
}

function CopyValue({ value, label, light = false }: { value: string; label: string; light?: boolean }) {
  const [status, setStatus] = useState("");
  return <div className="flex min-w-0 items-center gap-1">
    <span className={"min-w-0 break-all text-sm font-bold " + (light ? "text-white" : "text-[#0A2E63]")}>{value}</span>
    <button type="button" aria-label={label} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setStatus("Tersalin"); }
      catch { setStatus("Salin teks secara manual"); }
    }} className="grid size-11 shrink-0 place-items-center rounded-lg text-inherit">{status === "Tersalin" ? <Check size={16} /> : <Copy size={16} />}</button>
    {status && <span role="status" className="sr-only">{status}</span>}
  </div>;
}
