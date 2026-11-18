"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Download, TicketCheck } from "lucide-react";
import { ticketQrPayload } from "@/lib/etickets/credentials";

type Ticket = { id: string; booking_item_id: string; ticket_code: string; qr_credential: string; status: "issued" | "checked_in" | "revoked"; issued_at: string };
type Item = { id: string; service_name: string; service_type: string; service_category: string | null; variant: string | null; notes: string | null; date_start: string; date_end: string | null; guests: number; quantity: number; session: string | null; location: string | null; check_in_time: string | null; check_out_time: string | null; selected_addons: unknown };
type Contacts = { contact_name: string; whatsapp: string | null; email: string | null; website: string; instagram: string | null };
type Voucher = { ticket: Ticket; bookingCode: string; customerName: string; orderStatus: string; items: Item[]; contacts: Contacts };

export default function TicketVouchers({ bookingId }: { bookingId: string }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/bookings/${encodeURIComponent(bookingId)}/tickets`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "E-Tiket belum tersedia."); return data as { tickets: Voucher[] }; })
      .then((data) => setVouchers(data.tickets))
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "E-Tiket belum dapat dimuat."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bookingId]);

  return <section id="tickets" className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1265D8]">DIGITAL VOUCHER</p><h2 className="mt-1 text-base font-bold text-[#0A2E63]">E-Tiket Anda</h2></div>
      <a href={`/api/bookings/${encodeURIComponent(bookingId)}/tickets/pdf`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1265D8] px-3 text-xs font-bold text-white"><Download size={16}/>Download E-Ticket (PDF)</a>
    </div>
    <p className="text-xs leading-5 text-slate-600">Satu voucher dibuat untuk setiap layanan. Tampilkan QR kepada petugas SHIAP saat check-in.</p>
    {loading && <p role="status" className="text-sm text-slate-600">Menyiapkan voucher…</p>}
    {!loading && error && <div role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-[#0A2E63]">{error} Pembayaran tetap tercatat; hubungi SHIAP bila tiket belum muncul setelah beberapa menit.</div>}
    {vouchers.map((voucher) => <VoucherCard key={voucher.ticket.id} voucher={voucher}/>) }
  </section>;
}

function VoucherCard({ voucher }: { voucher: Voucher }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const item = voucher.items[0];
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    void QRCode.toCanvas(element, ticketQrPayload(voucher.ticket.qr_credential), { errorCorrectionLevel: "H", width: 220, margin: 2, color: { dark: "#0A2E63", light: "#FFFFFF" } }).catch(() => undefined);
  }, [voucher.ticket.qr_credential]);
  if (!item) return null;
  const date = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Makassar" }).format(new Date(value + (value.length === 10 ? "T00:00:00Z" : "")));
  const contactsMissing = !voucher.contacts.whatsapp || !voucher.contacts.email;
  const category = item.service_category || item.service_type;
  return <article className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[1fr_160px] sm:items-center">
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2"><Image src="/logo/shiap-logo.png" alt="SHIAP" width={114} height={32} className="h-7 w-[105px] object-contain object-left"/><span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800"><TicketCheck size={13}/>{voucher.ticket.status === "checked_in" ? "Check-in tercatat" : "Lunas · terverifikasi"}</span></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#1265D8]">{category}</p><h3 className="break-words text-sm font-extrabold text-[#0A2E63]">{item.service_name}</h3></div>
      <p className="break-all text-xs text-slate-600">Booking {voucher.bookingCode} · Tiket {voucher.ticket.ticket_code}</p>
      <p className="text-xs text-slate-700">{date(item.date_start)}{item.date_end ? ` – ${date(item.date_end)}` : ""}{item.session ? ` · ${item.session}` : ""}{item.service_type === "stay" && item.check_in_time ? ` · Check-in ${item.check_in_time}` : ""}{item.service_type === "stay" && item.check_out_time ? ` · Check-out ${item.check_out_time}` : ""}</p>
      <p className="break-words text-xs text-slate-600">{item.guests} peserta · {item.quantity} {item.service_type === "stay" ? "kamar/unit" : "unit layanan"}{item.location ? ` · ${item.location}` : ""}</p>
      {(item.variant || item.notes || Array.isArray(item.selected_addons) && item.selected_addons.length > 0) && <p className="break-words text-xs text-slate-600">{[item.variant, ...(Array.isArray(item.selected_addons) ? item.selected_addons.map((entry) => typeof entry === "string" ? entry : entry && typeof entry === "object" ? Object.values(entry as Record<string, unknown>).filter((value) => typeof value === "string" || typeof value === "number").join(" · ") : "") : []), item.notes].filter(Boolean).join(" · ")}</p>}
      <div className="text-xs text-slate-600"><p>WhatsApp: {voucher.contacts.whatsapp || "Belum dikonfigurasi Admin"}</p><p>Email: {voucher.contacts.email || "Belum dikonfigurasi Admin"}</p><p>Web: {voucher.contacts.website} · app.shiap.id</p>{voucher.contacts.instagram && <p>Instagram: {voucher.contacts.instagram}</p>}</div>
      {contactsMissing && <p className="rounded-lg bg-orange-50 p-2 text-[11px] text-orange-900">Kontak Customer Service belum lengkap. Voucher tetap tersedia; Admin perlu melengkapinya di Pengaturan.</p>}
    </div>
    <div className="flex items-center gap-3 rounded-xl bg-[#F7F9FC] p-2 sm:flex-col sm:gap-1"><canvas ref={canvas} aria-label={`QR aman untuk tiket ${voucher.ticket.ticket_code}`} className="h-28 w-28 shrink-0 rounded-lg bg-white p-1"/><p className="text-[10px] font-semibold text-slate-600">QR khusus petugas</p></div>
  </article>;
}
