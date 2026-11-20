"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/booking-engine";
import { parseCatalogRupiah } from "@/lib/rupiah-input";

type Rate = { id: string; starts_on: string; ends_on: string; price: number };
const fields = "id,starts_on,ends_on,price";
const input = "mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-2 text-sm";

export function StaySpecialRates({ roomId }: { roomId: string }) {
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);

  useEffect(() => {
    let active = true;
    void createClient().from("stay_special_rates").select(fields).eq("room_type_id", roomId).order("starts_on").then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Gagal memuat harga tanggal khusus.");
      else setRates(data);
    });
    return () => { active = false; };
  }, [roomId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !rates) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const starts_on = String(values.get("starts_on") || "");
    const ends_on = String(values.get("ends_on") || starts_on);
    const price = parseCatalogRupiah(values.get("price"), 1);
    if (!starts_on || ends_on < starts_on || price === null) {
      setMessage("Periksa rentang tanggal dan masukkan harga Rupiah bulat di atas nol."); return;
    }
    setPending(true);
    const table = createClient().from("stay_special_rates");
    const valuesToSave = { starts_on, ends_on, price };
    const query = editing
      ? table.update(valuesToSave).eq("id", editing.id).eq("room_type_id", roomId)
      : table.insert({ room_type_id: roomId, ...valuesToSave });
    const { data, error } = await query.select(fields).single();
    setPending(false);
    if (error) {
      setMessage(error.code === "23P01" ? "Rentang bertumpang tindih dengan harga khusus lain." : "Gagal menyimpan harga khusus."); return;
    }
    setRates(current => [...(current ?? []).filter(rate => rate.id !== data.id), data].sort((a,b) => a.starts_on.localeCompare(b.starts_on)));
    form.reset();
    setEditing(null);
    setMessage("Harga khusus disimpan.");
  }

  async function remove(rate: Rate) {
    if (pending || !window.confirm("Hapus harga khusus ini? Tarif reguler akan berlaku untuk booking baru.")) return;
    setPending(true);
    const { data, error } = await createClient().from("stay_special_rates")
      .delete().eq("id", rate.id).eq("room_type_id", roomId).select("id").maybeSingle();
    setPending(false);
    if (error || !data) { setMessage("Gagal menghapus harga khusus."); return; }
    setRates(current => current?.filter(row => row.id !== rate.id) ?? null);
    if (editing?.id === rate.id) setEditing(null);
    setMessage("Harga khusus dihapus.");
  }

  return <section className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-bold text-[#0A2E63]">Harga Tanggal Khusus</h3>
    <p className="text-xs text-slate-500">Berlaku per malam dan per unit, termasuk tanggal akhir. Kosongkan tanggal akhir untuk satu malam.</p>
    {rates && <form key={editing?.id ?? "new"} onSubmit={save} className="grid items-end gap-2 sm:grid-cols-4">
      <label className="min-w-0 text-xs">Mulai<input name="starts_on" type="date" defaultValue={editing?.starts_on} required className={input}/></label>
      <label className="min-w-0 text-xs">Akhir (opsional)<input name="ends_on" type="date" defaultValue={editing?.ends_on} className={input}/></label>
      <label className="min-w-0 text-xs">Harga (IDR)<input name="price" type="number" defaultValue={editing?.price} min="1" step="1" required className={input}/></label>
      <button disabled={pending} className="min-h-11 rounded-lg bg-[#1265D8] px-3 text-xs font-bold text-white disabled:opacity-50">{editing ? "Simpan tarif" : "Tambah tarif"}</button>
      {editing && <button type="button" disabled={pending} onClick={() => setEditing(null)} className="min-h-11 text-xs font-bold text-slate-600">Batal edit</button>}
    </form>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {rates?.map(rate => <div key={rate.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
      <span>{rate.starts_on}{rate.starts_on !== rate.ends_on ? " – " + rate.ends_on : ""} · {formatRupiah(Number(rate.price))}</span>
      <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => { setMessage(""); setEditing(rate); }} className="min-h-11 px-2 font-bold text-[#1265D8]">Edit</button>
      <button type="button" disabled={pending} onClick={() => void remove(rate)} className="min-h-11 px-2 font-bold text-red-700">Hapus</button></div>
    </div>)}
    {!rates && !message && <p role="status" className="text-xs text-slate-500">Memuat tarif…</p>}
  </section>;
}
