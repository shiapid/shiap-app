"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PLACES_WHATSAPP_TEMPLATE, renderPlacesWhatsAppTemplate, validPlacesWhatsAppTemplate } from "@/lib/places/whatsapp-template";

export function PlacesWhatsAppSettings({ initialTemplate }: { initialTemplate: string }) {
  const [template, setTemplate] = useState(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = validPlacesWhatsAppTemplate(template);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setMessage("");
    try {
      const client = createClient();
      const { data, error } = await client.from("places_whatsapp_settings").update({ template }).eq("id", true).select("template").single();
      if (error || !data) throw new Error("Template belum dapat disimpan. Pastikan sesi Admin masih aktif.");
      setTemplate(data.template); setMessage("Template WhatsApp berhasil disimpan.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal menyimpan template."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="grid gap-5 lg:grid-cols-2">
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <label htmlFor="places-wa-template" className="text-sm font-bold">Template WhatsApp</label>
      <p className="mt-2 text-xs text-slate-500">Wajib memuat {"{nama_properti}"} dan {"{kode_referensi}"}. Variabel lain tidak didukung. Maksimal 2.000 karakter.</p>
      <textarea id="places-wa-template" required maxLength={2000} rows={13} value={template} onChange={e=>setTemplate(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
      {!valid ? <p role="alert" className="mt-2 text-xs text-red-700">Gunakan kedua variabel wajib dan hapus variabel yang tidak dikenal atau kurung yang tidak lengkap.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!valid || busy} className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan template"}</button>
        <button type="button" disabled={busy} onClick={()=>{setTemplate(DEFAULT_PLACES_WHATSAPP_TEMPLATE);setMessage("Template default dimuat. Klik Simpan template untuk menerapkannya.");}} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold">Kembalikan ke Template Default</button>
      </div>
      {message ? <p role="status" className="mt-3 text-sm text-[#0A2E63]">{message}</p> : null}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold">Pratinjau pesan</h2><p className="mt-1 text-xs text-slate-500">Contoh properti dan kode referensi untuk pratinjau.</p><pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-emerald-50 p-4 font-sans text-sm leading-6">{valid ? renderPlacesWhatsAppTemplate(template, "Contoh Penginapan", "SHP-2ABCD") : "Perbaiki template untuk melihat pratinjau."}</pre></section>
  </form>;
}
