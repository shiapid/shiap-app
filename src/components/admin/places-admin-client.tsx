"use client";

import {DestinationSelect} from "@/components/destinations/destination-select";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert, LoaderCircle, MoreVertical, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeIdPhone } from "@/lib/places/utils";

type Destination = { id: string; slug: string; name: string; canonical_name: string; city: string | null; province: string | null; aliases: string[]; is_active: boolean };
type Property = { id: string; slug: string; name: string; destination_id: string; accommodation_type: string; whatsapp_phone: string; status: string; is_demo: boolean; contact_verified_at: string | null; contact_verification_expires_at: string | null };
type Profile = { property_id: string; description: string | null; cover_image_url: string | null; gallery_urls: string[]; capacity: number | null; facilities: string[]; room_summaries: { name?: string; capacity?: number; description?: string }[]; starting_price_idr: number | null; policies: string | null; map_url: string | null };
type Plan = { premium_monthly_price_idr: number; price_status: "proposed" | "actual"; max_units: number; premium_enabled: boolean };
const input = "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0A2E63] outline-none focus:border-[#1265D8] focus:ring-2 focus:ring-blue-100";
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
const options = [["villa","Villa"],["hotel","Hotel"],["homestay","Homestay"],["guesthouse","Guest house"],["resort","Resort"],["other","Lainnya"]];
const statuses = [["draft","Draft"],["pending_verification","Menunggu verifikasi"],["published","Tayang"],["suspended","Ditangguhkan"],["archived","Arsip"]];
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100);

export function PlacesAdminClient({ destinations, properties, profiles, plan, loadError }: { destinations: Destination[]; properties: Property[]; profiles: Profile[]; plan: Plan | null; loadError: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [verificationTime] = useState(Date.now);
  const [message, setMessage] = useState("");
  const [property, setProperty] = useState({ name: "", destination_id: "", whatsapp_phone: "" });
  const [planDraft, setPlanDraft] = useState(plan ? { premium_monthly_price_idr: String(plan.premium_monthly_price_idr), price_status: plan.price_status, max_units: String(plan.max_units) } : null);
  const supabase = createClient();
  async function run(key: string, action: () => PromiseLike<{ error: { message?: string } | null }>, success: string) {
    setBusy(key); setMessage("");
    try { const result = await action(); if (result.error) throw new Error(result.error.message || "Permintaan gagal."); setMessage(success); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Perubahan belum dapat disimpan."); }
    finally { setBusy(""); }
  }

  function propertyRow(item: Property, hasProfile: boolean) {
    const verified = Boolean(item.contact_verified_at && (!item.contact_verification_expires_at || new Date(item.contact_verification_expires_at).getTime() > verificationTime));
    const destinationName = destinations.find(d=>d.id===item.destination_id)?.name || "—";
    const closeMenu = (event: React.MouseEvent<HTMLButtonElement>) => event.currentTarget.closest("details")?.removeAttribute("open");
    return <div className="relative flex min-h-16 items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1 overflow-x-auto"><div className="grid min-w-[680px] grid-cols-[minmax(150px,1.5fr)_minmax(130px,1fr)_140px_100px_120px_70px] items-center gap-3 text-xs">
        <span className="truncate font-bold text-[#0A2E63]" title={item.name}>{item.name}</span>
        <span className="truncate text-slate-600" title={destinationName}>{destinationName}</span>
        <span className="text-slate-600">{item.whatsapp_phone}</span>
        <span className={item.status==="published"&&verified?"font-semibold text-emerald-700":"font-semibold text-slate-500"}>{item.status==="published"?(verified?"Aktif":"Tidak aktif"):statuses.find(([v])=>v===item.status)?.[1] || item.status}</span>
        <span className={verified?"text-[#1265D8]":"text-amber-700"}>{verified?"Terverifikasi":item.contact_verified_at?"Verifikasi kedaluwarsa":"Belum verifikasi"}</span>
        <span title="Places Premium belum diaktifkan. Profil lengkap bukan status langganan berbayar." className="w-fit rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Free</span>
      </div></div>
      <details className="group relative shrink-0"><summary aria-label={'Aksi properti '+item.name} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1265D8] [&::-webkit-details-marker]:hidden"><MoreVertical size={19}/></summary>
        <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <button type="button" disabled={Boolean(busy)} onClick={e=>{closeMenu(e);setEditingId(item.id);}} className="min-h-11 w-full rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-50">Edit properti{hasProfile?" & profil":""}</button>
          <button type="button" disabled={Boolean(busy)} onClick={e=>{closeMenu(e);setEditingId(item.id);}} className="min-h-11 w-full rounded-lg px-3 text-left text-xs font-semibold text-[#1265D8] hover:bg-blue-50">Verifikasi &amp; Terbitkan</button>
          <button type="button" disabled={Boolean(busy)||!item.contact_verified_at} onClick={e=>{closeMenu(e);void run('revoke-'+item.id,()=>supabase.rpc("admin_revoke_places_contact",{p_property_id:item.id}),"Verifikasi dicabut dan publikasi ditarik.");}} className="min-h-11 w-full rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Tarik publikasi</button>
          <button type="button" disabled={Boolean(busy)} onClick={e=>{closeMenu(e);void archiveProperty(item);}} className="min-h-11 w-full rounded-lg px-3 text-left text-xs font-semibold text-red-700 hover:bg-red-50">Hapus properti</button>
        </div>
      </details>
    </div>;
  }

  async function createProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = normalizeIdPhone(property.whatsapp_phone);
    if (!phone || property.name.trim().length < 2 || !property.destination_id) return setMessage("Nama, destinasi, dan WhatsApp resmi yang valid wajib diisi.");
    setBusy("property"); setMessage("");
    try {
      const { error } = await supabase.rpc("admin_create_free_places_listing", { p_name: property.name.trim(), p_destination_id: property.destination_id, p_whatsapp: phone });
      if (error) throw new Error(error.message);
      setMessage("Kontak terverifikasi dan properti diterbitkan.");
      setProperty({ name: "", destination_id: "", whatsapp_phone: "" }); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Properti belum dapat disimpan."); }
    finally { setBusy(""); }
  }

  async function saveFreeProperty(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim(); const phone = normalizeIdPhone(String(form.get("whatsapp_phone") || ""));
    if (name.length < 2 || name.length > 160 || !phone) return setMessage("Nama dan WhatsApp resmi wajib valid.");
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    await run('free-'+id,()=>supabase.rpc("admin_save_free_places_listing",{p_property_id:id,p_name:name,p_destination_id:String(form.get("destination_id")||""),p_whatsapp:phone,p_publish:publish}),publish?"Kontak diverifikasi dan properti diterbitkan.":"Properti disimpan.");
  }
  async function archiveProperty(item: Property) {
    if (!window.confirm('Hapus properti "'+item.name+'" dari daftar dan direktori publik? Riwayat tetap tersimpan.')) return;
    await run('delete-'+item.id,()=>supabase.from("places_properties").update({status:"archived"}).eq("id",item.id),"Properti dihapus dari daftar dan direktori publik.");
  }

  async function updateProperty(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const phone = normalizeIdPhone(String(form.get("whatsapp_phone") || ""));
    if (!phone) return setMessage("Nomor WhatsApp properti tidak valid.");
    const status = String(form.get("status") || "draft");
    if (!statuses.some(([value]) => value === status)) return setMessage("Status properti tidak valid.");
    await run(`property-${id}`, () => supabase.from("places_properties").update({ name: String(form.get("name") || "").trim(), slug: slugify(String(form.get("slug") || "")), destination_id: String(form.get("destination_id") || ""), accommodation_type: String(form.get("accommodation_type") || "other"), whatsapp_phone: phone, status }).eq("id", id), "Data properti diperbarui.");
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const price = String(form.get("starting_price_idr") || ""); const capacity = String(form.get("capacity") || "");
    const cover = String(form.get("cover_image_url") || "").trim(); const map = String(form.get("map_url") || "").trim();
    if (cover && !/^https:\/\//i.test(cover) || map && !/^https:\/\//i.test(map)) return setMessage("Tautan foto dan peta harus menggunakan HTTPS.");
    if (price && (!/^\d+$/.test(price) || !Number.isSafeInteger(Number(price)))) return setMessage("Harga harus berupa integer IDR non-negatif.");
    await run(`profile-${id}`, () => supabase.from("places_property_profiles").upsert({ property_id: id, description: String(form.get("description") || "").trim() || null, cover_image_url: cover || null, capacity: capacity ? Number(capacity) : null, starting_price_idr: price ? Number(price) : null, facilities: String(form.get("facilities") || "").split(",").map((item) => item.trim()).filter(Boolean), policies: String(form.get("policies") || "").trim() || null, map_url: map || null }, { onConflict: "property_id" }), "Profil Places diperbarui.");
  }

  async function verifyContact(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const expiry = String(form.get("valid_until") || "");
    const expiryDate = expiry ? new Date(`${expiry}T23:59:59`) : null;
    if (!expiryDate || Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) return setMessage("Tanggal masa verifikasi harus berada di masa depan.");
    const validUntil = expiryDate.toISOString();
    await run(`verify-${id}`, async () => {
      const { error } = await supabase.rpc("admin_record_places_contact_verification", { p_property_id: id, p_channel: String(form.get("channel")), p_evidence_note: String(form.get("evidence_note") || ""), p_evidence_private_path: null, p_valid_until: validUntil });
      return { error };
    }, "Verifikasi kontak tersimpan. Pilih status Tayang setelah tinjauan siap dipublikasikan.");
  }

  async function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!planDraft) return;
    const price = Number(planDraft.premium_monthly_price_idr); const units = Number(planDraft.max_units);
    if (!Number.isSafeInteger(price) || price < 0 || !Number.isInteger(units) || units < 1) return setMessage("Harga harus integer IDR non-negatif dan batas unit minimal 1.");
    const { data: auth } = await supabase.auth.getUser();
    await run("plan", () => supabase.from("places_plan_settings").update({ premium_monthly_price_idr: price, price_status: planDraft.price_status, max_units: units, updated_by: auth.user?.id ?? null }).eq("id", true), "Konfigurasi harga Places Premium disimpan.");
  }

  return <div className="space-y-5">
    <Link href="/admin/places/leads" className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 bg-white px-4 text-xs font-bold text-[#1265D8]">Leads Places</Link>
    <Link href="/admin/places/claims" className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 px-3 text-xs font-bold text-[#1265D8]">Partner &amp; Kepemilikan</Link><Link href="/admin/places/analytics" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">Analitik</Link><Link href="/admin/places/billing" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">Langganan &amp; Billing</Link><Link href="/admin/places/premium" className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 px-3 text-xs font-bold text-[#1265D8]">Konten Premium</Link><Link href="/admin/places/settings" className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 bg-white px-4 text-xs font-bold text-[#1265D8]">Pengaturan → Template WhatsApp</Link>
    <header><p className="text-[10px] font-extrabold tracking-[.17em] text-[#1265D8]">PLACES · OPERASIONAL</p><h1 className="mt-1 text-2xl font-extrabold text-[#0A2E63]">Direktori & verifikasi</h1><p className="mt-1 text-sm text-slate-500">Listing hanya tampil setelah kontak diverifikasi dan statusnya dipublikasikan.</p></header>
    {message ? <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-[#0A2E63]">{message}</p> : null}
    {loadError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Data Places belum tersedia. Pastikan migration Places telah diterapkan pada lingkungan non-production.</p> : null}

    <Link href="/admin/destinations" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Kelola Master Destinasi →</Link>

    <section className={card}><h2 className="font-extrabold text-[#0A2E63]">Tambah properti Gratis</h2><p className="mt-1 text-xs text-slate-500">Dengan Verifikasi &amp; Terbitkan, Admin menyatakan telah memeriksa kepemilikan dan kebenaran WhatsApp resmi.</p><form onSubmit={createProperty} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Nama Properti<input required minLength={2} maxLength={160} className={input} value={property.name} onChange={(e)=>setProperty({...property,name:e.target.value})}/></label>
      <label className="text-xs font-semibold text-slate-600">Destinasi<DestinationSelect required value={property.destination_id} onChange={v=>setProperty({...property,destination_id:String(v)})}/></label>
      <label className="text-xs font-semibold text-slate-600">Nomor WhatsApp Resmi<input required type="tel" maxLength={40} className={input} placeholder="08… atau +62…" value={property.whatsapp_phone} onChange={(e)=>setProperty({...property,whatsapp_phone:e.target.value})}/></label>
      <button disabled={busy==="property"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A2E63] px-4 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2">{busy==="property"?<LoaderCircle size={15} className="animate-spin"/>:<BadgeCheck size={15}/>}Verifikasi &amp; Terbitkan</button>
    </form></section>

    <section className="space-y-3"><h2 className="font-extrabold text-[#0A2E63]">Properti ({properties.filter(item=>item.status!=="archived").length})</h2><p className="text-xs text-slate-500">Nama · Destinasi · WhatsApp · Status · Verifikasi · Paket. Semua listing saat ini Free; Premium belum aktif. Geser baris pada layar kecil untuk melihat seluruh kolom.</p>{properties.length ? properties.filter(item=>item.status!=="archived").map((item)=>{
      const profile=profiles.find(p=>p.property_id===item.id);
      const hasProfile=Boolean(profile && (profile.description || profile.cover_image_url || profile.gallery_urls?.length || profile.capacity || profile.starting_price_idr!=null || profile.facilities?.length || profile.room_summaries?.length || profile.policies || profile.map_url));
      if(!hasProfile) return <article key={item.id} className="relative rounded-xl border border-slate-200 bg-white">
        {propertyRow(item,false)}
        {editingId===item.id ? <div className="border-t border-slate-100 p-4"><button type="button" onClick={()=>setEditingId(null)} className="mb-3 min-h-10 text-xs font-bold text-slate-500">Tutup editor</button>
        <form onSubmit={event=>void saveFreeProperty(event,item.id)} className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Nama Properti<input name="name" required minLength={2} maxLength={160} defaultValue={item.name} className={input}/></label>
          <label className="text-xs font-semibold text-slate-600">Destinasi<DestinationSelect name="destination_id" required defaultValue={item.destination_id}/></label>
          <label className="text-xs font-semibold text-slate-600">Nomor WhatsApp Resmi<input name="whatsapp_phone" type="tel" required maxLength={40} defaultValue={item.whatsapp_phone} className={input}/></label>
          <p className="text-xs text-slate-500 sm:col-span-3">{item.status==="published"?"Tayang":"Tidak tayang"} · {item.contact_verified_at?"Kontak telah diverifikasi":"Belum diverifikasi"}. Verifikasi &amp; Terbitkan menyatakan Admin telah memeriksa WhatsApp resmi.</p>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button disabled={Boolean(busy)} type="submit" value="save" className="min-h-11 rounded-xl border border-blue-200 px-4 text-xs font-bold text-[#1265D8]">Simpan perubahan</button>
            <button disabled={Boolean(busy)} type="submit" value="publish" className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-xs font-bold text-white">Verifikasi &amp; Terbitkan</button>
            <button disabled={Boolean(busy)||!item.contact_verified_at} type="button" onClick={()=>void run('revoke-'+item.id,()=>supabase.rpc("admin_revoke_places_contact",{p_property_id:item.id}),"Verifikasi dicabut dan publikasi ditarik.")} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-50">Tarik publikasi</button>
            <button disabled={Boolean(busy)} type="button" onClick={()=>void archiveProperty(item)} className="min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-700">Hapus properti</button>
          </div>
        </form>
        </div> : null}
      </article>;
      return <article key={item.id} className="relative rounded-xl border border-slate-200 bg-white">
      {propertyRow(item,true)}
      {editingId===item.id ? <div className="border-t border-slate-100 p-4"><button type="button" onClick={()=>setEditingId(null)} className="mb-3 min-h-10 text-xs font-bold text-slate-500">Tutup editor</button>
      <form onSubmit={(event)=>void updateProperty(event,item.id)} className="grid gap-2 sm:grid-cols-3">
        <label className="text-[10px] font-semibold text-slate-500">Nama<input name="name" required defaultValue={item.name} className={input}/></label>
        <label className="text-[10px] font-semibold text-slate-500">Slug<input name="slug" required defaultValue={item.slug} className={input}/></label>
        <label className="text-[10px] font-semibold text-slate-500">WhatsApp resmi<input name="whatsapp_phone" required defaultValue={item.whatsapp_phone} className={input}/></label>
        <label className="text-[10px] font-semibold text-slate-500">Destinasi<DestinationSelect name="destination_id" required defaultValue={item.destination_id}/></label>
        <label className="text-[10px] font-semibold text-slate-500">Jenis<select name="accommodation_type" defaultValue={item.accommodation_type} className={input}>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-slate-500">Status<select name="status" defaultValue={item.status} className={input}>{statuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button disabled={busy===`property-${item.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 text-xs font-bold text-[#1265D8] disabled:opacity-50 sm:col-span-3"><Save size={14}/> Simpan properti</button>
      </form>
      <form onSubmit={(event)=>void updateProfile(event,item.id)} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
        {(()=>{const p=profiles.find((profile)=>profile.property_id===item.id);return <>
          <label className="text-[10px] font-semibold text-slate-500 sm:col-span-3">Deskripsi<textarea name="description" defaultValue={p?.description??""} rows={2} className={`${input} h-auto py-2`}/></label>
          <label className="text-[10px] font-semibold text-slate-500">Foto HTTPS<input type="url" name="cover_image_url" defaultValue={p?.cover_image_url??""} className={input}/></label>
          <label className="text-[10px] font-semibold text-slate-500">Kapasitas<input type="number" min="1" step="1" name="capacity" defaultValue={p?.capacity??""} className={input}/></label>
          <label className="text-[10px] font-semibold text-slate-500">Harga mulai IDR<input type="number" min="0" step="1" name="starting_price_idr" defaultValue={p?.starting_price_idr??""} className={input}/></label>
          <label className="text-[10px] font-semibold text-slate-500">Fasilitas, pisahkan koma<input name="facilities" defaultValue={(p?.facilities??[]).join(", ")} className={input}/></label>
          <label className="text-[10px] font-semibold text-slate-500">Link peta HTTPS<input type="url" name="map_url" defaultValue={p?.map_url??""} className={input}/></label>
          <label className="text-[10px] font-semibold text-slate-500">Kebijakan<textarea name="policies" defaultValue={p?.policies??""} rows={1} className={`${input} h-auto py-2`}/></label>
        </>;})()}
        <button disabled={busy===`profile-${item.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-[#1265D8] disabled:opacity-50 sm:col-span-3"><Save size={13}/> Simpan profil publik</button>
      </form>
      <button type="button" disabled={Boolean(busy) || !item.contact_verified_at} onClick={()=>void run(`revoke-${item.id}`,()=>supabase.rpc("admin_revoke_places_contact",{p_property_id:item.id}),"Verifikasi dicabut dan publikasi ditarik.")} className="mt-3 min-h-11 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 disabled:opacity-50">Cabut verifikasi &amp; tarik publikasi</button>
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="flex items-center gap-2 text-xs font-bold text-[#0A2E63]"><BadgeCheck size={15} className="text-[#1265D8]"/>Verifikasi kontak</p><p className="mt-1 text-[10px] text-slate-600">Terakhir: {item.contact_verified_at?new Date(item.contact_verified_at).toLocaleDateString("id-ID"):"Belum diverifikasi"} · Berlaku sampai {item.contact_verification_expires_at?new Date(item.contact_verification_expires_at).toLocaleDateString("id-ID"):"—"}</p>
        <form onSubmit={(event)=>void verifyContact(event,item.id)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
          <select name="channel" className={input}><option value="whatsapp">WhatsApp</option><option value="phone">Telepon</option><option value="email">Email</option><option value="in_person">Langsung</option><option value="business_documents">Dokumen bisnis</option><option value="other">Lainnya</option></select>
          <input name="evidence_note" required minLength={3} maxLength={2000} placeholder="Catatan bukti internal" className={input}/>
          <label className="text-[10px] font-semibold text-slate-500">Berlaku sampai<input required type="date" min={new Date().toISOString().slice(0,10)} name="valid_until" className={input}/></label>
          <button disabled={busy===`verify-${item.id}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#1265D8] px-3 text-[10px] font-bold text-white disabled:opacity-50"><BadgeCheck size={14}/>Verifikasi</button>
        </form>
      </div>
      {item.is_demo ? <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-[10px] text-amber-900"><CircleAlert size={14}/>Properti demo tidak pernah ditampilkan sebagai listing nyata.</p> : null}
      </div> : null}
    </article>}) : <p className={card + " text-sm text-slate-500"}>Belum ada properti. Destinasi sudah siap, properti hanya muncul setelah verifikasi kontak.</p>}</section>

    <section className={card}><h2 className="font-extrabold text-[#0A2E63]">Places Premium · konfigurasi harga</h2><p className="mt-1 text-xs leading-5 text-slate-500">Pengaturan ini hanya menampilkan usulan/harga plan. Produk Premium tetap nonaktif; halaman ini tidak menerima langganan, booking, atau pembayaran.</p>{planDraft ? <form onSubmit={updatePlan} className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Harga bulanan IDR<input type="number" min="0" step="1" required value={planDraft.premium_monthly_price_idr} onChange={(e)=>setPlanDraft({...planDraft,premium_monthly_price_idr:e.target.value})} className={input}/></label><label className="text-xs font-semibold text-slate-600">Status harga<select value={planDraft.price_status} onChange={(e)=>setPlanDraft({...planDraft,price_status:e.target.value as Plan["price_status"]})} className={input}><option value="proposed">Usulan</option><option value="actual">Harga aktual</option></select></label><label className="text-xs font-semibold text-slate-600">Maksimum unit<input type="number" min="1" step="1" required value={planDraft.max_units} onChange={(e)=>setPlanDraft({...planDraft,max_units:e.target.value})} className={input}/></label><button disabled={busy==="plan"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A2E63] px-4 text-xs font-bold text-white sm:col-span-3"><Save size={14}/>Simpan konfigurasi</button></form> : <p className="mt-3 text-xs text-slate-500">Konfigurasi harga belum dapat dimuat.</p>}</section>
  </div>;
}
