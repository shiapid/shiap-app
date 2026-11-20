"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { globalStayCalendarHref, stayHref } from "@/lib/admin/stay-navigation";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, LockKeyhole, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ServiceType = "trip" | "stay" | "activity" | "documentation";
type CalendarBookingItem = { id: string; service_type: ServiceType; service_name: string; date_start: string; date_end: string | null; guests: number; quantity: number; property_id?: string | null; room_type_id?: string | null };
export type CalendarBookingRecord = { id: string; order_number: string; customer_name: string; order_status: string; payment_status: string; booking_items: CalendarBookingItem[] };
export type CalendarBlockRecord = { id: string; service_type: ServiceType; service_id: string | null; start_date: string; end_date: string; reason: string; created_at: string };
type ServiceOption = { id: string; title: string; location?: string };
type Catalogs = { trip: ServiceOption[]; stay: ServiceOption[]; activity: ServiceOption[]; documentation: ServiceOption[] };
type CalendarEvent = { id: string; kind: "booking" | "block"; serviceType: ServiceType; title: string; startDate: string; endDate: string; subtitle: string; orderNumber?: string; customerName?: string; blockId?: string; reason?: string; status?: string; propertyId?: string | null; roomId?: string | null };
type StayReservation = { item_id: string; order_number: string; property_id: string; room_id: string; room_name: string; property_name: string; starts_on: string; ends_before: string; units: number; held: boolean };
type StayRoomBlock = { id: string; room_type_id: string; starts_on: string; ends_on: string; blocked_units: number | null; reason: string; stay_room_types: { name: string; property_id: string; stay_properties: { name: string } } };

const categoryLabels: Record<ServiceType, string> = { trip: "Trip", stay: "Stay", activity: "Wahana", documentation: "Shinema" };
const categoryColors: Record<ServiceType, string> = { trip: "bg-blue-100 text-blue-900", stay: "bg-emerald-100 text-emerald-900", activity: "bg-cyan-100 text-cyan-900", documentation: "bg-violet-100 text-violet-900" };
const weekDays = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function shiftDate(value: string, amount: number) { const [year, month, day] = value.split("-").map(Number); const date = new Date(year, month - 1, day + amount); return dateKey(date); }
function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("id-ID", options).format(new Date(year, month - 1, day)); }

export default function BookingCalendar({ bookings, initialBlocks, catalogs, stayOnly, stayProperty, stayRoom, initialDate }: { bookings: CalendarBookingRecord[]; initialBlocks: CalendarBlockRecord[]; catalogs: Catalogs; stayOnly: boolean; stayProperty?: string; stayRoom?: string; initialDate: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [blocks, setBlocks] = useState<CalendarBlockRecord[]>(initialBlocks);
  const [month, setMonth] = useState(() => new Date(Number(initialDate.slice(0, 4)), Number(initialDate.slice(5, 7)) - 1, 1));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [stayEvents, setStayEvents] = useState<{ rangeStart: string; rows: CalendarEvent[]; error: boolean }>();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [blockType, setBlockType] = useState<ServiceType>("trip");
  const [blockServiceId, setBlockServiceId] = useState("");
  const [blockStart, setBlockStart] = useState(dateKey(new Date()));
  const [blockEnd, setBlockEnd] = useState(dateKey(new Date()));
  const [blockReason, setBlockReason] = useState("");

  const rangeStart = shiftDate(dateKey(month), -7);
  const rangeEnd = shiftDate(dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1)), 7);
  const staySnapshot = stayEvents?.rangeStart === rangeStart ? stayEvents : undefined;

  useEffect(() => {
    let current = true;
    void Promise.all([
      supabase.rpc("admin_stay_calendar_reservations", { p_start: rangeStart, p_end: rangeEnd }),
      supabase.from("stay_room_inventory_blocks")
        .select("id,room_type_id,starts_on,ends_on,blocked_units,reason,stay_room_types!inner(name,property_id,stay_properties(name))")
        .lt("starts_on", rangeEnd).gte("ends_on", rangeStart),
    ]).then(([reservations, roomBlocks]) => {
      if (!current) return;
      setStayEvents({ rangeStart, error: Boolean(reservations.error || roomBlocks.error), rows: [
        ...((reservations.data ?? []) as StayReservation[]).map((row): CalendarEvent => ({
          id: `stay:${row.item_id}`, kind: "booking", serviceType: "stay",
          propertyId: row.property_id, roomId: row.room_id, title: `${row.property_name} · ${row.room_name}`,
          startDate: row.starts_on, endDate: shiftDate(row.ends_before, -1), subtitle: `${row.units} unit`,
          orderNumber: row.order_number, status: row.held ? "Hold aktif" : "Dikonfirmasi",
        })),
        ...((roomBlocks.data ?? []) as unknown as StayRoomBlock[]).map((row): CalendarEvent => ({
          id: `room-block:${row.id}`, kind: "block", serviceType: "stay", title: `${row.stay_room_types.stay_properties.name} · ${row.stay_room_types.name}`,
          propertyId: row.stay_room_types.property_id, roomId: row.room_type_id,
          startDate: row.starts_on, endDate: row.ends_on, reason: row.reason,
          subtitle: row.blocked_units === null ? "Tutup tipe kamar" : `${row.blocked_units} unit diblokir`,
        })),
      ]});
    }).catch(() => {
      if (current) setStayEvents({ rangeStart, rows: [], error: true });
    });
    return () => { current = false; };
  }, [rangeStart, rangeEnd, supabase]);

  const events = useMemo<CalendarEvent[]>(() => {
    const bookingEvents = bookings.flatMap((booking) => booking.booking_items.filter(item => item.service_type !== "stay" ||
      ["pending_confirmation", "confirmed", "completed"].includes(booking.order_status)).map((item) => ({
      id: `${booking.id}:${item.id}`,
      kind: "booking" as const,
      serviceType: item.service_type,
      title: item.service_name,
      startDate: item.date_start,
      endDate: item.service_type === "stay" && item.date_end ? shiftDate(item.date_end, -1) : item.date_end || item.date_start,
      subtitle: `${item.quantity} unit · ${item.guests} tamu`,
      orderNumber: booking.order_number,
      customerName: booking.customer_name,
      status: "Lunas",
      propertyId: item.property_id, roomId: item.room_type_id,
    })));
    const blockEvents = blocks.map((block) => {
      const selectedService = block.service_id ? catalogs[block.service_type].find((service) => service.id === block.service_id) : null;
      return {
        id: `block:${block.id}`, kind: "block" as const, serviceType: block.service_type,
        title: selectedService ? selectedService.title : `Semua ${categoryLabels[block.service_type]}`,
        startDate: block.start_date, endDate: block.end_date,
        subtitle: block.reason, blockId: block.id, reason: block.reason, propertyId: block.service_id,
      };
    });
    return [...bookingEvents, ...blockEvents, ...(staySnapshot?.rows ?? [])].filter(event => !stayOnly ||
      (event.serviceType === "stay" && (!stayProperty || !event.propertyId || event.propertyId === stayProperty)));
  }, [bookings, blocks, catalogs, staySnapshot, stayOnly, stayProperty]);

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(month);
  const leadingDays = (month.getDay() + 6) % 7;
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((leadingDays + dayCount) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - leadingDays + 1));
  const selectedEvents = events.filter((event) => event.startDate <= selectedDate && event.endDate >= selectedDate);
  const selectedBookings = selectedEvents.filter((event) => event.kind === "booking");
  const currentOptions = catalogs[blockType];

  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(dateKey(next));
  }

  function openBlockForm() {
    setBlockStart(selectedDate); setBlockEnd(selectedDate); setBlockType(stayOnly ? "stay" : "trip"); setBlockServiceId(stayProperty ?? "");
    setBlockReason(""); setError(""); setNotice(""); setShowForm(true);
  }

  async function saveBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    if (!blockStart || !blockEnd || blockEnd < blockStart) { setError("Tanggal akhir harus sama atau setelah tanggal awal."); setSaving(false); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Sesi admin berakhir. Silakan masuk kembali."); setSaving(false); return; }
    const { data, error: insertError } = await supabase.from("calendar_date_blocks").insert({
      service_type: blockType,
      service_id: blockServiceId || null,
      start_date: blockStart,
      end_date: blockEnd,
      reason: blockReason.trim() || "Diblokir oleh admin",
      created_by: auth.user.id,
    }).select("id,service_type,service_id,start_date,end_date,reason,created_at").single();
    if (insertError) setError(insertError.message);
    else {
      setBlocks((current) => [...current, data as CalendarBlockRecord]);
      setShowForm(false);
      setNotice("Tanggal berhasil diblokir. Booking baru untuk layanan dan tanggal tersebut akan ditolak.");
    }
    setSaving(false);
  }

  async function removeBlock(blockId: string) {
    setDeletingId(blockId); setError(""); setNotice("");
    const { error: deleteError } = await supabase.from("calendar_date_blocks").delete().eq("id", blockId);
    if (deleteError) setError(deleteError.message);
    else { setBlocks((current) => current.filter((block) => block.id !== blockId)); setNotice("Blokir tanggal dihapus."); }
    setDeletingId(null);
  }

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold tracking-[0.2em] text-[#1974FF]">OPERASIONAL / KALENDER</p><h1 className="mt-2 text-2xl font-extrabold text-[#0A2E63]">Kalender Booking</h1><p className="mt-1 text-sm text-slate-500">Agenda semua layanan, termasuk hold dan blokir unit Stay.</p></div><button type="button" onClick={openBlockForm} className="inline-flex items-center gap-2 rounded-xl bg-[#FF8518] px-4 py-3 text-xs font-extrabold text-[#0A2E63]"><Plus size={16}/>Blokir tanggal</button></div>
    <nav aria-label="Filter layanan kalender" className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-[#1265D8]">
      <Link href={`/admin/calendar?date=${selectedDate}`} aria-current={stayOnly ? undefined : "page"} className={`inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 ${stayOnly ? "bg-white" : "bg-blue-50"}`}>Semua layanan</Link>
      <Link href={globalStayCalendarHref({ date: selectedDate })} aria-current={stayOnly ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 ${stayOnly ? "bg-blue-50" : "bg-white"}`}>Stay{stayProperty ? ` · ${catalogs.stay.find(item => item.id === stayProperty)?.title}` : ""}</Link>
      <Link href={stayHref("calendar", { property: stayProperty, room: stayRoom, date: selectedDate })} className="inline-flex min-h-11 items-center px-2">Lihat stok Stay per malam →</Link>
    </nav>
    {staySnapshot?.error && <p role="alert" className="mt-3 text-xs text-red-700">Hold atau blokir unit Stay gagal dimuat.</p>}
    {notice && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-2">{Object.entries(categoryLabels).map(([key, label]) => <span key={key} className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${categoryColors[key as ServiceType]}`}>{label}</span>)}<span className="rounded-full bg-orange-100 px-3 py-1.5 text-[10px] font-bold text-orange-900">Blokir manual</span></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5"><button type="button" onClick={() => changeMonth(-1)} aria-label="Bulan sebelumnya" className="rounded-lg border border-slate-200 p-2 text-[#0A2E63] hover:bg-slate-50"><ChevronLeft size={17}/></button><h2 className="flex items-center gap-2 text-sm font-bold capitalize text-[#0A2E63]"><CalendarDays size={17} className="text-[#1974FF]"/>{monthLabel}</h2><button type="button" onClick={() => changeMonth(1)} aria-label="Bulan berikutnya" className="rounded-lg border border-slate-200 p-2 text-[#0A2E63] hover:bg-slate-50"><ChevronRight size={17}/></button></header>
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">{weekDays.map((day) => <div key={day} className="py-2 text-center text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">{day}</div>)}</div>
        <div className="grid grid-cols-7">{cells.map((date, index) => {
          const key = dateKey(date); const inMonth = date.getMonth() === month.getMonth();
          const dayEvents = events.filter((item) => item.startDate <= key && item.endDate >= key);
          const isSelected = selectedDate === key;
          return <button type="button" key={`${key}-${index}`} onClick={() => setSelectedDate(key)} className={`min-h-24 border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-32 sm:p-2 ${isSelected ? "bg-blue-50/70 ring-2 ring-inset ring-[#1974FF]" : "hover:bg-slate-50"} ${inMonth ? "" : "bg-slate-50/60"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold sm:text-xs ${isSelected ? "bg-[#1974FF] text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>{date.getDate()}</span>
            <div className="mt-1 space-y-1">{dayEvents.slice(0, 2).map((item) => <span key={item.id} className={`block truncate rounded px-1 py-0.5 text-[8px] font-bold sm:text-[9px] ${item.kind === "block" ? "bg-orange-100 text-orange-900" : categoryColors[item.serviceType]}`} title={`${item.title} · ${item.subtitle}`}>{item.kind === "block" ? <LockKeyhole className="mr-0.5 inline" size={9}/> : null}{item.title}</span>)}{dayEvents.length > 2 && <span className="block px-1 text-[8px] font-semibold text-slate-400">+{dayEvents.length - 2} lainnya</span>}</div>
          </button>;
        })}</div>
      </section>

      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-20"><p className="text-[10px] font-bold uppercase tracking-widest text-[#1974FF]">Agenda tanggal</p><h2 className="mt-1 text-lg font-extrabold text-[#0A2E63]">{formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
        {selectedEvents.length ? <div className="mt-4 space-y-3">{selectedEvents.map((item) => <article key={item.id} className={`rounded-xl border p-3 ${item.kind === "block" ? "border-orange-200 bg-orange-50/70" : "border-slate-100 bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.kind === "block" ? "bg-orange-200 text-orange-950" : categoryColors[item.serviceType]}`}>{item.kind === "block" ? "Diblokir" : categoryLabels[item.serviceType]}</span>{item.kind === "block" && item.blockId && <button type="button" onClick={() => void removeBlock(item.blockId!)} disabled={deletingId === item.blockId} aria-label="Hapus blokir" className="rounded-md p-1 text-red-600 hover:bg-red-100 disabled:opacity-50">{deletingId === item.blockId ? <LoaderCircle size={14} className="animate-spin"/> : <Trash2 size={14}/>}</button>}</div><h3 className="mt-2 text-xs font-bold text-[#0A2E63]">{item.title}</h3>{item.kind === "booking" ? <><p className="mt-1 text-[10px] text-slate-600">{item.customerName ? `${item.customerName} · ` : ""}{item.subtitle}</p><p className={`mt-1 text-[10px] font-bold ${item.status === "Hold aktif" ? "text-amber-800" : "text-green-700"}`}>{item.status} · {item.orderNumber}</p></> : <><p className="mt-1 text-[10px] text-slate-600">{item.roomId ? `${item.subtitle} · ` : ""}{item.reason}</p>{item.roomId && <Link href={stayHref("blocks", { property: item.propertyId ?? undefined, room: item.roomId, date: selectedDate })} className="inline-flex min-h-9 items-center text-[11px] font-bold text-[#1265D8]">Kelola blokir kamar →</Link>}<p className="mt-1 text-[10px] text-slate-500">{formatDate(item.startDate)} – {formatDate(item.endDate)}</p></>}</article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Tidak ada booking, hold, atau blokir pada tanggal ini.</p>}
        {selectedBookings.length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Booking terbayar tetap tercatat dan tidak berubah saat admin membuat blokir tanggal.</p>}
      </aside>
    </div>

    {showForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center sm:p-6"><form onSubmit={(event) => void saveBlock(event)} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-orange-700">MANUAL BLOCK</p><h2 className="mt-1 text-lg font-extrabold text-[#0A2E63]">Blokir tanggal layanan</h2></div><button type="button" onClick={() => setShowForm(false)} aria-label="Tutup" className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></header><div className="space-y-4 p-5"><p className="rounded-xl bg-orange-50 p-3 text-[11px] leading-relaxed text-orange-900">Booking aktif atau terbayar yang bertabrakan tidak dapat diblokir. Setelah tersimpan, sistem menolak booking baru yang mencakup tanggal ini.</p><label className="block text-xs font-semibold text-slate-600">Kategori layanan<select value={blockType} onChange={(event) => { setBlockType(event.target.value as ServiceType); setBlockServiceId(""); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0A2E63]"><option value="trip">Trip</option><option value="stay">Stay</option><option value="activity">Wahana</option><option value="documentation">Shinema</option></select></label><label className="block text-xs font-semibold text-slate-600">Layanan / cakupan<select value={blockServiceId} onChange={(event) => setBlockServiceId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0A2E63]"><option value="">Semua {categoryLabels[blockType]}</option>{currentOptions.map((service) => <option key={service.id} value={service.id}>{service.title}{service.location ? ` · ${service.location}` : ""}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-slate-400">Pilih satu layanan atau blokir seluruh kategori.</span></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-600">Dari tanggal<input required type="date" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label><label className="block text-xs font-semibold text-slate-600">Sampai tanggal<input required type="date" min={blockStart} value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label></div><label className="block text-xs font-semibold text-slate-600">Alasan / catatan<textarea value={blockReason} onChange={(event) => setBlockReason(event.target.value)} minLength={3} maxLength={240} rows={2} placeholder="Contoh: perawatan alat atau kondisi cuaca" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label></div><footer className="flex justify-end gap-2 border-t border-slate-100 p-4"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Batal</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0A2E63] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15}/> : <LockKeyhole size={15}/>}Simpan blokir</button></footer></form></div>}
  </div>;
}
