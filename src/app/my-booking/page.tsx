"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import type { CustomerOrder } from "@/lib/booking-view";
import { bookingDate } from "@/lib/booking-view";
import { bookingStatus } from "@/lib/booking-status";
import { formatRupiah } from "@/lib/booking-engine";
import { bookingItemCategory } from "@/lib/admin/booking-category";
import ServiceCategoryIcon from "@/components/booking/service-category-icon";

const filters = { all: "Semua", payment: "Menunggu Pembayaran", verification: "Menunggu Verifikasi", confirmed: "Terkonfirmasi", expired: "Kedaluwarsa", cancelled: "Dibatalkan", action: "Perlu Tindakan" };

export default function MyBookingPage() {
  const [orders, setOrders] = useState<(CustomerOrder & { proofRejected?: boolean })[]>([]);
  const [guest, setGuest] = useState(true);
  const [filter, setFilter] = useState<keyof typeof filters>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/bookings", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (signal?.aborted) return;
      setOrders(result.orders);
      setGuest(result.guest);
      setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Pesanan belum dapat dimuat.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    // State updates happen only after the external HTTP request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [load]);

  const visible = orders.filter((order) => filter === "all" || bookingStatus(order, order.proofRejected).key === filter);

  return <main className="mx-auto min-w-0 max-w-3xl space-y-3 bg-[#F7F9FC] px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
    <header className="flex items-center justify-between gap-2">
      <h1 className="text-xl font-bold text-[#0A2E63]">Pesanan Saya</h1>
      <div className="flex items-center gap-2">
        <Link href="/booking" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Booking baru</Link>
        <button type="button" aria-label="Perbarui daftar pesanan" onClick={() => void load()} className="grid size-11 place-items-center text-[#1265D8]"><RefreshCw size={17} /></button>
      </div>
    </header>
    {guest && <p className="text-xs leading-5 text-slate-600">Pesanan tamu yang memiliki akses aktif di browser ini. <Link href="/login" className="font-semibold text-[#1265D8]">Masuk untuk melihat pesanan akun.</Link></p>}
    <div role="group" aria-label="Filter status pesanan" className="flex flex-wrap gap-1.5">
      {(Object.keys(filters) as (keyof typeof filters)[]).map((key) => <button type="button" key={key} aria-pressed={key === filter} onClick={() => setFilter(key)} className={`min-h-11 rounded-full border px-3 text-xs font-semibold ${key === filter ? "border-[#1265D8] bg-[#1265D8] text-white" : "border-slate-200 bg-white text-[#0A2E63]"}`}>{filters[key]}</button>)}
    </div>
    {loading && <p role="status" className="py-6 text-center text-sm text-slate-600">Memuat pesanan…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!loading && !error && !visible.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
      <p className="text-sm font-semibold text-[#0A2E63]">{orders.length ? "Belum ada pesanan dengan status ini." : "Belum ada pesanan yang dapat ditampilkan."}</p>
      {guest && <p className="mt-2 text-sm text-slate-600">Untuk pesanan dari perangkat lain, hubungi bantuan SHIAP agar kepemilikan dapat diperiksa.</p>}
      <Link href="/booking" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Mulai booking</Link>
    </div>}
    <ul className="space-y-2.5">
      {visible.map((order) => {
        const status = bookingStatus(order, order.proofRejected);
        return <li key={order.id}><Link href={"/my-booking/" + order.id} className="block rounded-2xl border border-slate-200 bg-white p-3 focus-visible:outline-[#1265D8] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all text-xs font-bold text-[#1265D8]">{order.order_number}</p>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#0A2E63]">{status.label}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {order.booking_items.map((item) => <li key={item.id} className="flex gap-2">
              <ServiceCategoryIcon category={bookingItemCategory(item)} className="mt-0.5 text-[#1265D8]" />
              <div className="min-w-0"><h2 className="break-words text-sm font-bold text-[#0A2E63]">{item.service_name}</h2><p className="text-xs text-slate-600">{bookingDate(item.date_start)}{item.date_end ? " – " + bookingDate(item.date_end) : ""}</p></div>
            </li>)}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="text-sm font-bold text-[#0A2E63]">{formatRupiah(Number(order.total_amount))}</p>
            <span className="inline-flex items-center text-xs font-semibold text-[#1265D8]">{status.key === "payment" ? "Lanjutkan pembayaran" : status.key === "verification" ? "Lihat bukti & status" : "Lihat detail"}<ChevronRight size={15} /></span>
          </div>
        </Link></li>;
      })}
    </ul>
    {guest && orders.length > 0 && <button type="button" disabled={revoking} onClick={async () => {
      if (!window.confirm("Hapus akses pesanan tamu dari browser ini? Pemulihan akses memerlukan pemeriksaan oleh SHIAP.")) return;
      setRevoking(true);
      try {
        const response = await fetch("/api/bookings/session", { method: "DELETE" });
        if (!response.ok) throw new Error("Akses belum dapat dicabut.");
        await load();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Akses belum dapat dicabut."); }
      finally { setRevoking(false); }
    }} className="min-h-11 text-sm font-semibold text-slate-600 disabled:opacity-60">Hapus akses tamu di browser ini</button>}
  </main>;
}
