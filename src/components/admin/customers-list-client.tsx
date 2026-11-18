"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type CustomerBookingRow = { id: string; user_id: string; customer_name: string; customer_whatsapp: string; customer_email: string | null; order_status: string; payment_status: string; total_amount: number; created_at: string };
export type ManualCustomerRow = { id: string; full_name: string; whatsapp: string; email: string | null; notes: string | null; created_at: string; updated_at: string };
type Customer = { key: string; userId: string | null; contactId: string | null; name: string; whatsapp: string; email: string | null; notes: string; bookings: CustomerBookingRow[]; lastBooking: string | null };
type Draft = { name: string; whatsapp: string; email: string; notes: string };
const emptyDraft: Draft = { name: "", whatsapp: "", email: "", notes: "" };
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export default function CustomersListClient({ bookings, contacts: initialContacts, error }: { bookings: CustomerBookingRow[]; contacts: ManualCustomerRow[]; error: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState(initialContacts);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const customers = useMemo(() => {
    const groups = new Map<string, Customer>();
    for (const booking of bookings) {
      const key = `user:${booking.user_id}`;
      const existing = groups.get(key);
      if (existing) existing.bookings.push(booking);
      else groups.set(key, { key, userId: booking.user_id, contactId: null, name: booking.customer_name, whatsapp: booking.customer_whatsapp, email: booking.customer_email, notes: "", bookings: [booking], lastBooking: booking.created_at });
    }
    for (const contact of contacts) {
      const key = `contact:${contact.id}`;
      groups.set(key, { key, userId: null, contactId: contact.id, name: contact.full_name, whatsapp: contact.whatsapp, email: contact.email, notes: contact.notes ?? "", bookings: [], lastBooking: null });
    }
    const needle = query.trim().toLocaleLowerCase("id-ID");
    return [...groups.values()].filter((customer) => !needle || `${customer.name} ${customer.whatsapp} ${customer.email ?? ""}`.toLocaleLowerCase("id-ID").includes(needle));
  }, [bookings, contacts, query]);
  const allVisibleSelected = customers.length > 0 && customers.every((customer) => selected.includes(customer.key));

  function toggleSelected(key: string) { setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  function beginAdd() { setEditing(null); setDraft(emptyDraft); setFormError(""); setNotice(""); setShowForm(true); }
  function beginEdit(customer: Customer) { setEditing(customer); setDraft({ name: customer.name, whatsapp: customer.whatsapp, email: customer.email ?? "", notes: customer.notes }); setFormError(""); setNotice(""); setShowForm(true); }

  async function saveCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError(""); setNotice("");
    const normalized = { full_name: draft.name.trim(), whatsapp: draft.whatsapp.trim(), email: draft.email.trim() || null, notes: draft.notes.trim() || null };
    let message = "";
    if (!editing) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setFormError("Sesi admin berakhir. Silakan masuk kembali."); setBusy(false); return; }
      const { data, error: insertError } = await supabase.from("admin_customer_contacts").insert({ ...normalized, created_by: auth.user.id }).select("id,full_name,whatsapp,email,notes,created_at,updated_at").single();
      if (insertError) setFormError(insertError.message);
      else { setContacts((current) => [data as ManualCustomerRow, ...current]); setNotice("Pelanggan berhasil ditambahkan."); message = "Pelanggan berhasil ditambahkan."; }
    } else if (editing.userId) {
      const { error: updateError } = await supabase.rpc("admin_update_customer_bookings", { p_user_id: editing.userId, p_name: normalized.full_name, p_whatsapp: normalized.whatsapp, p_email: normalized.email });
      if (updateError) setFormError(updateError.message);
      else { setNotice("Data pelanggan dan seluruh booking terkait berhasil diperbarui."); message = "Data pelanggan diperbarui."; }
    } else if (editing.contactId) {
      const { data, error: updateError } = await supabase.from("admin_customer_contacts").update({ ...normalized, updated_at: new Date().toISOString() }).eq("id", editing.contactId).select("id,full_name,whatsapp,email,notes,created_at,updated_at").single();
      if (updateError) setFormError(updateError.message);
      else { setContacts((current) => current.map((item) => item.id === editing.contactId ? data as ManualCustomerRow : item)); setNotice("Data pelanggan berhasil diperbarui."); message = "Data pelanggan diperbarui."; }
    }
    setBusy(false);
    if (message) { setEditing(null); setShowForm(false); }
  }

  async function deleteContact(customer: Customer) {
    if (!customer.contactId || !window.confirm(`Hapus kontak ${customer.name} dari direktori admin?`)) return;
    const { error: deleteError } = await supabase.from("admin_customer_contacts").delete().eq("id", customer.contactId);
    if (deleteError) setFormError(deleteError.message);
    else { setContacts((current) => current.filter((item) => item.id !== customer.contactId)); setSelected((current) => current.filter((item) => item !== customer.key)); setNotice("Kontak dihapus dari direktori."); }
  }

  function exportCsv() {
    const rows = customers.filter((customer) => selected.length === 0 || selected.includes(customer.key));
    const lines = [["Nama", "WhatsApp", "Email", "Jumlah Booking", "Booking Terakhir", "Jenis"], ...rows.map((customer) => [customer.name, customer.whatsapp, customer.email ?? "", customer.bookings.length, customer.lastBooking ? new Date(customer.lastBooking).toLocaleDateString("id-ID") : "", customer.userId ? "Pelanggan booking" : "Kontak manual"])];
    const blob = new Blob(["\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `shiap-pelanggan-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div><p className="text-[10px] font-bold tracking-[0.2em] text-[#1974FF]">CUSTOMER RELATIONSHIP</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-extrabold text-[#0A2E63]">Pelanggan</h1><p className="mt-1 text-sm text-slate-500">Kelola kontak pelanggan dan data pemesan booking.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-[#0A2E63]"><Download size={15}/> Export {selected.length ? `(${selected.length})` : "semua"}</button><button type="button" onClick={beginAdd} className="inline-flex items-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3 text-xs font-bold text-white"><Plus size={15}/> Tambah pelanggan</button></div></div>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Data pelanggan gagal dimuat: {error}</p>}{notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-xs text-green-800">{notice}</p>}{formError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{formError}</p>}
    <div className="mt-5 flex flex-wrap items-center gap-3"><label className="flex max-w-lg flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4"><Search size={17} className="text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, WhatsApp, atau email" className="h-11 min-w-0 flex-1 text-sm outline-none"/></label><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500"><Users className="mr-2 inline text-[#1974FF]" size={16}/>{customers.length} pelanggan</div></div>
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">{customers.length ? <><div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><input aria-label="Pilih semua pelanggan yang terlihat" type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => allVisibleSelected ? current.filter((key) => !customers.some((customer) => customer.key === key)) : [...new Set([...current, ...customers.map((customer) => customer.key)])])}/><span className="text-xs font-semibold text-slate-500">Pilih semua yang terlihat</span></div><div className="divide-y divide-slate-100">{customers.map((customer) => <article key={customer.key} className="flex flex-wrap items-center gap-3 p-4 sm:px-5"><input aria-label={`Pilih ${customer.name}`} type="checkbox" checked={selected.includes(customer.key)} onChange={() => toggleSelected(customer.key)}/><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-[#1974FF]">{customer.name.trim().charAt(0).toLocaleUpperCase() || "P"}</div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-[#0A2E63]">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{customer.whatsapp}{customer.email ? ` · ${customer.email}` : ""}</p><p className="mt-1 text-[10px] text-slate-400">{customer.userId ? `${customer.bookings.length} booking · terakhir ${customer.lastBooking ? new Date(customer.lastBooking).toLocaleDateString("id-ID") : "—"}` : "Kontak manual"}</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-[#1974FF]">{customer.bookings.length} booking</span><button type="button" onClick={() => beginEdit(customer)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0A2E63]"><Pencil size={13}/> Edit</button>{customer.contactId ? <button type="button" onClick={() => void deleteContact(customer)} aria-label={`Hapus ${customer.name}`} className="rounded-lg border border-red-100 p-2 text-red-600"><Trash2 size={14}/></button> : customer.bookings[0] && <Link href={`/admin/bookings/${customer.bookings[0].id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0A2E63]">Booking</Link>}</article>)}</div></> : <div className="p-10 text-center text-sm text-slate-500">{query ? "Tidak ada pelanggan yang cocok." : "Pelanggan akan muncul setelah ditambahkan atau ada booking."}</div>}</div>
    {showForm && <CustomerForm onClose={() => setShowForm(false)} onSubmit={(event) => void saveCustomer(event)} draft={draft} setDraft={setDraft} busy={busy} isBookedCustomer={Boolean(editing?.userId)}/>}
  </div>;
}

function CustomerForm({ onClose, onSubmit, draft, setDraft, busy, isBookedCustomer }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; draft: Draft; setDraft: (draft: Draft) => void; busy: boolean; isBookedCustomer: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center"><form onSubmit={onSubmit} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-[#1974FF]">DATA PELANGGAN</p><h2 className="mt-1 text-lg font-extrabold text-[#0A2E63]">{isBookedCustomer ? "Edit pelanggan booking" : "Tambah / edit pelanggan"}</h2></div><button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></header>{isBookedCustomer && <p className="mx-5 mt-4 rounded-lg bg-blue-50 p-3 text-[11px] text-blue-900">Perubahan akan diterapkan pada profil dan seluruh booking pelanggan ini.</p>}<div className="space-y-3 p-5"><label className="block text-xs font-semibold text-slate-600">Nama<input required minLength={2} maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label><label className="block text-xs font-semibold text-slate-600">WhatsApp<input required minLength={5} maxLength={40} value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label><label className="block text-xs font-semibold text-slate-600">Email<input type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>{!isBookedCustomer && <label className="block text-xs font-semibold text-slate-600">Catatan<textarea maxLength={1000} rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/></label>}</div><footer className="flex justify-end gap-2 border-t border-slate-100 p-4"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Batal</button><button disabled={busy} className="rounded-xl bg-[#0A2E63] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan"}</button></footer></form></div>;
}
