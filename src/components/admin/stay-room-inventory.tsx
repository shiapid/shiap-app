"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Night = { night: string; total: number; booked: number; blocked: number; available: number; calendar_closed: boolean };
type Block = { id: string; starts_on: string; ends_on: string; blocked_units: number | null; reason: string };
const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar" });
const readableDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
const input = "mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm";
const days = 14;

function addDays(date: string, count: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + count);
  return day.toISOString().slice(0, 10);
}

export function StayRoomInventory({ roomId, roomName }: { roomId: string; roomName: string }) {
  const [today] = useState(() => dateKey.format());
  const [from, setFrom] = useState(today);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ from: string; revision: number; nights: Night[]; blocks: Block[]; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("maintenance");
  const data = snapshot?.from === from && snapshot.revision === revision ? snapshot : null;

  useEffect(() => {
    let current = true;
    const db = createClient();
    const response = Promise.all([
      db.rpc("admin_stay_inventory", { p_room: roomId, p_start: from, p_end: addDays(from, days) }),
      db.from("stay_room_inventory_blocks").select("id,starts_on,ends_on,blocked_units,reason")
        .eq("room_type_id", roomId).lte("starts_on", addDays(from, days - 1)).gte("ends_on", from).order("starts_on"),
    ]);
    void response.then(([inventory, blocks]) => {
      if (!current) return;
      setSnapshot({ from, revision, nights: inventory.data ?? [], blocks: blocks.data ?? [], error: Boolean(inventory.error || blocks.error) });
    }).catch(() => {
      if (current) setSnapshot({ from, revision, nights: [], blocks: [], error: true });
    });
    return () => { current = false; };
  }, [from, revision, roomId]);

  async function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const starts_on = String(fields.get("start"));
    const ends_on = String(fields.get("end") || starts_on);
    const blocked_units = mode === "closed" ? null : Number(fields.get("units"));
    const reason = String(fields.get("reason") || "").trim();
    if (starts_on < today || ends_on < starts_on || ends_on > addDays(starts_on, 364) || reason.length < 3 ||
        (blocked_units !== null && (!Number.isSafeInteger(blocked_units) || blocked_units < 1))) {
      setMessage("Periksa tanggal, jumlah unit, dan alasan blokir.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createClient().from("stay_room_inventory_blocks")
        .insert({ room_type_id: roomId, starts_on, ends_on, blocked_units, reason });
      if (error) {
        setMessage(error.code === "P0001" ? error.message : "Blokir gagal disimpan.");
        return;
      }
      form.reset();
      setFrom(starts_on);
      setRevision(value => value + 1);
      setMessage("Blokir disimpan.");
    } catch {
      setMessage("Blokir gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function reopen(block: Block) {
    if (busy || !window.confirm("Lepas blokir untuk seluruh rentang tanggal ini?")) return;
    setBusy(true);
    setMessage("");
    try {
      const { data: removed, error } = await createClient().from("stay_room_inventory_blocks")
        .delete().eq("id", block.id).eq("room_type_id", roomId).select("id").maybeSingle();
      if (error || !removed) {
        setMessage("Blokir gagal dilepas.");
        return;
      }
      setRevision(value => value + 1);
      setMessage("Blokir dilepas. Stok mengikuti reservasi aktif dan blokir lain.");
    } catch {
      setMessage("Blokir gagal dilepas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 space-y-4 rounded-xl border border-blue-100 bg-slate-50 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-bold text-[#0A2E63]">Kalender ketersediaan · {roomName}</h3>
        <label className="text-xs font-semibold">Mulai tanggal
          <input type="date" value={from} min={today} onChange={event => { if (event.target.value >= today) setFrom(event.target.value); }} className={input}/>
        </label>
      </div>
      {!data ? <p role="status" className="text-sm">Memuat stok per malam…</p> : data.error ?
        <p role="alert" className="text-sm text-red-700">Kalender gagal dimuat. <button type="button" className="font-bold underline" onClick={() => setRevision(value => value + 1)}>Coba lagi</button></p> :
        <table className="w-full table-fixed text-center text-[10px] sm:text-sm" aria-label={`Stok per malam untuk ${roomName}`}>
          <thead><tr className="text-[#0A2E63]"><th scope="col" className="w-[34%] text-left">Malam</th><th scope="col">Total</th><th scope="col">Terpesan</th><th scope="col">Diblokir</th><th scope="col">Tersedia</th></tr></thead>
          <tbody>{data.nights.map(night => <tr key={night.night} className="border-t border-slate-200">
            <th scope="row" className="py-2 text-left font-medium">{readableDate.format(new Date(night.night))}
              {night.calendar_closed && <Link href="/admin/calendar" className="block text-[#1265D8] underline">Blokir kalender</Link>}
            </th>
            <td>{night.total}</td><td>{night.booked}</td><td>{night.blocked}</td><td className="font-bold">{night.available}</td>
          </tr>)}</tbody>
        </table>}
      <form onSubmit={createBlock} className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Tindakan<select value={mode} onChange={event => setMode(event.target.value)} className={input}>
          <option value="maintenance">Blokir sebagian unit</option><option value="closed">Tutup semua unit tipe ini</option>
        </select></label>
        {mode === "maintenance" && <label className="text-xs font-semibold">Jumlah unit diblokir
          <input name="units" type="number" min="1" step="1" defaultValue="1" required className={input}/>
        </label>}
        <label className="text-xs font-semibold">Malam pertama<input name="start" type="date" required min={today} className={input}/></label>
        <label className="text-xs font-semibold">Malam terakhir (opsional)<input name="end" type="date" min={today} className={input}/></label>
        <label className="text-xs font-semibold sm:col-span-2">Alasan internal<input name="reason" required minLength={3} maxLength={240} className={input}/></label>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-[#1265D8] px-3 text-xs font-bold text-white disabled:opacity-50">Simpan blokir</button>
      </form>
      {message && <p role="status" className="text-sm text-[#0A2E63]">{message}</p>}
      {data?.blocks.map(block => <div key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <p className="min-w-0 break-words"><strong>{block.starts_on}{block.ends_on !== block.starts_on && ` – ${block.ends_on}`}</strong> · {block.blocked_units === null ? "Ditutup" : `${block.blocked_units} unit`} · {block.reason}</p>
        <button type="button" disabled={busy} onClick={() => void reopen(block)} className="min-h-11 rounded-lg border border-slate-200 px-3 font-bold text-[#1265D8] disabled:opacity-50">Lepas blokir</button>
      </div>)}
    </section>
  );
}
