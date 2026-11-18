"use client";

import Link from "next/link";
import { bookingItemCategory, bookingServiceFilter } from "@/lib/admin/booking-category";
import BookingWhatsApp from "@/components/admin/booking-whatsapp";
import { canArchiveBooking, canRemoveBookingFromList } from "@/lib/admin/booking-eligibility";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, Filter, LoaderCircle, MoreVertical, RotateCcw, Search, SlidersHorizontal, Trash2, Users, X } from "lucide-react";

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
  archived_at: string | null; archived_by: string | null; archived_by_name: string | null; archive_reason: string | null;
  deleted_at: string | null; deleted_by: string | null; deleted_by_name: string | null; deletion_reason: string | null; deleted_from_scope: string | null;
  restored_at: string | null; restored_by: string | null; restored_by_name: string | null; restoration_count: number;
  hasPendingProof: boolean;
  booking_items: BookingItem[];
};
type ServiceType = "all" | "trip" | "stay" | "activity" | "rental" | "documentation";
type BookingScope = "active" | "archived" | "trash";
type BookingAction = "archive" | "remove" | "restore";

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

function BookingRowActions({ booking, scope, onAction }: { booking: Booking; scope: BookingScope; onAction: (action: BookingAction, ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const canArchive = scope === "active" && canArchiveBooking(booking);
  const canRemove = scope !== "trash" && canRemoveBookingFromList(booking);
  return <div className="relative inline-flex">
    <button type="button" aria-label={`Aksi ${booking.order_number}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="min-h-10 min-w-10 rounded-lg p-2 text-slate-500 hover:bg-slate-100"><MoreVertical size={15}/></button>
    {open && <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
      <Link href={`/admin/bookings/${booking.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[10px] font-semibold text-[#0A2E63] hover:bg-blue-50">Buka detail booking</Link>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(booking.order_number); setOpen(false); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-[10px] font-semibold text-[#0A2E63] hover:bg-blue-50">Salin kode booking</button>
      {scope === "active" && <button type="button" disabled={!canArchive} title={!canArchive ? "Hanya booking final tanpa bukti menunggu verifikasi yang dapat diarsipkan." : undefined} onClick={() => { setOpen(false); onAction("archive", [booking.id]); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-semibold text-[#0A2E63] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><Archive size={13}/> Arsipkan Booking</button>}
      {scope !== "trash" && <button type="button" disabled={!canRemove} title={!canRemove ? "Booking belum final, menunggu verifikasi, atau memiliki pembayaran yang dipertahankan." : undefined} onClick={() => { setOpen(false); onAction("remove", [booking.id]); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={13}/> Hapus dari Daftar</button>}
      {scope === "trash" && <button type="button" onClick={() => { setOpen(false); onAction("restore", [booking.id]); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-semibold text-[#1265D8] hover:bg-blue-50"><RotateCcw size={13}/> Pulihkan</button>}
    </div>}
  </div>;
}

export default function BookingListClient({
  bookings,
  scope,
  scopeCounts,
  initialSearch = "",
  initialStatus = "all",
  initialPayment = "all",
  initialService = "all",
  initialSchedule = "all",
}: {
  bookings: Booking[];
  scope: BookingScope;
  scopeCounts: Record<BookingScope, number>;
  initialSearch?: string;
  initialStatus?: string;
  initialPayment?: string;
  initialService?: string;
  initialSchedule?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [orderStatus, setOrderStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPayment);
  const [serviceType, setServiceType] = useState<ServiceType>(bookingServiceFilter(initialService));
  const [dateRange, setDateRange] = useState("all");
  const [schedule, setSchedule] = useState(initialSchedule);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [, setMenuBooking] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionIntent, setActionIntent] = useState<{ action: BookingAction; ids: string[] } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSummary, setActionSummary] = useState<{ succeeded: number; failed: number; details: string[] } | null>(null);
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
  const visibleEligible = pageRows.filter((booking) => scope === "trash" || (scope === "active" ? canArchiveBooking(booking) : canRemoveBookingFromList(booking)));
  const allVisibleSelected = visibleEligible.length > 0 && visibleEligible.every((booking) => selected.includes(booking.id));
  const selectedBookings = filtered.filter((booking) => selected.includes(booking.id));

  function perform(action: BookingAction, ids: string[]) {
    setActionIntent({ action, ids }); setActionReason(""); setActionError(""); setActionSummary(null); setMenuBooking(null);
  }

  async function confirmAction() {
    if (!actionIntent) return;
    if (actionReason.trim().length < 3) { setActionError("Alasan wajib diisi minimal 3 karakter."); return; }
    setActionBusy(true); setActionError("");
    try {
      const response = await fetch("/api/admin/bookings/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_ids: actionIntent.ids, action: actionIntent.action, scope, reason: actionReason.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Tindakan gagal diproses.");
      const failedRows = (result.results || []).filter((row: { result: string }) => row.result !== "success");
      setActionSummary({ succeeded: result.succeeded, failed: result.failed, details: failedRows.map((row: { message: string }) => row.message) });
      if (failedRows.length) setActionIntent({ ...actionIntent, ids: failedRows.map((row: { booking_id: string }) => row.booking_id) });
      if (result.succeeded) { setSelected((current) => current.filter((id) => !actionIntent.ids.includes(id))); router.refresh(); }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Tindakan gagal diproses."); }
    finally { setActionBusy(false); }
  }

  function exportCSV() {
    const rows = selectedBookings.length ? selectedBookings : filtered;
    const columns = ["Kode Booking", "ID", "Layanan", "Produk", "Pelanggan", "WhatsApp", "Email", "Total", "Status Booking", "Status Pembayaran", "Tanggal Dibuat", "Tanggal Layanan", ...(scope === "archived" ? ["Tanggal Arsip", "Admin Arsip", "Alasan Arsip"] : []), ...(scope === "trash" ? ["Tanggal Tempat Sampah", "Admin", "Alasan", "Scope Pemulihan"] : [])];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [columns.map(escape).join(","), ...rows.map((booking) => [booking.order_number, booking.id, booking.booking_items.map(bookingItemCategory).join(" | "), booking.booking_items.map((item) => item.service_name).join(" | "), booking.customer_name, booking.customer_whatsapp, booking.customer_email ?? "", booking.total_amount, orderLabels[booking.order_status] ?? booking.order_status, paymentLabels[booking.payment_status] ?? booking.payment_status, dateTime(booking.created_at), booking.booking_items.map((item) => dateOnly(item.date_start)).join(" | "), ...(scope === "archived" ? [booking.archived_at ? dateTime(booking.archived_at) : "", booking.archived_by_name ?? booking.archived_by ?? "", booking.archive_reason ?? ""] : []), ...(scope === "trash" ? [booking.deleted_at ? dateTime(booking.deleted_at) : "", booking.deleted_by_name ?? booking.deleted_by ?? "", booking.deletion_reason ?? "", booking.deleted_from_scope ?? ""] : [])].map(escape).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shiap-bookings-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setSearch(""); setOrderStatus("all"); setPaymentStatus("all"); setServiceType("all"); setDateRange("all"); setSchedule("all"); setSelected([]);
  }

  const actionText = actionIntent?.action === "archive" ? "Arsipkan" : actionIntent?.action === "remove" ? "Hapus dari Daftar" : "Pulihkan";

  return <div className="space-y-5">
    {bookings.some((order) => order.reviewOverdue) && <section role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"><p className="font-bold">{bookings.filter((order) => order.reviewOverdue).length} pesanan melewati batas tindak lanjut verifikasi.</p><p>Periksa mutasi bank dan selesaikan review agar reservasi tidak tertahan tanpa keputusan.</p><button type="button" onClick={() => { clearFilters(); setPaymentStatus("pending"); }} className="mt-1 min-h-11 font-bold underline">Tampilkan antrean verifikasi</button></section>}
    <section className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[9px] font-extrabold tracking-[.2em] text-[#1974FF]">OPERATIONS / BOOKING CENTER</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0A2E63]">Booking Center</h2><p className="mt-1 text-sm text-slate-500">Pantau booking Trip, Stay, Activity, dan Shinema dari satu tempat.</p></div>
      <span className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-[#1974FF]">{filtered.length.toLocaleString("id-ID")} dari {bookings.length.toLocaleString("id-ID")} booking</span>
    </section>

    <nav aria-label="Status daftar booking" className="flex flex-wrap gap-2">
      {([ ["active", "Booking Aktif"], ["archived", "Diarsipkan"], ["trash", "Tempat Sampah"] ] as const).map(([value, label]) => <Link key={value} href={`/admin/bookings?scope=${value}`} aria-current={scope === value ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold ${scope === value ? "border-[#1265D8] bg-[#1265D8] text-white" : "border-slate-200 bg-white text-[#0A2E63] hover:bg-blue-50"}`}>
        {value === "archived" ? <Archive size={14}/> : value === "trash" ? <Trash2 size={14}/> : <CalendarDays size={14}/>}{label}<span className={`rounded-md px-1.5 py-0.5 text-[9px] ${scope === value ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{scopeCounts[value]}</span>
      </Link>)}
    </nav>

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

      {selectedBookings.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 bg-blue-50/80 px-4 py-3"><span className="text-[10px] font-bold text-[#0A2E63]">{selectedBookings.length} booking dipilih</span><div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportCSV} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#1265D8] px-3 py-2 text-[10px] font-bold text-white"><Download size={13}/>Ekspor pilihan</button>
        {scope === "active" && <><button type="button" onClick={() => perform("archive", selectedBookings.map((item) => item.id))} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[10px] font-bold text-[#0A2E63]"><Archive size={13}/>Arsipkan pilihan</button><button type="button" onClick={() => perform("remove", selectedBookings.map((item) => item.id))} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-bold text-red-700"><Trash2 size={13}/>Hapus dari daftar</button></>}
        {scope === "archived" && <button type="button" onClick={() => perform("remove", selectedBookings.map((item) => item.id))} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-bold text-red-700"><Trash2 size={13}/>Hapus dari daftar</button>}
        {scope === "trash" && <button type="button" onClick={() => perform("restore", selectedBookings.map((item) => item.id))} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[10px] font-bold text-[#1265D8]"><RotateCcw size={13}/>Pulihkan pilihan</button>}
      </div></div>}

      {pageRows.length ? <>
        <div className="hidden overflow-x-auto border-t border-slate-100 xl:block"><table className="w-full min-w-[1120px] text-left"><thead className="bg-[#F7F9FD] text-[9px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Pilih semua booking yang memenuhi syarat pada halaman" checked={allVisibleSelected} onChange={() => setSelected((current) => allVisibleSelected ? current.filter((id) => !visibleEligible.some((booking) => booking.id === id)) : [...new Set([...current, ...visibleEligible.map((booking) => booking.id)])])} className="h-4 w-4 accent-[#1974FF]"/></th><th className="px-2 py-3">Kode Booking</th><th className="px-3 py-3">Layanan</th><th className="px-3 py-3">Pelanggan</th><th className="px-3 py-3">Produk / Jadwal</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Pembayaran</th><th className="px-3 py-3">Tanggal</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.map((booking)=><tr key={booking.id} className="transition hover:bg-blue-50/35">
          <td className="px-4 py-3"><input type="checkbox" aria-label={`Pilih ${booking.order_number}`} checked={selected.includes(booking.id)} onChange={() => setSelected((current)=>current.includes(booking.id)?current.filter((id)=>id!==booking.id):[...current,booking.id])} className="h-4 w-4 accent-[#1974FF]"/></td>
          <td className="px-2 py-3"><Link href={`/admin/bookings/${booking.id}`} className="text-[10px] font-extrabold text-[#0A2E63] hover:text-[#1974FF]">{booking.order_number}</Link><span className="mt-1 block font-mono text-[8px] text-slate-400">ID: {booking.id.slice(0,8)}</span></td>
          <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{[...new Set(booking.booking_items.map(bookingItemCategory))].map((type)=><span key={type} className={`rounded-lg px-2 py-1 text-[9px] font-bold ${type === "stay" ? "bg-cyan-50 text-cyan-800" : type === "activity" ? "bg-emerald-50 text-emerald-800" : type === "documentation" ? "bg-violet-50 text-violet-800" : "bg-blue-50 text-[#1974FF]"}`}>{serviceCategoryLabels[type] ?? type}</span>)}</div></td>
          <td className="px-3 py-3"><p className="max-w-36 truncate text-[10px] font-bold text-[#0A2E63]">{booking.customer_name}</p><p className="mt-1 whitespace-nowrap text-[9px] text-slate-500">{booking.customer_whatsapp}</p></td>
          <td className="px-3 py-3"><p className="max-w-56 truncate text-[10px] font-semibold text-[#0A2E63]">{booking.booking_items.map((item)=>item.service_name).join(", ") || "Layanan SHIAP"}</p><p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500"><CalendarDays size={11}/>{booking.booking_items.map((item)=>dateOnly(item.date_start)).join(" · ")}<span className="ml-1 inline-flex items-center gap-0.5"><Users size={10}/>{booking.booking_items.reduce((total,item)=>total+item.guests,0)} pax</span></p></td>
          <td className="whitespace-nowrap px-3 py-3 text-[10px] font-extrabold text-[#0A2E63]">{rupiah(booking.total_amount)}</td>
          <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-bold ring-1 ring-inset ${orderColors[booking.order_status] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>{orderLabels[booking.order_status] ?? booking.order_status}</span>{booking.order_status === "pending_confirmation" && booking.payment_status === "unpaid" && booking.inventory_hold_expires_at && <span className="mt-1 block whitespace-nowrap text-[8px] font-semibold text-orange-700">Hold s.d. {dateTime(booking.inventory_hold_expires_at)}</span>}</td>
          <td className={`whitespace-nowrap px-3 py-3 text-[9px] font-bold ${paymentColors[booking.payment_status] ?? "text-slate-500"}`}>{booking.payment_status === "paid" && <Check size={13} className="mr-1 inline"/>}{paymentLabels[booking.payment_status] ?? booking.payment_status}</td>
          <td className="px-3 py-3 text-[9px] text-slate-500">{dateTime(booking.created_at)}{scope === "archived" && <div className="mt-1 max-w-48 whitespace-normal text-[8px] text-slate-400">Arsip: {booking.archived_at ? dateTime(booking.archived_at) : "—"} · {booking.archived_by_name || "Admin"}<br/>Alasan: {booking.archive_reason || "—"}</div>}{scope === "trash" && <div className="mt-1 max-w-48 whitespace-normal text-[8px] text-slate-400">Dihapus dari daftar: {booking.deleted_at ? dateTime(booking.deleted_at) : "—"} · {booking.deleted_by_name || "Admin"}<br/>Alasan: {booking.deletion_reason || "—"}</div>}</td>
          <td className="relative px-3 py-3 text-right"><div className="inline-flex items-center gap-1"><BookingWhatsApp bookingId={booking.id}/><Link href={`/admin/bookings/${booking.id}`} title="Lihat detail" aria-label={`Lihat detail ${booking.order_number}`} className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-[#1974FF]"><Eye size={15}/></Link><BookingRowActions booking={booking} scope={scope} onAction={perform}/></div></td>
        </tr>)}</tbody></table></div>

        <div className="divide-y divide-slate-100 border-t border-slate-100 xl:hidden">{pageRows.map((booking)=><article key={booking.id} className="flex items-start gap-3 p-4"><input type="checkbox" aria-label={`Pilih ${booking.order_number}`} checked={selected.includes(booking.id)} onChange={() => setSelected((current)=>current.includes(booking.id)?current.filter((id)=>id!==booking.id):[...current,booking.id])} className="mt-1 h-4 w-4 shrink-0 accent-[#1974FF]"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><Link href={`/admin/bookings/${booking.id}`} className="break-all text-[10px] font-extrabold text-[#0A2E63]">{booking.order_number}</Link><p className="mt-1 text-xs font-bold text-[#0A2E63]">{booking.customer_name}</p><p className="mt-0.5 text-[10px] text-slate-500">{booking.customer_whatsapp}</p></div><span className="text-right text-[10px] font-extrabold text-[#0A2E63]">{rupiah(booking.total_amount)}<span className="mt-1 block text-[9px] font-medium text-slate-400">{dateTime(booking.created_at)}</span></span></div><p className="mt-3 truncate text-[10px] font-semibold text-slate-700">{booking.booking_items.map((item)=>item.service_name).join(", ")}</p>{scope === "archived" && <p className="mt-2 break-words rounded-lg bg-blue-50 p-2 text-[9px] text-slate-600">Diarsipkan {booking.archived_at ? dateTime(booking.archived_at) : "—"} · {booking.archived_by_name || "Admin"}<br/>Alasan: {booking.archive_reason || "—"}</p>}{scope === "trash" && <p className="mt-2 break-words rounded-lg bg-red-50 p-2 text-[9px] text-slate-600">Dihapus dari daftar {booking.deleted_at ? dateTime(booking.deleted_at) : "—"} · {booking.deleted_by_name || "Admin"}<br/>Alasan: {booking.deletion_reason || "—"}</p>}<div className="mt-2 flex flex-wrap items-center gap-2"><BookingWhatsApp bookingId={booking.id}/>{[...new Set(booking.booking_items.map(bookingItemCategory))].map((type)=><span key={type} className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-bold text-[#1974FF]">{serviceCategoryLabels[type] ?? type}</span>)}<span className={`rounded-lg px-2 py-1 text-[9px] font-bold ring-1 ring-inset ${orderColors[booking.order_status] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>{orderLabels[booking.order_status] ?? booking.order_status}</span><span className={`text-[9px] font-bold ${paymentColors[booking.payment_status] ?? "text-slate-500"}`}>{paymentLabels[booking.payment_status] ?? booking.payment_status}</span><Link href={`/admin/bookings/${booking.id}`} className="ml-auto inline-flex min-h-10 items-center gap-1 text-[9px] font-bold text-[#1974FF]">Detail</Link><BookingRowActions booking={booking} scope={scope} onAction={perform}/></div></div></article>)}</div>
      </> : <div className="border-t border-slate-100 p-10 text-center"><SlidersHorizontal className="mx-auto text-slate-300" size={27}/><p className="mt-3 text-sm font-bold text-[#0A2E63]">Booking tidak ditemukan</p><p className="mt-1 text-xs text-slate-500">Ubah kata pencarian atau atur ulang filter untuk melihat hasil lainnya.</p><button type="button" onClick={clearFilters} className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-bold text-[#1974FF]">Atur ulang filter</button></div>}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-[#FAFBFD] px-4 py-3"><p className="text-[10px] text-slate-500">Menampilkan <strong className="text-[#0A2E63]">{filtered.length ? (page-1)*pageSize+1 : 0}–{Math.min(page*pageSize,filtered.length)}</strong> dari <strong className="text-[#0A2E63]">{filtered.length}</strong> booking</p><div className="flex items-center gap-1.5"><button type="button" disabled={page<=1} onClick={()=>setPage((current)=>Math.max(1,current-1))} aria-label="Halaman sebelumnya" className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-40"><ChevronLeft size={14}/></button><span className="px-2 text-[10px] font-semibold text-slate-500">{page} / {totalPages}</span><button type="button" disabled={page>=totalPages} onClick={()=>setPage((current)=>Math.min(totalPages,current+1))} aria-label="Halaman berikutnya" className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-40"><ChevronRight size={14}/></button></div></footer>
    </section>
    {actionIntent && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="booking-action-title" className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl">
      <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${actionIntent.action === "remove" ? "bg-red-50 text-red-700" : "bg-blue-50 text-[#1265D8]"}`}>{actionIntent.action === "archive" ? <Archive size={18}/> : actionIntent.action === "remove" ? <Trash2 size={18}/> : <RotateCcw size={18}/>}</span><div><h3 id="booking-action-title" className="text-base font-extrabold text-[#0A2E63]">{actionSummary ? "Hasil tindakan booking" : actionText + (actionIntent.ids.length > 1 ? ` · ${actionIntent.ids.length} booking` : "")}</h3><p className="mt-1 text-xs leading-relaxed text-slate-600">{actionIntent.action === "remove" ? "Hapus booking ini dari daftar aktif? Data transaksi tidak akan dihapus dari database dan dapat dipulihkan. Pembayaran, Finance, voucher, status, dan kapasitas tetap utuh." : actionIntent.action === "archive" ? "Arsipkan booking final? Arsip hanya mengubah daftar dan dapat ditinjau kembali. Data transaksi tetap tersimpan." : "Pulihkan booking ke scope asalnya. Status tidak berubah dan sistem tidak membuat ulang inventory hold atau instruksi pembayaran."}</p></div></div>
      {!actionSummary && actionIntent.ids.slice(0, 3).map((id) => { const booking = bookings.find((item) => item.id === id); return booking ? <div key={id} className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"><p><strong>Kode:</strong> {booking.order_number}</p><p><strong>Pelanggan:</strong> {booking.customer_name}</p><p><strong>Status:</strong> {orderLabels[booking.order_status] || booking.order_status} · {paymentLabels[booking.payment_status] || booking.payment_status}</p></div> : null; })}
      {!actionSummary && actionIntent.ids.length > 3 && <p className="mt-2 text-[10px] text-slate-500">dan {actionIntent.ids.length - 3} booking terpilih lainnya</p>}
      {actionSummary && <div role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><p className="font-bold text-[#0A2E63]">Berhasil: {actionSummary.succeeded} · Gagal: {actionSummary.failed}</p>{actionSummary.details.map((detail, index) => <p key={index} className="mt-1 text-red-700">{detail}</p>)}</div>}
      {!actionSummary && <label className="mt-4 block text-xs font-bold text-slate-600">Alasan tindakan<input value={actionReason} onChange={(event) => setActionReason(event.target.value)} maxLength={500} placeholder="Tulis alasan operasional" className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1265D8]"/></label>}
      {actionError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{actionError}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={actionBusy} onClick={() => { setActionIntent(null); setActionSummary(null); }} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600">{actionSummary ? "Tutup" : "Batal"}</button>{!actionSummary && <button type="button" disabled={actionBusy} onClick={() => void confirmAction()} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-60 ${actionIntent.action === "remove" ? "bg-red-700" : "bg-[#1265D8]"}`}>{actionBusy ? <LoaderCircle size={14} className="animate-spin"/> : actionIntent.action === "remove" ? <Trash2 size={14}/> : actionIntent.action === "archive" ? <Archive size={14}/> : <RotateCcw size={14}/>} Konfirmasi {actionText}</button>}</div>
    </section></div>}
  </div>;
}
