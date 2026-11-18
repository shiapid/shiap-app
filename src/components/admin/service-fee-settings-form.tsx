"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/booking-engine";
import { feeLabels, type FeeLine, type FeeSetting } from "@/lib/service-fees";

export default function ServiceFeeSettingsForm() {
  const client = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<FeeSetting[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void client.from("service_fee_settings").select("category,enabled,mode,percentage_bps,fixed_amount,max_percentage_bps,version").order("category").then(({ data, error }) => {
      if (!active) return;
      if (error || data?.length !== 6) setError("Pengaturan biaya belum tersedia. Periksa migration atau sesi Admin lalu muat ulang.");
      else setRows(data as FeeSetting[]);
    });
    return () => { active = false; };
  }, [client]);
  return <div className="space-y-3"><p className="text-sm text-slate-600">Tarif awal nonaktif / Rp0. Rekomendasi persentase 2%, plafon awal 10%. Perubahan hanya untuk booking baru.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{!rows && !error && <p role="status">Memuat tarif…</p>}
    {rows?.map((row) => <FeeEditor key={row.category} initial={row} />)}</div>;
}

function FeeEditor({ initial }: { initial: FeeSetting }) {
  const client = useMemo(() => createClient(), []);
  const [form, setForm] = useState(initial);
  const [subtotal, setSubtotal] = useState(1_000_000);
  const [preview, setPreview] = useState<{ key: string; line?: FeeLine; error?: string }>({ key: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const key = JSON.stringify({ form, subtotal });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const { form: value, subtotal: sample } = JSON.parse(key) as { form: FeeSetting; subtotal: number };
      const { data, error } = await client.rpc("admin_preview_service_fee", {
        p_category: value.category, p_subtotal: sample, p_enabled: value.enabled, p_mode: value.mode,
        p_bps: value.percentage_bps, p_fixed: value.fixed_amount, p_cap: value.max_percentage_bps,
      });
      if (active) setPreview(error ? { key, error: "Nilai tidak valid. Persentase aktif harus ≤ plafon, plafon <100%, dan nominal berupa integer Rp." } : { key, line: data as FeeLine });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [key, client]);
  const line = preview.key === key ? preview.line : undefined;
  const inputClass = "mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!line || busy) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await client.from("service_fee_settings").update({ enabled: form.enabled, mode: form.mode, percentage_bps: form.percentage_bps, fixed_amount: form.fixed_amount, max_percentage_bps: form.max_percentage_bps })
        .eq("category", form.category).eq("version", form.version).select("category,enabled,mode,percentage_bps,fixed_amount,max_percentage_bps,version").maybeSingle();
      if (error || !data) throw new Error("Gagal menyimpan atau tarif diubah Admin lain. Muat ulang sebelum mencoba lagi.");
      setForm(data as FeeSetting); setNotice("Tarif tersimpan. Snapshot booking lama tetap berlaku.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gagal menyimpan. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <form data-fee-category={form.category} onSubmit={save} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-[#0A2E63]">{feeLabels[form.category]}</h3><label className="flex min-h-11 items-center gap-2 text-sm"><input aria-label={`Aktifkan fee ${feeLabels[form.category]}`} type="checkbox" checked={form.enabled} disabled={busy} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />{form.enabled ? "Aktif" : "Nonaktif / Rp0"}</label></div>
    <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-xs text-slate-600">Jenis biaya<select className={inputClass} value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as FeeSetting["mode"] })}><option value="percentage">Percentage Fee (%)</option><option value="fixed">Fixed Fee (Rp)</option></select></label>
      {form.mode === "percentage" ? <label className="min-w-0 text-xs text-slate-600">Persentase (%)<input className={inputClass} type="number" min="0" max="99.99" step="0.01" name="percentage" required value={form.percentage_bps / 100} onChange={(event) => setForm({ ...form, percentage_bps: Math.round(Number(event.target.value) * 100) })} /></label>
        : <label className="min-w-0 text-xs text-slate-600">Nominal sekali per kategori (Rp)<input className={inputClass} type="number" min="0" max="999999999999" step="1" name="fixed_amount" required value={form.fixed_amount} onChange={(event) => setForm({ ...form, fixed_amount: Number(event.target.value) })} /></label>}
      <label className="min-w-0 text-xs text-slate-600">Plafon dari subtotal kategori (%)<input className={inputClass} type="number" min="0" max="99.99" step="0.01" name="max_percentage" required value={form.max_percentage_bps / 100} onChange={(event) => setForm({ ...form, max_percentage_bps: Math.round(Number(event.target.value) * 100) })} /></label>
      <label className="min-w-0 text-xs text-slate-600">Subtotal simulasi (Rp)<input className={inputClass} type="number" min="0" max="999999999999" step="1" name="preview_subtotal" required value={subtotal} onChange={(event) => setSubtotal(Number(event.target.value))} /></label>
    </fieldset>
    <div aria-live="polite" className="rounded-xl bg-[#F7F9FC] p-3 text-sm text-[#0A2E63]">{line ? <><p>Biaya aktual: <strong>{formatRupiah(line.fee)}</strong></p><p>Total pembayaran pelanggan: <strong>{formatRupiah(line.total)}</strong></p>{line.capped && <p className="mt-1 text-xs text-orange-800">Nominal {formatRupiah(line.requested_fee)} dibatasi menjadi {formatRupiah(line.fee)} sesuai plafon {form.max_percentage_bps / 100}%.</p>}</> : <p>{preview.key === key ? preview.error : "Menghitung preview di server…"}</p>}</div>
    <button disabled={busy || !line} className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan tarif"}</button>
    {notice && <p role="status" className="text-sm text-[#0A2E63]">{notice}</p>}
  </form>;
}
