"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Building2, CheckCircle2, LoaderCircle, Save } from "lucide-react";

type PaymentSettings = {
  bank_name: string;
  account_name: string;
  account_number: string;
  instructions: string;
  is_active: boolean;
};

const initial: PaymentSettings = {
  bank_name: "Mandiri",
  account_name: "",
  account_number: "",
  instructions: "Transfer sesuai total tagihan pada booking. Setelah transfer, unggah bukti melalui halaman detail booking.",
  is_active: true,
};

export default function PaymentSettingsForm() {
  const demoMode = process.env.NEXT_PUBLIC_SHIAP_DEMO_MODE === "true";
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<PaymentSettings>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("payment_settings")
          .select("bank_name,account_name,account_number,instructions,is_active")
          .eq("id", true)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (!active) return;
        if (queryError) setLoadError(controller.signal.aborted
          ? "Supabase tidak merespons dalam 10 detik. Periksa koneksi dan status database, lalu coba lagi."
          : `Pengaturan pembayaran tidak dapat dimuat: ${queryError.message}`);
        else if (data) setForm({ ...(data as PaymentSettings), is_active: demoMode ? false : data.is_active });
        else setLoadError("Data rekening pembayaran belum tersedia. Periksa migration dan data awal Supabase.");
      } catch {
        if (active) setLoadError(controller.signal.aborted
          ? "Supabase tidak merespons dalam 10 detik. Periksa koneksi dan status database, lalu coba lagi."
          : "Pengaturan pembayaran gagal dimuat karena koneksi Supabase. Coba lagi.");
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; window.clearTimeout(timeoutId); controller.abort(); };
  }, [demoMode, reloadKey, supabase]);

  function update<K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!form.account_name.trim() || !form.account_number.trim()) {
      setError("Nama pemilik dan nomor rekening wajib diisi.");
      return;
    }
    if (!/^[0-9\s-]{6,30}$/.test(form.account_number.trim())) {
      setError("Nomor rekening harus berisi 6–30 digit angka (spasi atau tanda hubung diperbolehkan).");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("Sesi admin tidak ditemukan. Silakan login kembali.");
      setSaving(false);
      return;
    }
    const { error: saveError } = await supabase
      .from("payment_settings")
      .update({
        bank_name: form.bank_name.trim(),
        account_name: form.account_name.trim(),
        account_number: form.account_number.trim(),
        instructions: form.instructions.trim(),
        is_active: demoMode ? false : form.is_active,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      })
      .eq("id", true);
    if (saveError) setError(saveError.message);
    else setSuccess("Pengaturan rekening berhasil disimpan.");
    setSaving(false);
  }

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={17}/> Memuat pengaturan...</div>;

  return (
    <form onSubmit={save} className="space-y-5">
      {demoMode && <div role="status" className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-xs leading-5 text-orange-950">Mode DEMO aktif. Instruksi transfer dan unggah bukti tetap nonaktif selama build ini, meskipun rekening diedit di bawah.</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#1974FF]"><Building2 size={21}/></div>
          <div><h2 className="font-bold text-[#0A2E63]">Rekening penerima</h2><p className="text-xs text-slate-500">Satu rekening bank untuk pembayaran SHIAP</p></div>
        </div>
        <label className="mt-5 block text-xs font-semibold text-slate-600">Bank
          <input required value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} maxLength={80} placeholder="Nama bank" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]" />
        </label>
        <label className="mt-4 block text-xs font-semibold text-slate-600">Nama pemilik rekening
          <input required value={form.account_name} onChange={(e) => update("account_name", e.target.value)} maxLength={120} placeholder="Masukkan nama sesuai rekening" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]" />
        </label>
        <label className="mt-4 block text-xs font-semibold text-slate-600">Nomor rekening
          <input required inputMode="numeric" autoComplete="off" value={form.account_number} onChange={(e) => update("account_number", e.target.value)} maxLength={30} placeholder="Masukkan nomor rekening" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm tracking-wider outline-none focus:border-[#1974FF]" />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-[#0A2E63]">Instruksi untuk customer</h2>
        <p className="mt-1 text-xs text-slate-500">Ditampilkan pada detail booking segera setelah booking dibuat.</p>
        <label className="mt-4 block text-xs font-semibold text-slate-600">Pesan pembayaran
          <textarea rows={4} maxLength={1000} value={form.instructions} onChange={(e) => update("instructions", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-[#1974FF]" />
        </label>
        <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input type="checkbox" checked={demoMode ? false : form.is_active} disabled={demoMode} onChange={(e) => update("is_active", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1974FF] disabled:opacity-50" />
          <span><span className="block text-xs font-bold text-[#0A2E63]">Tampilkan instruksi pembayaran</span><span className="mt-1 block text-[11px] text-slate-500">{demoMode ? "Nonaktif sampai mode demo dihentikan pada build production berikutnya." : "Jika dinonaktifkan, detail rekening tidak ditampilkan kepada customer."}</span></span>
        </label>
      </section>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
        Instruksi rekening ditampilkan segera setelah booking dibuat. Tombol upload bukti tetap mengikuti aturan V2: customer baru dapat mengunggah setelah booking dikonfirmasi admin.
      </div>
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><p className="min-w-0 flex-1">{loadError}</p><button type="button" disabled={loading} onClick={() => { setLoading(true); setLoadError(""); setReloadKey((key) => key + 1); }} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">{loading ? "Memuat…" : "Coba lagi"}</button></div>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {success && <p role="status" className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-xs text-green-700"><CheckCircle2 size={15}/>{success}</p>}
      <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0A2E63] disabled:opacity-50"><Save size={16}/>{saving ? "Menyimpan..." : "Simpan pengaturan rekening"}</button>
    </form>
  );
}
