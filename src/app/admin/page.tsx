import Link from "next/link";
import { bookingItemCategory } from "@/lib/admin/booking-category";
import { ArrowRight, ArrowUpRight, BedDouble, CalendarDays, Camera, CheckCircle2, Clock3, ClipboardList, Ship, Users, Waves, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DashboardItem = { id: string; service_type: string; service_category: string | null; service_name: string; date_start: string; date_end: string | null; guests: number; quantity: number };
type DashboardBooking = { id: string; order_number: string; customer_name: string; customer_whatsapp: string; order_status: string; payment_status: string; total_amount: number; created_at: string; booking_items: DashboardItem[] };

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const statusNames: Record<string, string> = { pending_confirmation: "Menunggu Konfirmasi", confirmed: "Terkonfirmasi", completed: "Selesai", cancelled: "Dibatalkan", rejected: "Ditolak", expired: "Kedaluwarsa" };
const statusColors: Record<string, string> = { pending_confirmation: "bg-amber-50 text-amber-800 ring-amber-200", confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-200", completed: "bg-blue-50 text-[#0A2E63] ring-blue-200", cancelled: "bg-slate-100 text-slate-600 ring-slate-200", rejected: "bg-red-50 text-red-800 ring-red-200", expired: "bg-slate-100 text-slate-600 ring-slate-200" };

function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function formatDate(key: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" }).format(new Date(value));
}

export default async function AdminPage() {
  const supabase = await createClient();
  await supabase.rpc("expire_booking_holds");
  const [bookingResult, profileResult, contactResult, tripResult, stayResult, experienceResult] = await Promise.all([
    supabase.from("booking_orders").select("id,order_number,customer_name,customer_whatsapp,order_status,payment_status,total_amount,created_at,booking_items(id,service_type,service_category,service_name,date_start,date_end,guests,quantity)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id"),
    supabase.from("admin_customer_contacts").select("id"),
    supabase.from("trip_packages").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("stay_properties").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("shiap_experiences").select("id,experience_type", { count: "exact" }).eq("status", "published"),
  ]);

  const bookings = (bookingResult.data ?? []) as DashboardBooking[];
  const today = localDateKey(new Date());
  const inTwoDays = shiftDateKey(today, 2);
  const sevenDaysAgo = shiftDateKey(today, -6);
  const fourteenDaysAgo = shiftDateKey(today, -13);
  const previousSevenDaysEnd = shiftDateKey(today, -7);
  const activeStatuses = ["pending_confirmation", "confirmed", "completed"];
  const activeBookings = bookings.filter((booking) => activeStatuses.includes(booking.order_status));
  const countService = (type: string) => bookings.filter((booking) => booking.booking_items?.some((item) => bookingItemCategory(item) === type)).length;
  const paidBookings = bookings.filter((booking) => booking.payment_status === "paid" && !["cancelled", "rejected", "expired"].includes(booking.order_status));
  const totalRevenue = paidBookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0);
  const customers = new Set([...(profileResult.data ?? []).map((profile) => `account:${profile.id}`), ...(contactResult.data ?? []).map((contact) => `contact:${contact.id}`)]).size;
  const activityCount = (experienceResult.data ?? []).filter((item) => item.experience_type === "activity").length;
  const shinemaCount = (experienceResult.data ?? []).filter((item) => item.experience_type === "documentation").length;

  const itemsToday = activeBookings.flatMap((booking) => (booking.booking_items ?? []).filter((item) => item.date_start === today).map((item) => ({ ...item, order_number: booking.order_number, customer_name: booking.customer_name, order_status: booking.order_status })));
  const tripsSoon = activeBookings.flatMap((booking) => (booking.booking_items ?? []).filter((item) => bookingItemCategory(item) === "trip" && item.date_start > today && item.date_start <= inTwoDays).map((item) => ({ ...item, order_number: booking.order_number })));
  const waitingPayment = bookings.filter((booking) => activeStatuses.includes(booking.order_status) && booking.payment_status === "unpaid").length;
  const waitingConfirmation = bookings.filter((booking) => booking.order_status === "pending_confirmation").length;
  const waitingVerification = bookings.filter((booking) => activeStatuses.includes(booking.order_status) && booking.payment_status === "pending").length;
  const reminderCount = Number(waitingPayment > 0) + Number(waitingConfirmation > 0) + Number(tripsSoon.length > 0);

  const daily = Array.from({ length: 7 }, (_, index) => {
    const key = shiftDateKey(today, index - 6);
    const dayBookings = bookings.filter((booking) => localDateKey(new Date(booking.created_at)) === key);
    return { key, label: formatDate(key), count: dayBookings.length, revenue: dayBookings.filter((booking) => booking.payment_status === "paid" && !["cancelled", "rejected", "expired"].includes(booking.order_status)).reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0) };
  });
  const previousPeriodBookings = bookings.filter((booking) => { const day = localDateKey(new Date(booking.created_at)); return day >= fourteenDaysAgo && day <= previousSevenDaysEnd; }).length;
  const currentPeriodBookings = bookings.filter((booking) => localDateKey(new Date(booking.created_at)) >= sevenDaysAgo).length;
  const previousRevenue = bookings.filter((booking) => { const day = localDateKey(new Date(booking.created_at)); return booking.payment_status === "paid" && !["cancelled", "rejected", "expired"].includes(booking.order_status) && day >= fourteenDaysAgo && day <= previousSevenDaysEnd; }).reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0);
  const currentRevenue = daily.reduce((sum, day) => sum + day.revenue, 0);
  const bookingChange = previousPeriodBookings ? Math.round(((currentPeriodBookings - previousPeriodBookings) / previousPeriodBookings) * 100) : null;
  const revenueChange = previousRevenue ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100) : null;
  const peakBookings = Math.max(1, ...daily.map((day) => day.count));
  const peakRevenue = Math.max(1, ...daily.map((day) => day.revenue));

  const statusCounts = [
    { label: "Terkonfirmasi", count: bookings.filter((booking) => ["confirmed", "completed"].includes(booking.order_status)).length, color: "#16A34A" },
    { label: "Menunggu Verifikasi", count: bookings.filter((booking) => booking.order_status === "pending_confirmation" && booking.payment_status === "pending").length, color: "#FFB020" },
    { label: "Menunggu Konfirmasi", count: bookings.filter((booking) => booking.order_status === "pending_confirmation" && booking.payment_status !== "pending").length, color: "#5B9BFF" },
    { label: "Dibatalkan / tutup", count: bookings.filter((booking) => ["cancelled", "rejected", "expired"].includes(booking.order_status)).length, color: "#F05252" },
  ];
  const statusTotal = statusCounts.reduce((sum, item) => sum + item.count, 0);
  let angle = 0;
  const segments = statusTotal ? statusCounts.map((item) => {
    const start = angle;
    angle += item.count / statusTotal * 360;
    return `${item.color} ${start}deg ${angle}deg`;
  }).join(",") : "#E2E8F0 0deg 360deg";
  const serviceTotals = [
    { label: "Strip", value: countService("trip"), icon: Ship, color: "bg-blue-50 text-[#1974FF]" },
    { label: "Stay", value: countService("stay"), icon: BedDouble, color: "bg-cyan-50 text-cyan-800" },
    { label: "Aktivitas", value: countService("activity"), icon: Waves, color: "bg-emerald-50 text-emerald-800" },
    { label: "Rental", value: countService("rental"), icon: Package, color: "bg-violet-50 text-violet-800" },
    { label: "Shinema", value: countService("documentation"), icon: Camera, color: "bg-orange-50 text-orange-800" },
  ];
  const activeServiceTotal = (tripResult.count ?? 0) + (stayResult.count ?? 0) + activityCount + shinemaCount;
  const recent = bookings.slice(0, 6);
  const revenuePoints = daily.map((day, index) => `${index * 50},${52 - (day.revenue / peakRevenue) * 42}`).join(" ");

  return <div className="space-y-5 lg:space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[9px] font-extrabold tracking-[.2em] text-[#1974FF]">OVERVIEW / SHIAP OPERATIONS</p><h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#0A2E63] sm:text-[27px]">Selamat Datang, Admin</h2><p className="mt-1 text-xs text-slate-500 sm:text-sm">Kelola pemesanan Strip, Stay, Activity, Rental, dan Shinema dalam satu sistem.</p></div><Link href="/admin/bookings" className="inline-flex items-center gap-2 rounded-xl bg-[#1974FF] px-4 py-2.5 text-[10px] font-bold text-white shadow-md shadow-blue-900/10 transition hover:bg-[#0A2E63]">Buka Booking Center<ArrowUpRight size={14}/></Link></section>
    {bookingResult.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Data booking gagal dimuat: {bookingResult.error.message}</p>}

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <article className="relative col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A2E63] via-[#1265D8] to-[#1974FF] p-4 text-white shadow-lg shadow-blue-900/10 sm:p-5 xl:col-span-2"><div className="absolute -bottom-9 right-0 h-24 w-52 rounded-full border border-white/15"/><div className="relative flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold text-blue-100">Total Booking</p><p className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{bookingResult.error ? "—" : bookings.length.toLocaleString("id-ID")}</p><p className="mt-1 text-[9px] text-blue-100">{bookingChange === null ? `${waitingConfirmation} menunggu konfirmasi` : `vs 7 hari sebelumnya · ${bookingChange >= 0 ? "+" : ""}${bookingChange}%`}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><ClipboardList size={21}/></span></div></article>
      {serviceTotals.map(({ label, value, icon: Icon, color })=><article key={label} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_3px_14px_rgba(10,46,99,.035)] sm:p-4"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon size={18}/></span><p className="mt-3 text-[10px] font-semibold text-slate-500">Booking {label}</p><p className="mt-0.5 text-2xl font-extrabold tracking-tight text-[#0A2E63]">{bookingResult.error ? "—" : value.toLocaleString("id-ID")}</p><p className="mt-1 text-[9px] text-slate-400">pesanan dengan layanan {label}</p></article>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
      <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(10,46,99,.035)] sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#1974FF]"><CalendarDays size={16}/></span><div><h3 className="text-xs font-extrabold text-[#0A2E63]">Aktivitas / Tamu Hari Ini</h3><p className="mt-0.5 text-[9px] text-slate-400">Jadwal layanan pada {formatDate(today,{weekday:"long",day:"numeric",month:"short",year:"numeric"})}</p></div></div><Link href={`/admin/bookings?schedule=2d`} className="text-[9px] font-bold text-[#1974FF]">Jadwal mendatang <ArrowRight size={12} className="ml-1 inline"/></Link></div>
        {itemsToday.length ? <div className="mt-3 divide-y divide-slate-100">{itemsToday.slice(0,4).map((item,index)=>{const category=bookingItemCategory(item);const Icon=category==="stay"?BedDouble:category==="activity"?Waves:category==="rental"?Package:category==="documentation"?Camera:Ship;return <Link key={`${item.id}-${index}`} href={`/admin/bookings?search=${encodeURIComponent(item.order_number)}`} className="flex items-center gap-2.5 py-2.5"><span className="h-8 w-1 shrink-0 rounded-full bg-[#1974FF]"/><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1974FF]"><Icon size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-[#0A2E63]">{item.service_name}</span><span className="mt-0.5 block truncate text-[9px] text-slate-500"><Users size={10} className="mr-1 inline"/>{item.guests} pax · {item.customer_name} · {item.order_number}</span></span><span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1.5 text-[9px] font-bold text-[#0A2E63]">{category==="stay"?"Check-in":"Hari ini"}</span></Link>;})}</div>:<div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center"><p className="text-[10px] font-semibold text-slate-600">Tidak ada layanan terjadwal hari ini</p><p className="mt-1 text-[9px] text-slate-400">Jadwal Trip, Stay, Activity, Rental, dan Shinema muncul di sini.</p></div>}
      </article>
      <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(10,46,99,.035)] sm:p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-[#E86B00]"><Clock3 size={16}/></span><div><h3 className="text-xs font-extrabold text-[#0A2E63]">Pengingat Operasional</h3><p className="mt-0.5 text-[9px] text-slate-400">Booking baru hari ini: {daily[6].count} · Menunggu verifikasi: {waitingVerification}</p></div></div><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FF8518] px-1.5 text-[9px] font-extrabold text-white">{reminderCount}</span></div><div className="mt-3 divide-y divide-slate-100">
        <Link href="/admin/bookings?payment=unpaid" className="flex items-center gap-2.5 py-3"><i className="h-2 w-2 shrink-0 rounded-full bg-[#FFB020]"/><span className="flex-1 text-[10px] font-semibold text-[#0A2E63]">{waitingPayment} booking menunggu pembayaran</span><ArrowRight size={14} className="text-slate-400"/></Link>
        <Link href="/admin/bookings?status=pending_confirmation" className="flex items-center gap-2.5 py-3"><i className="h-2 w-2 shrink-0 rounded-full bg-[#5B9BFF]"/><span className="flex-1 text-[10px] font-semibold text-[#0A2E63]">{waitingConfirmation} booking menunggu konfirmasi</span><ArrowRight size={14} className="text-slate-400"/></Link>
        <Link href="/admin/bookings?service=trip&schedule=2d" className="flex items-center gap-2.5 py-3"><i className="h-2 w-2 shrink-0 rounded-full bg-[#F05252]"/><span className="flex-1 text-[10px] font-semibold text-[#0A2E63]">{tripsSoon.length} jadwal Strip dalam 2 hari ke depan</span><ArrowRight size={14} className="text-slate-400"/></Link>
      </div></article>
    </section>

    <section className="grid gap-4 xl:grid-cols-3">
      <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(10,46,99,.035)] sm:p-5"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#1974FF]"><CheckCircle2 size={16}/></span><h3 className="text-xs font-extrabold text-[#0A2E63]">Total Pendapatan Lunas</h3></div><p className="mt-3 text-2xl font-extrabold tracking-tight text-[#0A2E63]">{bookingResult.error?"—":money(totalRevenue)}</p><p className="mt-1 text-[9px] text-slate-400">Booking berstatus lunas · {paidBookings.length} pembayaran</p><div className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">{revenueChange===null?(currentRevenue?"Baru pada 7 hari ini":"Belum ada pemasukan baru"):`${revenueChange>=0?"↑":"↓"} ${Math.abs(revenueChange)}% vs 7 hari sebelumnya`}</div><svg viewBox="0 0 300 60" preserveAspectRatio="none" className="pointer-events-none absolute bottom-4 right-4 h-14 w-[45%] text-[#1974FF]/30"><polyline points={revenuePoints} fill="none" stroke="#1974FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><polyline points={`0,60 ${revenuePoints} 300,60`} fill="#1974FF" fillOpacity=".08" stroke="none"/></svg></article>

      <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(10,46,99,.035)] sm:p-5"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#1974FF]"><ClipboardList size={16}/></span><h3 className="text-xs font-extrabold text-[#0A2E63]">Status Booking</h3></div><div className="mt-3 flex items-center gap-3"><div className="relative h-28 w-28 shrink-0 rounded-full" style={{background:`conic-gradient(${segments})`}}><div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white"><span className="text-xl font-extrabold text-[#0A2E63]">{bookings.length}</span><span className="text-[8px] font-semibold text-slate-400">Booking</span></div></div><div className="min-w-0 flex-1 space-y-2">{statusCounts.map((item)=> <div key={item.label} className="flex items-center gap-1.5"><i className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:item.color}}/><span className="min-w-0 flex-1 truncate text-[9px] text-slate-600">{item.label}</span><b className="text-[9px] text-[#0A2E63]">{item.count}</b><span className="w-8 text-right text-[8px] text-slate-400">{statusTotal?Math.round(item.count/statusTotal*100):0}%</span></div>)}</div></div></article>

      <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_14px_rgba(10,46,99,.035)] sm:p-5"><div className="flex items-start justify-between"><div><h3 className="text-xs font-extrabold text-[#0A2E63]">Booking 7 Hari Terakhir</h3><p className="mt-0.5 text-[9px] text-slate-400">Berdasarkan tanggal pesanan dibuat</p></div><span className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-bold text-[#1974FF]">{currentPeriodBookings} total</span></div><div className="mt-4 grid h-[118px] grid-cols-7 items-end gap-2 border-b border-slate-100 px-1">{daily.map((day,index)=><div key={day.key} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${day.label}: ${day.count} booking`}><span className="text-[8px] font-semibold text-slate-500">{day.count||""}</span><span className={`w-full max-w-7 rounded-t-md ${index===6?"bg-[#FF8518]":"bg-gradient-to-t from-[#1974FF] to-[#80B3FF]"}`} style={{height:`${Math.max(day.count?8:2,day.count/peakBookings*65)}%`}}/><span className="absolute"/><span className="text-[8px] text-slate-400">{day.label}</span></div>)}</div></article>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(10,46,99,.035)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5"><div><h3 className="text-xs font-extrabold text-[#0A2E63]">Booking Terbaru</h3><p className="mt-0.5 text-[9px] text-slate-400">Pelanggan: {profileResult.error||contactResult.error?"—":customers.toLocaleString("id-ID")} · Katalog aktif: {tripResult.error||stayResult.error||experienceResult.error?"—":activeServiceTotal}</p></div><Link href="/admin/bookings" className="inline-flex items-center gap-1.5 text-[9px] font-bold text-[#1974FF]">Lihat semua booking<ArrowRight size={12}/></Link></div>
      {recent.length?<div className="divide-y divide-slate-100">{recent.map((booking)=><Link key={booking.id} href={`/admin/bookings/${booking.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-blue-50/40 sm:grid-cols-[minmax(150px,1.2fr)_minmax(130px,1fr)_minmax(130px,1fr)_auto_auto] sm:px-5"><span className="min-w-0"><span className="block truncate text-[10px] font-bold text-[#0A2E63]">{booking.customer_name}</span><span className="mt-0.5 block truncate text-[8px] text-slate-400">{booking.order_number}</span></span><span className="hidden truncate text-[9px] text-slate-600 sm:block">{booking.booking_items?.[0]?.service_name??"Layanan SHIAP"}</span><span className="hidden text-[9px] text-slate-500 sm:block">{formatDateTime(booking.created_at)}</span><span className="text-right text-[10px] font-extrabold text-[#0A2E63]">{money(booking.total_amount)}</span><span className={`rounded-full px-2 py-1 text-[8px] font-bold ring-1 ring-inset ${statusColors[booking.order_status]??"bg-slate-50 text-slate-500 ring-slate-200"}`}>{statusNames[booking.order_status]??booking.order_status}</span></Link>)}</div>:<div className="p-8 text-center"><ClipboardList size={22} className="mx-auto text-slate-300"/><p className="mt-2 text-[10px] font-bold text-[#0A2E63]">Belum ada booking</p></div>}
    </section>
  </div>;
}
