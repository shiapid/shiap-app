"use client";

import { useEffect, useState } from "react";
import { loadVendorContact, saveVendorContact } from "@/app/admin/vendor-contact-actions";
import type { VendorContact, VendorProductColumn } from "@/lib/admin/vendor-contact";

const empty = { name: "", whatsapp: "", notes: "" };
const field = "mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function VendorContactForm({ column, productId }: { column: VendorProductColumn; productId: string }) {
  const [contact, setContact] = useState<VendorContact | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const failure = () => { if (active) setError("Kontak vendor gagal dimuat."); };
    void loadVendorContact(column, productId).then(result => {
      if (!active) return;
      if (result.error) failure();
      else setContact(result.data ?? empty);
    }).catch(failure);
    return () => { active = false; };
  }, [column, productId, attempt]);

  return <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-bold text-[#0A2E63]">Kontak Vendor</h3>
    <p className="mt-1 text-xs text-slate-500">Hanya untuk Admin SHIAP.</p>
    {!contact ? (error ? <div className="mt-3 text-xs">
      <p role="alert" className="text-red-700">{error}</p>
      <button type="button" className="min-h-11 font-bold text-[#1265D8]" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Coba lagi</button>
    </div> : <p role="status" className="mt-3 text-xs text-slate-500">Memuat kontak vendor…</p>) : <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={async event => {
      event.preventDefault();
      if (pending) return;
      const form = new FormData(event.currentTarget);
      setPending(true);
      setError("");
      setSaved(false);
      try {
        const result = await saveVendorContact(column, productId, form);
        if (result.error || !result.data) setError(result.error ?? "Kontak vendor gagal disimpan.");
        else { setContact(result.data); setSaved(true); }
      } catch {
        setError("Kontak vendor gagal disimpan. Coba lagi.");
      } finally {
        setPending(false);
      }
    }}>
      <label className="min-w-0 text-xs font-semibold">Nama Vendor/PIC
        <input name="name" required maxLength={120} value={contact.name} onChange={event => { setSaved(false); setContact({ ...contact, name: event.target.value }); }} disabled={pending} className={field}/>
      </label>
      <label className="min-w-0 text-xs font-semibold">Nomor WhatsApp
        <input name="whatsapp" type="tel" required maxLength={40} value={contact.whatsapp} onChange={event => { setSaved(false); setContact({ ...contact, whatsapp: event.target.value }); }} disabled={pending} className={field}/>
      </label>
      <label className="min-w-0 text-xs font-semibold">Catatan Internal (opsional)
        <textarea name="notes" rows={1} maxLength={1000} value={contact.notes} onChange={event => { setSaved(false); setContact({ ...contact, notes: event.target.value }); }} disabled={pending} className={field}/>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button disabled={pending} className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-xs font-bold text-white disabled:opacity-50">{pending ? "Menyimpan…" : "Simpan kontak vendor"}</button>
        {saved && <p role="status" className="text-xs text-emerald-700">Kontak vendor disimpan.</p>}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
    </form>}
  </section>;
}
