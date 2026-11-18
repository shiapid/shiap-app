"use client";

import Link from "next/link";
import { bookingItemCategory, bookingServiceFilter } from "@/lib/admin/booking-category";
import BookingWhatsApp from "@/components/admin/booking-whatsapp";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, Filter, MoreVertical, Search, SlidersHorizontal, Users, X } from "lucide-react";

type BookingItem = {
  id: string;
  service_type: string;
  service_category: string | null;
  service_name: string;
  date_start: string;
  date_end: string | null;
  guests: number;
  quantity: number;
};
type Booking = {
  reviewOverdue?: boolean;
  id: string;
  order_number: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string | null;
  order_status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
  inventory_hold_expires_at: string | null;
  booking_items: BookingItem[];
};
type ServiceType = "all" | "trip" | "stay" | "activity" | "rental" | "documentation";

const orderLabels: Record<string, string> = { pending_confirmation: "Menunggu Konfirmasi", confirmed: "Terkonfirmasi", rejected: "Ditolak", cancelled: "Dibatalkan", completed: "Selesai", expired: "Kedaluwarsa" };
const paymentLabels: Record<string, string> = { unpaid: "Belum Dibayar", pending: "Menunggu Pembayaran", paid: "Lunas", failed: "Gagal", refunded: "Dikembalikan" };
const orderColors: Record<string, string> = { pending_confirmation: "bg-amber-50 text-amber-800 ring-amber-200", confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-200", rejected: "bg-red-50 text-red-800 ring-red-200", cancelled: "bg-slate-100 text-slate-700 ring-slate-200", completed: "bg-blue-50 text-[#0A2E63] ring-blue-200", expired: "bg-slate-100 text-slate-600 ring-slate-200" };
const paymentColors: Record<string, string> = { unpaid: "text-slate-500", pending: "text-amber-700", paid: "text-emerald-700", failed: "text-red-700", refunded: "text-slate-500" };
const serviceTabs: { id: ServiceType; label: string }[] = [{ id: "all", label: "Semua Booking" }, { id: "trip", label: "Strip" }, { id: "stay", label: "Stay" }, { id: "activity", label: "Activity" }, { id: "rental", label: "Rental" }, { id: "documentation", label: "Shinema" }];
const serviceCategoryLabels: Record<string, string> = { trip: "Strip", stay: "Stay", activity: "Activity", rental: "Rental", documentation: "Shinema", other: "Lainnya" };
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
function dateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }).format(new Date(value));
}
function todayMakassar() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

export default function BookingListClient({
  bookings,
  initialSearch = "",
  initialStatus = "all",
  initialPayment = "all",
  initialService = "all",
  initialSchedule = "all",
}: {
  bookings: Booking[];
  initialSearch?: string;
  initialStatus?: string;
  initialPayment?: string;
  initialService?: string;
  initialSchedule?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [orderStatus, setOrderStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPayment);
  const [serviceType, setServiceType] = useState<ServiceType>(bookingServiceFilter(initialService));
  const [dateRange, setDateRange] = useState("all");
  const [schedule, setSchedule] = useState(initialSchedule);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuBooking, setMenuBooking] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    // Keep topbar search and overview shortcuts in sync while the route is mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(initialSearch);
    setOrderStatus(initialStatus);
    setPaymentStatus(initialPayment);
    setServiceType(bookingServiceFilter(initialService));
    setSchedule(initialSchedule);
  }, [initialSearch, initialStatus, initialPayment, initialService, initialSchedule]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ServiceType, number> = { all: bookings.length, trip: 0, stay: 0, activity: 0, rental: 0, documentation: 0 };
    for (const booking of bookings) {
      for (const type of ["trip", "stay", "activity", "rental", "documentation"] as const) {
        if (booking.booking_items.some((item) => bookingItemCategory(item) === type)) counts[type] += 1;
      }
    }
    return counts;
  }, [bookings]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const today = todayMakassar();
    const dateLimit = new Date();
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 0;
    if (days) dateLimit.setDate(dateLimit.getDate() - days);
    const limitISO = days ? dateLimit.toISOString() : "";
    const scheduleLimitDate = new Date(`${today}T00:00:00Z`);
    scheduleLimitDate.setUTCDate(scheduleLimitDate.getUTCDate() + 2);
    const scheduleEnd = scheduleLimitDate.toISOString().slice(0, 10);

    return bookings.filter((booking) => {
      const values = [booking.order_number, booking.id, booking.customer_name, booking.customer_whatsapp, booking.customer_email ?? "", ...booking.booking_items.map((item) => item.service_name)];
      const matchesSearch = !term || values.some((value) => value.toLocaleLowerCase().includes(term));
      const matchesOrder = orderStatus === "all" || booking.order_status === orderStatus;
      const matchesPayment = paymentStatus === "all" || booking.payment_status === paymentStatus;
      const matchesService = serviceType === "all" || booking.booking_items.some((item) => bookingItemCategory(item) === serviceType);
      const matchesCreatedRange = !days || booking.created_at >= limitISO;
      const matchesSchedule = schedule !== "2d" || (["pending_confirmation", "confirmed", "completed"].includes(booking.order_status) && booking.booking_items.some((item) => bookingItemCategory(item) === "trip" && item.date_start >= today && item.date_start <= scheduleEnd));
      return matchesSearch && matchesOrder && matchesPayment && matchesService && matchesCreatedRange && matchesSchedule;
    });
  }, [bookings, search, orderStatus, paymentStatus, serviceType, dateRange, schedule]);

  useEffect(() => {
    // Reset pagination when the visible result set changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, orderStatus, paymentStatus, serviceType, dateRange, schedule]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((booking) => selected.includes(booking.id));
  const selectedBookings = filtered.filter((booking) => selected.includes(booking.id));

  function exportCSV() {
    const rows = selectedBookings.length ? selectedBookings : filtered;
    const columns = ["Kode Booking", "ID", "Layanan", "Produk", "Pelanggan", "WhatsApp", "Email", "Total", "Status Booking", "Status Pembayaran", "Tanggal Dibuat", "Tanggal Layanan"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [columns.map(escape).join(","), ...rows.map((booking) => [booking.order_number, booking.id, booking.booking_items.map(bookingItemCategory).join(" | "), booking.booking_items.map((item) => item.service_name).join(" | "), booking.customer_name, booking.customer_whatsapp, booking.customer_email ?? "", booking.total_amount, orderLabels[booking.order_status] ?? booking.order_status, paymentLabels[booking.payment_status] ?? booking.payment_status, dateTime(booking.created_at), booking.booking_items.map((item) => dateOnly(item.date_start)).join(" | ")].map(escape).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shiap-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setSearch(""); setOrderStatus("all"); setPaymentStatus("all"); setServiceType("all"); setDateRange("all"); setSchedule("all"); setSelected([]);
  }

  return <div className="space-y-5">
    {bookings.some((order) => order.reviewOverdue) && <section role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"><p className="font-bold">{bookings.filter((order) => order.reviewOverdue).length} pesanan melewati batas tindak lanjut verifikasi.</p><p>Periksa mutasi bank dan selesaikan review agar reservasi tidak tertahan tanpa keputusan.</p><button type="button" onClick={() => { clearFilters(); setPaymentStatus("pending"); }} className="mt-1 min-h-11 font-bold underline">Tampilkan antrean verifikasi</button></section>}
    <section className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[9px] font-extrabold tracking-[.2em] text-[#1974FF]">OPERATIONS / BOOKING CENTER</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0A2E63]">Booking Center</h2><p className="mt-1 text-sm text-slate-500">Pantau booking Trip, Stay, Activity, dan Shinema dari satu tempat.</p></div>
      <span className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-[#1974FF]">{filtered.length.toLocaleString("id-ID")} dari {bookings.length.toLocaleString("id-ID")} booking</span>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_3px_14px_rgba(10,46,99,.035)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 sm:p-4">
        <div className="flex max-w-full gap-1 overflow-x-auto">{serviceTabs.map((tab) => <button key={tab.id} type="button" onClick={() => setServiceType(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-bold transition sm:px-3.5 ${serviceType === tab.id ? "bg-[#0A2E63] text-white shadow-sm" : "text-slate-500 hover:bg-blue-50 hover:text-[#0A2E63]"}`}><span>{tab.label}</span><span className={`rounded-md px-1.5 py-0.5 text-[9px] ${serviceType === tab.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{categoryCounts[tab.id]}</span></button>)}</div>
        <button type="button" onClick={exportCSV} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[10px] font-bold text-[#0A2E63] transition hover:border-blue-200 hover:bg-blue-50"><Download size={14}/><span className="hidden sm:inline">Ekspor CSV</span><span className="sm:hidden">Ekspor</span></button>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto] sm:items-center sm:p-4">
        <label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari booking, pelanggan, produk, atau ID..." className="h-10 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] pl-9 pr-3 text-xs outline-none transition focus:border-[#1974FF] focus:bg-white focus:ring-2 focus:ring-blue-100"/></label>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-500"><CalendarDays size={15} className="shrink-0 text-[#1974FF]"/><select aria-label="Rentang tanggal dibuat" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="w-full bg-transparent text-[10px] font-semibold text-[#0A2E63] outline-none"><option value="all">Semua waktu</option><option value="7d">7 hari terakhir</option><option value="30d">30 hari terakhir</option><option value="90d">90 hari terakhir</option></select><ChevronDown size={13}/></label>
        <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[10px] font-bold transition ${filtersOpen ? "border-[#1974FF] bg-blue-50 text-[#0A2E63]" : "border-slate-200 text-[#0A2E63] hover:bg-slate-50"}`}><Filter size={15}/> Filter {(orderStatus !== "all" || paymentStatus !== "all" || schedule !== "all") && <span className="h-1.5 w-1.5 rounded-full bg-[#FF8518]"/>}</button>
      </div>

      {filtersOpen && <div className="grid gap-3 border-t border-slate-100 bg-[#FAFBFD] p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
        <label className="text-[10px] font-bold text-slate-500">Status booking<select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0A2E63] outline-none focus:border-[#1974FF]"><option value="all">Semua status</option>{Object.entries(orderLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-[10px] font-bold text-slate-500">Status pembayaran<select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0A2E63] outline-none focus:border-[#1974FF]"><option value="all">Semua pembayaran</option>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-[10px] font-bold text-slate-500">Kategori layanan<select value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0A2E63] outline-none focus:border-[#1974FF]">{serviceTabs.map((tab)=><option key={tab.id} value={tab.id}>{tab.label}</option>)}</select></label>
        <label className="text-[10px] font-bold text-slate-500">Jadwal layanan<select value={schedule} onChange={(event) => setSchedule(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0A2E63] outline-none focus:border-[#1974FF]"><option value="all">Semua tanggal layanan</option><option value="2d">Trip 2 hari ke depan</option></select></label>
        <div className="flex items-end justify-between sm:col-span-2 lg:col-span-4"><span className="text-[10px] text-slate-400">Filter diterapkan langsung pada booking dan layanan terkait.</span><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-[#0A2E63]"><X size={13}/>Atur ulang</button></div>
      </div>}

      {selectedBookings.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 bg-blue-50/80 px-4 py-3"><span className="text-[10px] font-bold text-[#0A2E63]">{selectedBookings.length} booking dipilih</span><button type="button" onClick={exportCSV} className="inline-flex items-center gap-2 rounded-lg bg-[#1974FF] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#0A2E63]"><Download size={13}/>Ekspor pilihan</button></div>}

      {pageRows.length ? <>
        <div className="hidden overflow-x-auto border-t border-slate-100 xl:block"><table className="w-full min-w-[1120px] text-left"><thead className="bg-[#F7F9FD] text-[9px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Pilih semua booking pada halaman" checked={allVisibleSelected} onChange={() => setSelected((current) => allVisibleSelected ? current.filter((id) => !pageRows.some((booking) => booking.id === id)) : [...new Set([...current, ...pageRows.map((booking) => booking.id)])])} className="h-4 w-4 accent-[#1974FF]"/></th><th className="px-2 py-3">Kode Booking</th><th className="px-3 py-3">Layanan</th><th className="px-3 py-3">Pelanggan</th><th className="px-3 py-3">Produk / Jadwal</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Pembayaran</th><th className="px-3 py-3">Tanggal</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.map((booking)=><tr key={booking.id} className="transition hover:bg-blue-50/35">
          <td className="px-4 py-3"><input type="checkbox" aria-label={`Pilih ${booking.order_number}`} checked={selected.includes(booking.id)} onChange={() => setSelected((current)=>current.includes(booking.id)?current.filter((id)=>id!==booking.id):[...current,booking.id])} className="h-4 w-4 accent-[#1974FF]"/></td>
          <td className="px-2 py-3"><Link href={`/admin/bookings/${booking.id}`} className="text-[10px] font-extrabold text-[#0A2E63] hover:text-[#1974FF]">{booking.order_number}</Link><span className="mt-1 block font-mono text-[8px] text-slate-400">ID: {booking.id.slice(0,8)}</span></td>
          <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{[...new Set(booking.booking_items.map(bookingItemCategory))].map((type)=><span key={type} className={`rounded-lg px-2 py-1 text-[9px] font-bold ${type === "stay" ? "bg-cyan-50 text-cyan-800" : type === "activity" ? "bg-emerald-50 text-emerald-800" : type === "documentation" ? "bg-violet-50 text-violet-800" : "bg-blue-50 text-[#1974FF]"}`}>{serviceCategoryLabels[type] ?? type}</span>)}</div></td>
          <td className="px-3 py-3"><p className="max-w-36 truncate text-[10px] font-bold text-[#0A2E63]">{booking.customer_name}</p><p className="mt-1 whitespace-nowrap text-[9px] text-slate-500">{booking.customer_whatsapp}</p></td>
          <td className="px-3 py-3"><p className="max-w-56 truncate text-[10px] font-semibold text-[#0A2E63]">{booking.booking_items.map((item)=>item.service_name).join(", ") || "Layanan SHIAP"}</p><p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500"><CalendarDays size={11}/>{booking.booking_items.map((item)=>dateOnly(item.date_start)).join(" · ")}<span className="ml-1 inline-flex items-center gap-0.5"><Users size={10}/>{booking.booking_items.reduce((total,item)=>total+item.guests,0)} pax</span></p></td>
          <td className="whitespace-nowrap px-3 py-3 text-[10px] font-extrabold text-[#0A2E63]">{rupiah(booking.total_amount)}</td>
          <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-bold ring-1 ring-inset ${orderColors[booking.order_status] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>{orderLabels[booking.order_status] ?? booking.order_status}</span>{booking.order_status === "pending_confirmation" && booking.payment_status === "unpaid" && booking.inventory_hold_expires_at && <span className="mt-1 block whitespace-nowrap text-[8px] font-semibold text-orange-700">Hold s.d. {dateTime(booking.inventory_hold_expires_at)}</span>}</td>
          <td className={`whitespace-nowrap px-3 py-3 text-[9px] font-bold ${paymentColors[booking.payment_status] ?? "text-slate-500"}`}>{booking.payment_status === "paid" && <Check size={13} className="mr-1 inline"/>}{paymentLabels[booking.payment_status] ?? booking.payment_status}</td>
          <td className="whitespace-nowrap px-3 py-3 text-[9px] text-slate-500">{dateTime(booking.created_at)}</td>
          <td className="relative px-3 py-3 text-right"><div className="inline-flex items-center gap-1"><BookingWhatsApp bookingId={booking.id}/><Link href={`/admin/bookings/${booking.id}`} title="Lihat detail" aria-label={`Lihat detail ${booking.order_number}`} className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-[#1974FF]"><Eye size={15}/></Link><button type="button" aria-label={`Aksi ${booking.order_number}`} aria-expanded={menuBooking===booking.id} onClick={()=>setMenuBooking((current)=>current===booking.id?null:booking.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><MoreVertical size={15}/></button></div>{menuBooking===booking.id&&<div className="absolute right-10 top-10 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"><Link href={`/admin/bookings/${booking.id}`} className="block rounded-lg px-3 py-2 text-[10px] font-semibold text-[#0A2E63] hover:bg-blue-50">Buka detail booking</Link><button type="button" onClick={()=>{void navigator.clipboard.writeText(booking.order_number);setMenuBooking(null);}} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-semibold text-[#0A2E63] hover:bg-blue-50">Salin kode booking</button></div>}</td>
        </tr>)}</tbody></table></div>

        <div className="divide-y divide-slate-100 border-t border-slate-100 xl:hidden">{pageRows.map((booking)=><article key={booking.id} className="flex items-start gap-3 p-4"><input type="checkbox" aria-label={`Pilih ${booking.order_number}`} checked={selected.includes(booking.id)} onChange={() => setSelected((current)=>current.includes(booking.id)?current.filter((id)=>id!==booking.id):[...current,booking.id])} className="mt-1 h-4 w-4 shrink-0 accent-[#1974FF]"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><Link href={`/admin/bookings/${booking.id}`} className="break-all text-[10px] font-extrabold text-[#0A2E63]">{booking.order_number}</Link><p className="mt-1 text-xs font-bold text-[#0A2E63]">{booking.customer_name}</p><p className="mt-0.5 text-[10px] text-slate-500">{booking.customer_whatsapp}</p></div><span className="text-right text-[10px] font-extrabold text-[#0A2E63]">{rupiah(booking.total_amount)}<span className="mt-1 block text-[9px] font-medium text-slate-400">{dateTime(booking.created_at)}</span></span></div><p className="mt-3 truncate text-[10px] font-semibold text-slate-700">{booking.booking_items.map((item)=>item.service_name).join(", ")}</p><div className="mt-2 flex flex-wrap items-center gap-2"><BookingWhatsApp bookingId={booking.id}/>{[...new Set(booking.booking_items.map(bookingItemCategory))].map((type)=><span key={type} className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-bold text-[#1974FF]">{serviceCategoryLabels[type] ?? type}</span>)}<span className={`rounded-lg px-2 py-1 text-[9px] font-bold ring-1 ring-inset ${orderColors[booking.order_status] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>{orderLabels[booking.order_status] ?? booking.order_status}</span><span className={`text-[9px] font-bold ${paymentColors[booking.payment_status] ?? "text-slate-500"}`}>{paymentLabels[booking.payment_status] ?? booking.payment_status}</span><Link href={`/admin/bookings/${booking.id}`} className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold text-[#1974FF]">Detail<ChevronRight size={13}/></Link></div></div></article>)}</div>
      </> : <div className="border-t border-slate-100 p-10 text-center"><SlidersHorizontal className="mx-auto text-slate-300" size={27}/><p className="mt-3 text-sm font-bold text-[#0A2E63]">Booking tidak ditemukan</p><p className="mt-1 text-xs text-slate-500">Ubah kata pencarian atau atur ulang filter untuk melihat hasil lainnya.</p><button type="button" onClick={clearFilters} className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-bold text-[#1974FF]">Atur ulang filter</button></div>}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-[#FAFBFD] px-4 py-3"><p className="text-[10px] text-slate-500">Menampilkan <strong className="text-[#0A2E63]">{filtered.length ? (page-1)*pageSize+1 : 0}–{Math.min(page*pageSize,filtered.length)}</strong> dari <strong className="text-[#0A2E63]">{filtered.length}</strong> booking</p><div className="flex items-center gap-1.5"><button type="button" disabled={page<=1} onClick={()=>setPage((current)=>Math.max(1,current-1))} aria-label="Halaman sebelumnya" className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-40"><ChevronLeft size={14}/></button><span className="px-2 text-[10px] font-semibold text-slate-500">{page} / {totalPages}</span><button type="button" disabled={page>=totalPages} onClick={()=>setPage((current)=>Math.min(totalPages,current+1))} aria-label="Halaman berikutnya" className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-40"><ChevronRight size={14}/></button></div></footer>
    </section>
  </div>;
}
