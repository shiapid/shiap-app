import { requireAdmin } from "@/lib/admin/guard";
import { vendorWhatsAppLink } from "@/lib/admin/vendor-contact";
import { bookingItemCategory } from "@/lib/admin/booking-category";
﻿import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone, Tag, Users, Layers3, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BookingOperations from "@/components/admin/booking-operations";
import ExperienceRequestReview from "@/components/admin/experience-request-review";
import BookingWhatsApp from "@/components/admin/booking-whatsapp";
import UnifiedItemActions from "@/components/admin/unified-item-actions";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { unifiedCheckoutEnabled, unifiedApprovalLabels, unifiedFulfillmentLabels, type UnifiedBookingView } from "@/lib/unified-checkout";

export const dynamic = "force-dynamic";

const orderLabels: Record<string, string> = {
  pending_confirmation: "Menunggu Konfirmasi",
  confirmed: "Dikonfirmasi",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  completed: "Selesai",
  expired: "Reservasi Kedaluwarsa",
};
const paymentLabels: Record<string, string> = {
  unpaid: "Belum Dibayar",
  pending: "Menunggu Verifikasi",
  paid: "Sudah Dibayar",
  failed: "Pembayaran Gagal",
  refunded: "Dana Dikembalikan",
};
const serviceLabels: Record<string, string> = {
  trip: "Trip",
  stay: "Stay / Villa",
  activity: "Wahana",
  rental: "Rental",
  documentation: "Dokumentasi",
  other: "Layanan lainnya",
};
function dateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }).format(new Date(value)) + " WITA";
}
function rupiah(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) return "Menunggu penawaran";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
}

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { error: holdError } = await supabase.rpc("expire_booking_holds");
  if (holdError) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Pemeriksaan masa reservasi gagal: {holdError.message}</p>;
  const { data: order, error } = await supabase
    .from("booking_orders")
    .select("id,order_number,customer_name,customer_whatsapp,customer_email,customer_notes,order_status,payment_status,payment_enabled,total_amount,created_at,inventory_hold_expires_at,booking_items(id,service_type,service_category,service_name,variant,date_start,date_end,quantity,guests,unit_price,price_status,notes)")
    .eq("id", id)
    .maybeSingle();

  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Detail booking gagal dimuat: {error.message}</p>;
  if (!order) notFound();
  const unifiedResult = unifiedCheckoutEnabled ? await bookingAdmin().rpc("server_unified_booking_view", { p_booking: id }) : null;
  if (unifiedResult?.error) return <p role="alert" className="text-sm text-red-700">Status layanan belum dapat dimuat.</p>;
  const unified = (unifiedResult?.data ?? null) as UnifiedBookingView | null;
  const { data: experienceRequest } = await supabase.from("shiap_experience_booking_records").select("id,request_status,booking_mode,participant_count,participant_data,selected_addons,request_details,review_note").eq("booking_id", id).maybeSingle();

  const { data: contacts, error: vendorError } = await supabase.rpc("admin_booking_vendor_contacts", { p_booking_id: id });
  const vendorByItem = new Map<string, { name: string; whatsapp: string }>();
  for (const contact of contacts ?? []) vendorByItem.set(contact.item_id, contact);

  return (
    <div>
      <Link href="/admin/bookings" className="inline-flex items-center gap-2 text-xs font-bold text-[#1974FF] hover:text-[#0A2E63]"><ArrowLeft size={15} /> Kembali ke daftar booking</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#1974FF]">BOOKING DETAIL</p>
          <h1 className="mt-2 break-all text-2xl font-extrabold text-[#0A2E63]">{order.order_number}</h1>
          <p className="mt-1 text-xs text-slate-500">Dibuat {dateTime(order.created_at)}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-[#1974FF]">Operations · V2</span>
      </div>

      <div className="mt-3"><BookingWhatsApp bookingId={order.id}/></div>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Status booking</p>
          <p className="mt-2 text-base font-extrabold text-[#0A2E63]">{orderLabels[order.order_status] ?? order.order_status}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Status pembayaran</p>
          <p className="mt-2 text-base font-extrabold text-[#0A2E63]">{paymentLabels[order.payment_status] ?? order.payment_status}</p>
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500">Total tagihan customer</p>
        <p className="mt-2 text-2xl font-extrabold text-[#0A2E63]">{rupiah(Number(order.total_amount))}</p>
      </section>
      {order.order_status === "pending_confirmation" && order.payment_status === "unpaid" && order.inventory_hold_expires_at && <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"><strong>Hold inventory aktif</strong><p className="mt-1 text-xs">Reservasi berakhir pada {dateTime(order.inventory_hold_expires_at)}.</p></section>}
      {!order.payment_enabled && <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Pembayaran terkunci</strong><p className="mt-1 text-xs">Pelanggan tidak dapat mengunggah bukti transfer sampai permintaan Experience disetujui.</p></section>}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-[#0A2E63]">Data pelanggan</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3"><Users className="text-[#1974FF]" size={19}/><div><p className="text-[10px] text-slate-500">Nama</p><p className="text-sm font-semibold">{order.customer_name}</p></div></div>
          <div className="flex items-center gap-3"><Phone className="text-[#1974FF]" size={19}/><div><p className="text-[10px] text-slate-500">WhatsApp</p><p className="text-sm font-semibold">{order.customer_whatsapp}</p></div></div>
          {order.customer_email && <div className="flex items-center gap-3"><Mail className="text-[#1974FF]" size={19}/><div><p className="text-[10px] text-slate-500">Email</p><p className="break-all text-sm font-semibold">{order.customer_email}</p></div></div>}
        </div>
        {order.customer_notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Catatan pemesan: {order.customer_notes}</p>}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ClipboardList className="text-[#1974FF]" size={19}/><h2 className="font-bold text-[#0A2E63]">Rincian layanan</h2></div>
        <div className="mt-4 space-y-4">
          {vendorError && <p role="alert" className="text-xs text-amber-800">Kontak vendor gagal dimuat.</p>}
          {order.booking_items.map((item) => {
            const vendor = vendorByItem.get(item.id);
            const line = unified?.items.find((entry) => entry.item_id === item.id);
            const dates = dateOnly(item.date_start) + (item.date_end ? " – " + dateOnly(item.date_end) : "");
            const vendorLink = vendor && vendorWhatsAppLink(vendor.whatsapp, order.order_number, item.service_name, dates, item.guests, item.quantity);
            return (
            <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#1974FF]">{serviceLabels[bookingItemCategory(item)]}</span>
                  <h3 className="mt-2 text-sm font-extrabold text-[#0A2E63]">{item.service_name}</h3>
                  {item.variant && <p className="mt-1 text-xs text-slate-500"><Tag size={12} className="mr-1 inline"/> {item.variant}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Harga per unit</p>
                  <p className="text-sm font-bold text-[#0A2E63]">{rupiah(item.unit_price)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Status harga: {item.price_status}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-xs text-slate-600"><CalendarDays size={15} className="text-[#1974FF]"/><span>{dateOnly(item.date_start)}{item.date_end ? ` – ${dateOnly(item.date_end)}` : ""}</span></div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Users size={15} className="text-[#1974FF]"/><span>{item.guests} tamu</span></div>
                <div className="flex items-center gap-2 text-xs text-slate-600"><Layers3 size={15} className="text-[#1974FF]"/><span>{item.quantity} unit</span></div>
              </div>
              {line && <>
                <p className="mt-2 text-xs text-slate-600">{unifiedApprovalLabels[line.approval]} · {unifiedFulfillmentLabels[line.fulfillment]}
                  {line.review_open && " · Tinjauan Finance terbuka"}</p>
                <p className="text-xs text-[#0A2E63]">Subtotal {rupiah(line.subtotal)} · Biaya layanan {rupiah(line.fee)}</p>
                <UnifiedItemActions item={line} canComplete={order.order_status === "confirmed" && order.payment_status === "paid"} />
              </>}
              {item.notes && <p className="mt-3 text-xs leading-5 text-slate-500">Catatan layanan: {item.notes}</p>}
              {vendor && vendorLink && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <div className="min-w-0"><p className="text-xs text-slate-500">Vendor/PIC</p><p className="break-words text-sm font-bold">{vendor.name}</p><p className="text-xs text-slate-600">+{vendor.whatsapp}</p></div>
                <a href={vendorLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 text-xs font-bold text-emerald-800">Hubungi Vendor</a>
              </div>}
              {!vendor && !vendorError && <p className="mt-3 text-xs text-slate-500">Kontak vendor belum tersedia untuk layanan ini.</p>}
            </article>
            );
          })}
        </div>
      </section>

      {experienceRequest && <ExperienceRequestReview record={experienceRequest as Parameters<typeof ExperienceRequestReview>[0]["record"]}/>}

      <BookingOperations bookingId={order.id} unified={Boolean(unified)} orderStatus={order.order_status} paymentStatus={order.payment_status} totalAmount={Number(order.total_amount)} customerName={order.customer_name} customerWhatsapp={order.customer_whatsapp} customerEmail={order.customer_email ?? ""} customerNotes={order.customer_notes ?? ""} />

      <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs leading-5 text-orange-900">
        Status booking dan pembayaran dapat dikelola melalui panel operasional di atas. Total tagihan dihitung server dari harga katalog saat booking dibuat.
      </div>
    </div>
  );
}

