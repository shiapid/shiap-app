"use client";

import { useEffect, useState } from "react";

type Settings = { contact_name: string; whatsapp: string; email: string; website: string; instagram: string; tiktok: string; youtube: string };
const blank: Settings = { contact_name: "SHIAP", whatsapp: "08562130222", email: "pasti@shiap.id", website: "https://shiap.id", instagram: "https://instagram.com/shiap.id", tiktok: "https://tiktok.com/@shiap.id", youtube: "https://youtube.com/@shiap.id" };

export default function BusinessContactSettingsForm() {
  const [settings, setSettings] = useState<Settings>(blank);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/settings/business-contact", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Kontak belum tersedia."); return body; })
      .then((body) => { setSettings({ contact_name: body.settings.contact_name, whatsapp: body.settings.whatsapp || "", email: body.settings.email || "", website: body.settings.website, instagram: body.settings.instagram || "", tiktok: body.settings.tiktok || "", youtube: body.settings.youtube || "" }); setReady(body.ready); setLoaded(true); })
      .catch((error) => { if (!controller.signal.aborted) { setLoaded(true); setNotice(error instanceof Error ? error.message : "Pengaturan kontak belum tersedia."); } });
    return () => controller.abort();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/settings/business-contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Kontak belum tersimpan.");
      setSettings({ contact_name: body.settings.contact_name, whatsapp: body.settings.whatsapp || "", email: body.settings.email || "", website: body.settings.website, instagram: body.settings.instagram || "", tiktok: body.settings.tiktok || "", youtube: body.settings.youtube || "" });
      setReady(body.ready); setNotice(body.ready ? "Kontak bisnis tersimpan dan tampil pada E-Tiket." : "Tersimpan. Lengkapi WhatsApp dan email Customer Service sebelum release E-Tiket.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gagal menyimpan kontak."); }
    finally { setBusy(false); }
  }
  const input = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800";
  if (!loaded) return <p role="status" className="text-sm text-slate-500">Memuat kontak bisnis…</p>;
  return <form onSubmit={save} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
    <p className="text-sm leading-6 text-slate-600">Kontak ini digunakan bersama oleh seluruh voucher digital dan PDF. Nomor serta email wajib dikonfigurasi sebelum release tiket; transaksi pelanggan tetap berjalan bila belum lengkap. Email notifikasi bukan otomatis alamat Customer Service.</p>
    <div role="status" className={`rounded-xl p-3 text-xs ${ready ? "bg-emerald-50 text-emerald-800" : "bg-orange-50 text-orange-900"}`}>{ready ? "WhatsApp dan email Customer Service sudah diisi." : "Release E-Ticket tertahan: isi Customer Service WhatsApp dan email resmi SHIAP."}</div>
    <label className="block text-xs font-semibold">Nama tampilan kontak<input required maxLength={80} value={settings.contact_name} onChange={(event) => setSettings({ ...settings, contact_name: event.target.value })} className={input}/></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">Customer Service WhatsApp<input type="tel" autoComplete="tel" maxLength={40} placeholder="Nomor resmi SHIAP" value={settings.whatsapp} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} className={input}/></label><label className="block text-xs font-semibold">Customer Service Email<input type="email" autoComplete="email" maxLength={254} placeholder="Alamat email layanan resmi" value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} className={input}/></label></div>
    <label className="block text-xs font-semibold">Website resmi<input type="url" required value={settings.website} onChange={(event) => setSettings({ ...settings, website: event.target.value })} className={input}/></label>
    <label className="block text-xs font-semibold">Instagram resmi (opsional)<input type="url" placeholder="https://instagram.com/..." value={settings.instagram} onChange={(event) => setSettings({ ...settings, instagram: event.target.value })} className={input}/></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">TikTok resmi<input type="url" value={settings.tiktok} onChange={(event) => setSettings({ ...settings, tiktok: event.target.value })} className={input}/></label><label className="block text-xs font-semibold">YouTube resmi<input type="url" value={settings.youtube} onChange={(event) => setSettings({ ...settings, youtube: event.target.value })} className={input}/></label></div>
    <button disabled={busy} className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan kontak bisnis SHIAP"}</button>
    {notice && <p role="status" className="text-sm text-[#0A2E63]">{notice}</p>}
  </form>;
}
