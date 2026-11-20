"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { globalStayCalendarHref, isStayDate, stayHref, todayInStay, type StayContext } from "@/lib/admin/stay-navigation";

type Night = { night: string; total: number; booked: number; held: number; blocked: number; available: number; calendar_closed: boolean };
type RoomBlock = { id: string; starts_on: string; ends_on: string; blocked_units: number | null; reason: string; stay_room_types: { name: string } };
type CalendarBlock = { id: string; service_id: string | null; start_date: string; end_date: string; reason: string };
const readableDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
const input = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm";
const action = "inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-[#1265D8] disabled:opacity-50";
const days = 14;

function addDays(date: string, count: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + count);
  return day.toISOString().slice(0, 10);
}

export function StayRoomInventory({ view, context, roomName, propertyName, returnToCalendar }: {
  view: "calendar" | "blocks"; context: StayContext; roomName?: string; propertyName: string; returnToCalendar: boolean;
}) {
  const router = useRouter();
  const [today] = useState(todayInStay);
  const from = context.date ?? today;
  const { property, room, filter } = context;
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ revision: number; nights: Night[]; rooms: RoomBlock[]; blocks: CalendarBlock[]; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("maintenance");
  const data = snapshot?.revision === revision ? snapshot : null;

  useEffect(() => {
    if (!property) return;
    let current = true;
    const db = createClient();
    const last = addDays(from, days - 1);
    const roomBlocks = db.from("stay_room_inventory_blocks")
      .select("id,starts_on,ends_on,blocked_units,reason,stay_room_types!inner(name,property_id)")
      .eq("stay_room_types.property_id", property).lte("starts_on", last).gte("ends_on", from).order("starts_on");
    if (room) roomBlocks.eq("room_type_id", room);

    const request = view === "calendar" && room
      ? db.rpc("admin_stay_calendar_inventory", { p_room: room, p_start: from, p_end: addDays(from, days) })
          .then(({ data, error }) => ({ revision, nights: (data ?? []) as Night[], rooms: [], blocks: [], error: Boolean(error) }))
      : Promise.all([
          roomBlocks,
          db.from("calendar_date_blocks").select("id,service_id,start_date,end_date,reason").eq("service_type", "stay")
            .or(`service_id.eq.${property},service_id.is.null`).lte("start_date", last).gte("end_date", from).order("start_date"),
        ]).then(([rooms, blocks]) => ({
          revision, nights: [], rooms: (rooms.data ?? []) as unknown as RoomBlock[], blocks: blocks.data ?? [], error: Boolean(rooms.error || blocks.error),
        }));
    void Promise.resolve(request).then(result => {
      if (current) setSnapshot(result);
    }).catch(() => {
      if (current) setSnapshot({ revision, nights: [], rooms: [], blocks: [], error: true });
    });
    return () => { current = false; };
  }, [from, property, revision, room, view]);

  function changeDate(day: string) {
    if (isStayDate(day)) router.push(stayHref(view, { ...context, date: day }, returnToCalendar), { scroll: false });
  }

  async function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !property) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const start = String(fields.get("start") ?? "");
    const end = String(fields.get("end") || start);
    const units = room && mode === "maintenance" ? Number(fields.get("units")) : null;
    const reason = String(fields.get("reason") || "").trim();
    if (!isStayDate(start) || !isStayDate(end) || start < today || end < start || end > addDays(start, 364) ||
        reason.length < 3 || (units !== null && (!Number.isSafeInteger(units) || units < 1))) {
      setMessage("Periksa tanggal, jumlah unit, dan alasan blokir.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const db = createClient();
      let result;
      if (room) {
        result = await db.from("stay_room_inventory_blocks")
          .insert({ room_type_id: room, starts_on: start, ends_on: end, blocked_units: units, reason });
      } else {
        const { data: { user } } = await db.auth.getUser();
        if (!user) { setMessage("Sesi Admin berakhir. Silakan masuk kembali."); return; }
        result = await db.from("calendar_date_blocks").insert({
          service_type: "stay", service_id: property, start_date: start, end_date: end, reason, created_by: user.id,
        });
      }
      if (result.error) {
        setMessage(result.error.code === "P0001" ? result.error.message : "Blokir gagal disimpan.");
        return;
      }
      if (returnToCalendar) {
        router.push(stayHref("calendar", { property, room, date: start }), { scroll: false });
        return;
      }
      form.reset();
      if (start !== from) changeDate(start);
      else setRevision(value => value + 1);
      setMessage("Blokir disimpan.");
    } catch {
      setMessage("Blokir gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function reopen(id: string, kind: "room" | "property") {
    if (busy || !window.confirm("Lepas blokir untuk seluruh rentang tanggal ini?")) return;
    setBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: removed, error } = kind === "room"
        ? await db.from("stay_room_inventory_blocks").delete().eq("id", id).select("id").maybeSingle()
        : await db.from("calendar_date_blocks").delete().eq("id", id).eq("service_type", "stay").eq("service_id", property).select("id").maybeSingle();
      if (error || !removed) { setMessage("Blokir gagal dilepas."); return; }
      setRevision(value => value + 1);
      setMessage("Blokir dilepas. Stok mengikuti reservasi aktif dan blokir lain.");
    } catch {
      setMessage("Blokir gagal dilepas.");
    } finally {
      setBusy(false);
    }
  }

  const nights = data?.nights.filter(night => filter === "occupied" ? night.booked > 0 || night.held > 0 : filter === "full" ? night.available === 0 : true);
  const filters = [{ value: undefined, label: "Semua malam" }, { value: "occupied", label: "Terisi" }, { value: "full", label: "Stok habis" }] as const;

  return <section className="min-w-0 space-y-4 rounded-xl border border-blue-100 bg-slate-50 p-3 sm:p-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-bold text-[#0A2E63]">{view === "calendar" ? "Stok per malam" : "Kelola blokir tanggal"}</h2>
        <p className="text-xs text-slate-600">{propertyName}{roomName ? ` · ${roomName}` : ""}</p>
      </div>
      <label className="text-xs font-semibold">Mulai tampilan
        <input type="date" value={from} onChange={event => changeDate(event.target.value)} className={input}/>
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={action} onClick={() => changeDate(addDays(from, -days))}>← 14 hari</button>
      <button type="button" className={action} onClick={() => changeDate(today)}>Hari ini</button>
      <button type="button" className={action} onClick={() => changeDate(addDays(from, days))}>14 hari →</button>
      <button type="button" className={action} onClick={() => setRevision(value => value + 1)}>Perbarui</button>
    </div>
    {view === "calendar" && <nav aria-label="Filter kalender Stay" className="flex flex-wrap gap-2">
      {filters.map(item => <Link key={item.label} href={stayHref("calendar", { ...context, filter: item.value })} scroll={false}
        aria-current={filter === item.value ? "true" : undefined}
        className={filter === item.value ? "inline-flex min-h-11 items-center rounded-lg bg-[#1265D8] px-3 text-xs font-bold text-white" : action}>{item.label}</Link>)}
    </nav>}
    {!data && <p role="status" className="text-sm">Memuat data…</p>}
    {data?.error && <p role="alert" className="text-sm text-red-700">Data gagal dimuat. <button type="button" className="font-bold underline" onClick={() => setRevision(value => value + 1)}>Coba lagi</button></p>}
    {view === "calendar" && data && !data.error && (nights?.length ? <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {nights.map(night => <article key={night.night} className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div><h3 className="text-sm font-bold text-[#0A2E63]">{readableDate.format(new Date(night.night))}</h3>
          <p className="text-xs text-slate-500">{night.calendar_closed ? "Penutupan kalender" : `${night.total} unit total`}</p></div>
        <dl className="order-last grid min-w-0 basis-full grid-cols-4 gap-2 text-center text-[10px] sm:order-none sm:basis-auto sm:text-xs">
          {[["Tersedia",night.available],["Terpesan",night.booked],["Hold",night.held],["Diblokir",night.blocked]].map(([label, value]) =>
            <div key={label} className="rounded-md bg-slate-50 p-1 sm:px-3"><dt>{label}</dt><dd className="font-bold text-[#0A2E63]">{value}</dd></div>)}
        </dl>
        {night.night >= today && <Link href={stayHref("blocks", { ...context, date: night.night }, true)} className={action}>Blokir tanggal ini</Link>}
      </article>)}
    </div> : <p className="rounded-lg bg-white p-4 text-sm">Belum ada malam yang cocok dengan filter ini.</p>)}
    {view === "blocks" && <>
      <form onSubmit={createBlock} className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-2">
        {room && <label className="text-xs font-semibold">Tindakan<select value={mode} onChange={event => setMode(event.target.value)} className={input}>
          <option value="maintenance">Blokir sebagian unit</option><option value="closed">Tutup semua unit tipe ini</option>
        </select></label>}
        {!room && <p className="text-sm font-semibold sm:col-span-2">Tutup semua tipe kamar di properti ini</p>}
        {room && mode === "maintenance" && <label className="text-xs font-semibold">Jumlah unit diblokir
          <input name="units" type="number" min="1" step="1" defaultValue="1" required className={input}/>
        </label>}
        <label className="text-xs font-semibold">Malam pertama<input name="start" type="date" defaultValue={from < today ? today : from} required min={today} className={input}/></label>
        <label className="text-xs font-semibold">Malam terakhir (opsional)<input name="end" type="date" min={today} className={input}/></label>
        <label className="text-xs font-semibold sm:col-span-2">Alasan internal<input name="reason" required minLength={3} maxLength={240} className={input}/></label>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-[#1265D8] px-3 text-xs font-bold text-white disabled:opacity-50">Simpan blokir</button>
        {returnToCalendar && <Link href={stayHref("calendar", context)} className={action}>Kembali ke kalender</Link>}
      </form>
      {message && <p role="status" className="text-sm text-[#0A2E63]">{message}</p>}
      {data && !data.error && !data.rooms.length && !data.blocks.length && <p className="text-sm text-slate-600">Belum ada blokir dalam rentang tampilan.</p>}
      {data?.rooms.map(block => <div key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <p className="min-w-0 break-words"><strong>{block.stay_room_types.name}</strong> · {block.starts_on} – {block.ends_on} · {block.blocked_units === null ? "Ditutup" : `${block.blocked_units} unit`} · {block.reason}</p>
        <button type="button" disabled={busy} onClick={() => void reopen(block.id, "room")} className={action}>Lepas blokir</button>
      </div>)}
      {data?.blocks.map(block => <div key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <p className="min-w-0 break-words"><strong>{block.service_id ? "Seluruh properti" : "Semua Stay"}</strong> · {block.start_date} – {block.end_date} · {block.reason}</p>
        {block.service_id
          ? <button type="button" disabled={busy} onClick={() => void reopen(block.id, "property")} className={action}>Lepas blokir</button>
          : <Link href={globalStayCalendarHref({ ...context, date: block.start_date })} className={action}>Kelola di Kalender SHIAP</Link>}
      </div>)}
    </>}
  </section>;
}
