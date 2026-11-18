"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Save, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type FormState = { is_active: boolean; whatsapp_number: string; destinations: string; durations_days: string; activities: string; stays: string; min_participants: string; max_participants: string; documentation_services: string; documentation_deliverables: string };
const joinLines = (values: string[]) => values.join("\n");
const parseLines = (value: string) => [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];

export default function CustomTripSettingsForm() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<FormState>({ is_active: true, whatsapp_number: "", destinations: "", durations_days: "1, 2, 3, 4, 5", activities: "", stays: "", min_participants: "1", max_participants: "20", documentation_services: "Drone\nCamera\nUnderwater", documentation_deliverables: "Foto\nVideo\nEditing" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: queryError } = await supabase.from("custom_trip_settings")
        .select("is_active,whatsapp_number,destinations,durations_days,activities,stays,min_participants,max_participants,documentation_services,documentation_deliverables,updated_at,updated_by")
        .eq("id", true).maybeSingle();
      if (!active) return;
      if (queryError) setError(queryError.message);
      else if (data) setForm({
        is_active: data.is_active, whatsapp_number: data.whatsapp_number,
        destinations: joinLines(data.destinations), durations_days: data.durations_days.join(", "),
        activities: joinLines(data.activities), stays: joinLines(data.stays),
        min_participants: String(data.min_participants), max_participants: String(data.max_participants),
        documentation_services: joinLines(data.documentation_services), documentation_deliverables: joinLines(data.documentation_deliverables),
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(""); setSuccess("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const phone = form.whatsapp_number.replace(/\D/g, "");
    const destinations = parseLines(form.destinations);
    const activities = parseLines(form.activities);
    const stays = parseLines(form.stays);
    const documentationServices = parseLines(form.documentation_services);
    const documentationDeliverables = parseLines(form.documentation_deliverables);
    const minParticipants = Number(form.min_participants);
    const maxParticipants = Number(form.max_participants);
    const durations = [...new Set(form.durations_days.split(/[,\s]+/).map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= 30))].sort((a, b) => a - b);
    if (phone.length < 8 || phone.length > 15) { setError("Nomor WhatsApp harus memakai kode negara dan 8–15 digit, misalnya 6281234567890."); setSaving(false); return; }
    if (!destinations.length || !durations.length) { setError("Isi minimal satu destinasi dan satu pilihan durasi."); setSaving(false); return; }
    if (!Number.isInteger(minParticipants) || !Number.isInteger(maxParticipants) || minParticipants < 1 || maxParticipants > 100 || maxParticipants < minParticipants) { setError("Batas jumlah peserta harus antara 1–100 dan batas maksimal tidak boleh di bawah batas minimal."); setSaving(false); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Sesi admin tidak ditemukan. Silakan login kembali."); setSaving(false); return; }
    const { error: saveError } = await supabase.from("custom_trip_settings").update({
      is_active: form.is_active, whatsapp_number: phone, destinations, durations_days: durations, activities, stays,
      min_participants: minParticipants, max_participants: maxParticipants,
      documentation_services: documentationServices, documentation_deliverables: documentationDeliverables,
      updated_at: new Date().toISOString(), updated_by: auth.user.id,
    }).eq("id", true);
    if (saveError) setError(saveError.message);
    else setSuccess("Pengaturan Custom Trip berhasil disimpan dan langsung digunakan di halaman pelanggan.");
    setSaving(false);
  }

  const textareaClass = "mt-1.5 min-h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-[#0A2E63] outline-none focus:border-[#1974FF] focus:ring-2 focus:ring-blue-100";
  const labelClass = "block text-xs font-semibold text-slate-600";
  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={17}/> Memuat pengaturan Custom Trip…</div>;

  return <form onSubmit={(event) => void save(event)} className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-[#1974FF]"><Settings2 size={20}/></span><div><h2 className="font-bold text-[#0A2E63]">Kontak admin</h2><p className="text-xs text-slate-500">Nomor ini menjadi tujuan pesan WhatsApp permintaan estimasi.</p></div></div><label className={labelClass + " mt-4"}>WhatsApp admin<input required inputMode="numeric" value={form.whatsapp_number} onChange={(event) => update("whatsapp_number", event.target.value)} placeholder="6281234567890" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm tracking-wide"/></label><p className="mt-1 text-[10px] text-slate-400">Gunakan angka internasional tanpa tanda +, spasi, atau tanda hubung.</p></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-[#0A2E63]">Pilihan untuk pelanggan</h2><p className="mt-1 text-xs text-slate-500">Satu pilihan per baris. Daftar ini berdiri sendiri dan tidak mengambil data dari katalog booking.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Destinasi / tempat yang dikunjungi<textarea required value={form.destinations} onChange={(event) => update("destinations", event.target.value)} placeholder={"Pantai Teluk Tamiang\nPantai Risalo\nPantai Gedambaan\nPulau Kerayaan"} className={textareaClass}/></label><label className={labelClass}>Pilihan wahana<textarea value={form.activities} onChange={(event) => update("activities", event.target.value)} placeholder={"Snorkeling\nJetski\nBanana Boat\nKano"} className={textareaClass}/></label><label className={labelClass}>Pilihan penginapan<textarea value={form.stays} onChange={(event) => update("stays", event.target.value)} placeholder={"Homestay Pesisir\nVilla Bahari\nBelum ditentukan"} className={textareaClass}/></label><label className={labelClass}>Durasi (hari)<input required value={form.durations_days} onChange={(event) => update("durations_days", event.target.value)} placeholder="1, 2, 3, 4, 5" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/><span className="mt-1 block text-[10px] font-normal text-slate-400">Masukkan angka dipisahkan koma, misalnya 1, 2, 3.</span></label></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-[#0A2E63]">Peserta dan dokumentasi</h2><p className="mt-1 text-xs text-slate-500">Atur batas jumlah peserta serta opsi dokumentasi yang tampil untuk pelanggan.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Minimal peserta<input required type="number" min={1} max={100} value={form.min_participants} onChange={(event) => update("min_participants", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label><label className={labelClass}>Maksimal peserta<input required type="number" min={1} max={100} value={form.max_participants} onChange={(event) => update("max_participants", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label><label className={labelClass}>Layanan dokumentasi<textarea value={form.documentation_services} onChange={(event) => update("documentation_services", event.target.value)} placeholder={"Drone\nCamera\nUnderwater"} className={textareaClass}/><span className="mt-1 block text-[10px] font-normal text-slate-400">Satu opsi per baris.</span></label><label className={labelClass}>Hasil dokumentasi<textarea value={form.documentation_deliverables} onChange={(event) => update("documentation_deliverables", event.target.value)} placeholder={"Foto\nVideo\nEditing"} className={textareaClass}/><span className="mt-1 block text-[10px] font-normal text-slate-400">Pelanggan dapat memilih lebih dari satu.</span></label></div></section>
    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><input type="checkbox" checked={form.is_active} onChange={(event) => update("is_active", event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1974FF]"/><span><strong className="block text-xs text-[#0A2E63]">Aktifkan Custom Trip</strong><span className="mt-1 block text-[11px] text-slate-500">Jika dimatikan, pelanggan melihat pemberitahuan bahwa fitur sedang tidak tersedia.</span></span></label>
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">Tombol pelanggan akan membuka WhatsApp dengan pilihan destinasi, durasi, wahana, dan penginapan. Admin menyampaikan estimasi harga, waktu, dan itinerary melalui percakapan tersebut.</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {success && <p role="status" className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-xs text-green-700"><CheckCircle2 size={15}/>{success}</p>}
    <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0A2E63] disabled:opacity-50"><Save size={16}/>{saving ? "Menyimpan…" : "Simpan pengaturan Custom Trip"}</button>
  </form>;
}

