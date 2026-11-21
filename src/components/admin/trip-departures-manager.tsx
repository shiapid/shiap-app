"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CirclePlus, LoaderCircle, Pencil, Save, Trash2, X } from "lucide-react";

type Departure = {
  id: string; trip_id: string; departure_date: string; end_date: string | null; departure_time: string | null;
  price_per_person: number | null; min_participants: number; max_participants: number; booked_seats: number;
  status: string; meeting_point: string | null; notes: string | null; updated_at: string; version: number;
};
type ScheduleForm = {
  departure_date: string; end_date: string; departure_time: string; price_per_person: string;
  min_participants: string; max_participants: string; status: string; meeting_point: string; notes: string;
};
type Impact = { affected_bookings: number; paid_bookings: number; awaiting_verification: number; old_values: Record<string, unknown>; new_values: Record<string, unknown> };
const emptyForm: ScheduleForm = { departure_date: "", end_date: "", departure_time: "", price_per_person: "", min_participants: "2", max_participants: "10", status: "open", meeting_point: "", notes: "" };
const money = (n: number | null) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n || 0));
const dateLabel = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value.slice(0, 10) + "T00:00:00Z"));
const labels: Record<string, string> = { departure_date: "Tanggal", end_date: "Tanggal selesai", departure_time: "Waktu", price_per_person: "Harga per pax", min_participants: "Minimum peserta", max_participants: "Kapasitas", status: "Status", meeting_point: "Titik temu", notes: "Catatan" };

export default function TripDeparturesManager({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [rows, setRows] = useState<Departure[]>([]);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [editing, setEditing] = useState<Departure | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/trip-departures?trip_id=" + encodeURIComponent(tripId), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Jadwal gagal dimuat.");
      setRows(result.departures as Departure[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Jadwal gagal dimuat."); }
    finally { setLoading(false); }
  }, [tripId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function toForm(row?: Departure): ScheduleForm {
    return row ? {
      departure_date: row.departure_date.slice(0, 10), end_date: row.end_date?.slice(0, 10) || "",
      departure_time: row.departure_time?.slice(0, 5) || "",
      price_per_person: row.price_per_person === null ? "" : String(row.price_per_person),
      min_participants: String(row.min_participants), max_participants: String(row.max_participants),
      status: row.status, meeting_point: row.meeting_point || "", notes: row.notes || "",
    } : { ...emptyForm };
  }

  function openForm(row?: Departure) {
    setEditing(row || null);
    setFormOpen(true);
    setForm(toForm(row));
    setImpact(null); setReason(""); setError(""); setNotice("");
  }

  function cancelForm() {
    const changed = JSON.stringify(form) !== JSON.stringify(toForm(editing || undefined));
    if (changed && !window.confirm("Perubahan yang belum disimpan akan hilang. Tutup form?")) return;
    setEditing(null); setFormOpen(false); setImpact(null); setReason(""); setError("");
  }

  async function save(confirmImpact = false) {
    const minimum = Number(form.min_participants), maximum = Number(form.max_participants);
    if (!form.departure_date || (form.end_date && form.end_date < form.departure_date)) { setError("Tanggal selesai harus sama atau setelah tanggal berangkat."); return; }
    if (form.price_per_person !== "" && (!Number.isFinite(Number(form.price_per_person)) || Number(form.price_per_person) < 0)) { setError("Harga per pax harus Rp0 atau lebih."); return; }
    if (!Number.isInteger(minimum) || minimum < 1 || !Number.isInteger(maximum) || maximum < minimum) { setError("Kapasitas harus positif dan minimum peserta tidak boleh melebihi kapasitas."); return; }
    if (editing && maximum < editing.booked_seats) { setError(`Kapasitas tidak dapat di bawah ${editing.booked_seats} kursi yang sudah terpakai atau tertahan.`); return; }
    if (confirmImpact && reason.trim().length < 3) { setError("Alasan perubahan wajib diisi minimal 3 karakter."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(editing ? `/api/admin/trip-departures/${editing.id}` : "/api/admin/trip-departures", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId, ...form, end_date: form.end_date || null, departure_time: form.departure_time || null,
          price_per_person: form.price_per_person === "" ? null : Number(form.price_per_person),
          ...(editing ? { expected_version: editing.version, reason: reason.trim() || null, confirm_impact: confirmImpact } : {}),
        }),
      });
      const result = await response.json();
      if (result.result === "confirmation_required") {
        setImpact(result as Impact);
        setSaving(false);
        return;
      }
      if (result.result === "conflict") {
        await load();
        throw new Error("Jadwal telah diubah oleh Admin lain. Data terbaru sudah dimuat; buka Edit Jadwal lagi.");
      }
      if (!response.ok) throw new Error(result.error || "Jadwal gagal disimpan.");
      setEditing(null); setFormOpen(false); setImpact(null); setReason("");
      setNotice(editing ? "Perubahan jadwal berhasil disimpan." : "Jadwal baru berhasil ditambahkan.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Jadwal gagal disimpan."); }
    finally { setSaving(false); }
  }

  async function remove(row: Departure) {
    if (!window.confirm(`Hapus jadwal ${tripName} pada ${dateLabel(row.departure_date)} dari daftar?`)) return;
    setRemovingId(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/trip-departures/${row.id}?version=${row.version}`, { method: "DELETE" });
      const result = await response.json();
      if (result.result === "conflict") await load();
      if (!response.ok) throw new Error(result.error || "Jadwal gagal dihapus.");
      setRows(current => current.filter(departure => departure.id !== row.id));
      setNotice("Jadwal berhasil dihapus dari daftar.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Jadwal gagal dihapus."); }
    finally { setRemovingId(null); }
  }

  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar" }).format();
  const isActive = (row: Departure) => row.status === "open" && row.departure_date.slice(0, 10) >= today;
  const activeRows = rows.filter(isActive);
  const otherRows = rows.filter(row => !isActive(row));
  const visibleRows = showOther ? otherRows : activeRows;

  const formatValue = (key: string, value: unknown) => key === "departure_date" || key === "end_date"
    ? (typeof value === "string" && value ? dateLabel(value) : "Tidak diatur")
    : key === "price_per_person" ? (value === null ? "Harga mengikuti paket" : money(Number(value)))
    : value === null || value === "" ? "Tidak diatur" : String(value);

  return <section className="rounded-2xl border border-blue-100 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-widest text-[#1265D8]">OPEN TRIP SCHEDULE</p><h2 className="mt-1 text-lg font-bold text-[#0A2E63]">Jadwal {tripName}</h2></div>
      <button type="button" onClick={() => openForm()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1265D8] px-3 py-2.5 text-xs font-bold text-white"><CirclePlus size={15}/> Tambah jadwal</button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
    {formOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="trip-schedule-form-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h3 id="trip-schedule-form-title" className="text-lg font-extrabold text-[#0A2E63]">{editing ? "Edit Jadwal" : "Tambah Jadwal"}</h3><p className="mt-1 text-xs text-slate-500">{tripName} · perubahan harga hanya berlaku untuk booking baru.</p></div><button type="button" onClick={cancelForm} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X size={18}/></button></div>
        <fieldset disabled={Boolean(impact)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Tanggal berangkat<input required type="date" value={form.departure_date} onChange={e => setForm({ ...form, departure_date: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/></label>
          <label className="text-xs font-semibold text-slate-700">Tanggal selesai (opsional)<input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/></label>
          <label className="text-xs font-semibold text-slate-700">Waktu berangkat (WITA, opsional)<input type="time" value={form.departure_time} onChange={e => setForm({ ...form, departure_time: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/></label>
          <label className="text-xs font-semibold text-slate-700">Harga per pax (IDR, kosong = mengikuti paket)<input type="number" min="0" step="1" value={form.price_per_person} onChange={e => setForm({ ...form, price_per_person: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/></label>
          <label className="text-xs font-semibold text-slate-700">Minimum peserta<input required type="number" min="1" value={form.min_participants} onChange={e => setForm({ ...form, min_participants: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/></label>
          <label className="text-xs font-semibold text-slate-700">Kapasitas maksimum<input required type="number" min={editing?.booked_seats || 1} value={form.max_participants} onChange={e => setForm({ ...form, max_participants: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/>{editing && <span className="mt-1 block text-[10px] text-slate-500">Kursi terpakai/tertahan: {editing.booked_seats}</span>}</label>
          <label className="text-xs font-semibold text-slate-700">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"><option value="draft">Draft</option><option value="open">Open</option><option value="full">Full</option><option value="cancelled">Cancelled</option></select></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Titik temu jadwal (opsional)<input maxLength={500} value={form.meeting_point} onChange={e => setForm({ ...form, meeting_point: e.target.value })} className="mt-1 block h-11 w-full rounded-lg border px-3"/></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Catatan tambahan<textarea maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 block w-full rounded-lg border p-3" rows={3}/></label>
        </fieldset>
        {impact && <div className="mt-4 rounded-xl border border-orange-300 bg-orange-50 p-4">
          <h4 className="text-sm font-bold text-orange-950">Perubahan ini berdampak pada pelanggan</h4>
          <p className="mt-1 text-xs leading-relaxed text-orange-900">{impact.affected_bookings} booking terkait, {impact.paid_bookings} sudah dibayar dan {impact.awaiting_verification} menunggu verifikasi. Booking dan status pembayaran tidak akan dibatalkan atau diubah. Jika tanggal berubah, detail layanan booking akan mengikuti jadwal baru.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.keys(impact.old_values).filter(key => impact.old_values[key] !== impact.new_values[key]).map(key => <div key={key} className="rounded-lg bg-white/80 p-2 text-[11px]"><strong>{labels[key] || key}:</strong><p className="mt-1 text-slate-600">{formatValue(key, impact.old_values[key])} → {formatValue(key, impact.new_values[key])}</p></div>)}</div>
          {form.status === "cancelled" && impact.paid_bookings > 0 && <p className="mt-3 text-xs font-bold text-red-800">Jadwal akan ditutup, tetapi booking pelanggan yang sudah lunas tetap utuh dan harus ditangani melalui workflow operasional tersendiri.</p>}
          <label className="mt-3 block text-xs font-semibold text-orange-950">Alasan perubahan pelanggan<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} className="mt-1 h-11 w-full rounded-lg border border-orange-200 bg-white px-3" placeholder="Contoh: penyesuaian operasional kapal"/></label>
        </div>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={saving} onClick={cancelForm} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600">Batal</button>
          <button type="button" disabled={saving} onClick={() => void save(Boolean(impact))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1265D8] px-4 text-xs font-bold text-white disabled:opacity-60">{saving ? <LoaderCircle size={15} className="animate-spin"/> : <Save size={15}/>} {impact ? "Konfirmasi & Simpan" : editing ? "Simpan Perubahan" : "Simpan Jadwal"}</button>
        </div>
      </section>
    </div>}
    <div role="group" aria-label="Filter jadwal" className="mt-4 flex flex-wrap gap-2">
      <button type="button" aria-pressed={!showOther} onClick={() => setShowOther(false)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 aria-pressed:border-blue-200 aria-pressed:bg-blue-50 aria-pressed:text-[#1265D8]">Jadwal Aktif ({activeRows.length})</button>
      <button type="button" aria-pressed={showOther} onClick={() => setShowOther(true)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 aria-pressed:border-blue-200 aria-pressed:bg-blue-50 aria-pressed:text-[#1265D8]">Jadwal Lain ({otherRows.length})</button>
    </div>
    {loading ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">Memuat jadwal…</p> : visibleRows.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">{showOther ? "Tidak ada jadwal lain." : "Belum ada jadwal aktif."}</p> : <div className="mt-3 space-y-2">{visibleRows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <div className="min-w-0"><p className="text-sm font-bold text-[#0A2E63]"><CalendarDays size={14} className="mr-1 inline text-[#1265D8]"/>{dateLabel(row.departure_date)}{row.departure_time && <span className="ml-2 text-xs font-medium text-slate-500">{row.departure_time.slice(0,5)} WITA</span>}</p>
        <p className="mt-1 text-xs text-slate-500">{money(row.price_per_person)} / pax · {row.booked_seats}/{row.max_participants} kursi · min {row.min_participants} peserta · {row.status}</p>
        {row.meeting_point && <p className="mt-1 break-words text-[11px] text-slate-500">Titik temu: {row.meeting_point}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={removingId !== null} onClick={() => openForm(row)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-bold text-[#1265D8] hover:bg-blue-50"><Pencil size={14}/> Edit Jadwal</button>
        <button type="button" disabled={removingId !== null || row.booked_seats > 0} onClick={() => void remove(row)} aria-label={`Hapus jadwal ${dateLabel(row.departure_date)}`} title={row.booked_seats > 0 ? "Jadwal memiliki kursi terpakai atau tertahan" : "Hapus jadwal"} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40">
          {removingId === row.id ? <LoaderCircle size={15} className="animate-spin"/> : <Trash2 size={15}/>}
        </button>
      </div>
    </article>)}</div>}
  </section>;
}
