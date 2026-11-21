"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import { checkoutBooking } from "@/lib/checkout-client";
import { BOOKING_STORAGE_KEY, type BookingItem, formatRupiah } from "@/lib/booking-engine";
import { bookingDate } from "@/lib/booking-view";
import { eligibleUnifiedCart, unifiedCartPayload, unifiedCheckoutEnabled } from "@/lib/unified-checkout";
import ServiceFeeSummary, { useServiceFeeQuote } from "@/components/booking/service-fee-summary";

type Package = { id: string; title: string; price: number; price_label: string; pricing_basis: string; booking_mode: string; min_guests: number; max_guests: number; addons: { slug: string; name: string; price: number }[] };
type Session = { id: string; package_id: string; starts_at: string; ends_at: string; capacity: number; weather_status: string; location_note: string };
const formatMoney = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const todayMakassar = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function ExperienceBookingForm({ packages, sessions }: { packages: Package[]; sessions: Session[] }) {
  const router = useRouter();
  const lock = useRef(false);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const selectedPackage = packages.find((item) => item.id === packageId);
  const [sessionId, setSessionId] = useState("");
  const [guests, setGuests] = useState(packages[0]?.min_guests ?? 1);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: packages[0]?.min_guests ?? 1 }, () => ""));
  const [consent, setConsent] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [customer, setCustomer] = useState({ name: "", whatsapp: "", email: "", notes: "" });
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<BookingItem[]>([]);
  const [includeCart, setIncludeCart] = useState(false);
  useEffect(() => {
    if (!unifiedCheckoutEnabled) return;
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(BOOKING_STORAGE_KEY) ?? "[]");
        setCart(Array.isArray(saved) && eligibleUnifiedCart(saved) ? saved : []);
      } catch { setCart([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateGuests(value: number) {
    if (!selectedPackage) return;
    const next = Math.max(selectedPackage.min_guests, Math.min(selectedPackage.max_guests, value));
    setGuests(next); setNames((current) => Array.from({ length: next }, (_, index) => current[index] ?? ""));
  }

  const estimate = selectedPackage ? selectedPackage.price * (selectedPackage.pricing_basis === "per_person" ? guests : selectedPackage.pricing_basis === "per_couple" ? Math.ceil(guests / 2) : 1) + selectedAddons.reduce((sum, slug) => sum + Number(selectedPackage.addons.find((addon) => addon.slug === slug)?.price ?? 0) * (selectedPackage.pricing_basis === "per_person" ? guests : selectedPackage.pricing_basis === "per_couple" ? Math.ceil(guests / 2) : 1), 0) : 0;
  const needsSession = selectedPackage ? ["scheduled_session", "private_session"].includes(selectedPackage.booking_mode) : false;
  const feeQuote = useServiceFeeQuote(selectedPackage ? [{ category: "activity", subtotal: Math.round(estimate) }] : []);
  const applicableSessions = selectedPackage ? sessions.filter((session) => session.package_id === selectedPackage.id) : [];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setError(""); setPending(true);
    try {
      if (!selectedPackage || names.some((name) => !name.trim())) throw new Error("Isi nama setiap peserta.");
      if (!consent) throw new Error("Konfirmasi skrining kesehatan dan aturan keselamatan wajib dicentang.");
      if (!feeQuote.data) throw new Error("Tunggu rincian biaya layanan tersedia sebelum booking dikirim.");
      const payload = {
        p_package_id: packageId, p_session_id: sessionId || null,
        p_date: sessionId ? sessions.find((session) => session.id === sessionId)!.starts_at.slice(0, 10) : document.querySelector<HTMLInputElement>("#experience-date")?.value ?? "",
        p_guests: guests, p_customer_name: customer.name, p_customer_whatsapp: customer.whatsapp,
        p_customer_email: customer.email || null, p_customer_notes: customer.notes || null,
        p_participants: names.map((full_name) => ({ full_name: full_name.trim(), health_screening_confirmed: true, safety_rules_accepted: true })),
        p_addon_slugs: selectedAddons, p_request_details: details ? { special_requests: details } : {}, p_safety_consent: true,
      };
      const combined = includeCart && cart.length > 0;
      const id = await checkoutBooking(combined ? "unified" : "experience", combined ? {
        p_customer_name: payload.p_customer_name,
        p_customer_whatsapp: payload.p_customer_whatsapp,
        p_customer_email: payload.p_customer_email,
        p_customer_notes: payload.p_customer_notes,
        p_items: unifiedCartPayload(cart),
        experience: payload,
      } : payload);
      if (combined) {
        try {
          const saved = JSON.parse(localStorage.getItem(BOOKING_STORAGE_KEY) ?? "[]");
          if (JSON.stringify(saved) === JSON.stringify(cart)) localStorage.removeItem(BOOKING_STORAGE_KEY);
        } catch { /* The order was already created. */ }
      }
      router.replace("/my-booking/" + id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permintaan booking belum dapat diproses.");
    } finally { lock.current = false; setPending(false); }
  }

  if (!selectedPackage) return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Paket belum tersedia. Silakan hubungi admin SHIAP.</p>;
  return <form onSubmit={submit} className="space-y-5 rounded-[22px] border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
    <div><h2 className="text-lg font-extrabold text-[#0A2E63]">Rencanakan Experience</h2><p className="mt-1 text-xs text-slate-500">Semua pesanan ini menunggu konfirmasi admin sebelum pembayaran.</p></div>
    <label className="block text-xs font-bold text-[#0A2E63]">Paket
      <select value={packageId} onChange={(event) => { const next = packages.find((item) => item.id === event.target.value); setPackageId(event.target.value); setGuests(next?.min_guests ?? 1); setNames(Array.from({ length: next?.min_guests ?? 1 }, () => "")); setSessionId(""); setSelectedAddons([]); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium">
        {packages.map((item) => <option key={item.id} value={item.id}>{item.title} — {formatMoney(item.price)}/{item.price_label}</option>)}
      </select>
    </label>
    {needsSession && applicableSessions.length > 0 && <label className="block text-xs font-bold text-[#0A2E63]">Sesi tersedia
      <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih sesi</option>{applicableSessions.map((session) => <option key={session.id} value={session.id}>{new Date(session.starts_at).toLocaleString("id-ID")} · {session.location_note}</option>)}</select>
    </label>}
    {needsSession && applicableSessions.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Belum ada sesi terpublikasi. Paket ini belum bisa dipesan; hubungi admin untuk informasi.</p>}
    {!needsSession && <label className="block text-xs font-bold text-[#0A2E63]">Tanggal yang diinginkan<input id="experience-date" type="date" required min={todayMakassar()} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>}
    <div><label className="block text-xs font-bold text-[#0A2E63]">Jumlah peserta</label><div className="mt-1.5 flex items-center gap-3"><button type="button" onClick={() => updateGuests(guests-1)} className="h-10 w-10 rounded-xl border border-slate-200 text-lg">−</button><strong className="min-w-8 text-center text-lg text-[#0A2E63]">{guests}</strong><button type="button" onClick={() => updateGuests(guests+1)} className="h-10 w-10 rounded-xl border border-slate-200 text-lg">+</button><span className="text-[10px] text-slate-500">{selectedPackage.min_guests}–{selectedPackage.max_guests} peserta</span></div></div>
    <div className="space-y-2"><p className="text-xs font-bold text-[#0A2E63]">Nama peserta</p>{names.map((name,index) => <input key={index} value={name} onChange={(event) => setNames((current) => current.map((entry,i) => i===index ? event.target.value : entry))} required placeholder={`Nama peserta ${index+1}`} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/>)}</div>
    {selectedPackage.addons.length > 0 && <fieldset><legend className="text-xs font-bold text-[#0A2E63]">Tambahan opsional</legend><div className="mt-2 space-y-2">{selectedPackage.addons.map((addon) => <label key={addon.slug} className="flex items-center gap-2 rounded-xl border border-slate-100 p-3 text-xs"><input type="checkbox" checked={selectedAddons.includes(addon.slug)} onChange={(event) => setSelectedAddons((current) => event.target.checked ? [...current,addon.slug] : current.filter((slug) => slug!==addon.slug))}/><span className="flex-1">{addon.name}</span><span className="font-bold text-[#0A2E63]">+{formatMoney(Number(addon.price))}</span></label>)}</div></fieldset>}
    <div className="grid gap-3 sm:grid-cols-2"><input required value={customer.name} onChange={(e)=>setCustomer({...customer,name:e.target.value})} placeholder="Nama pemesan" className="h-11 rounded-xl border border-slate-200 px-3 text-sm"/><input required value={customer.whatsapp} onChange={(e)=>setCustomer({...customer,whatsapp:e.target.value})} placeholder="Nomor WhatsApp" className="h-11 rounded-xl border border-slate-200 px-3 text-sm"/><input type="email" value={customer.email} onChange={(e)=>setCustomer({...customer,email:e.target.value})} placeholder="Email (opsional)" className="h-11 rounded-xl border border-slate-200 px-3 text-sm sm:col-span-2"/></div>
    <textarea value={details} onChange={(e)=>setDetails(e.target.value)} placeholder="Kebutuhan diet, tema, tingkat pengalaman, atau permintaan khusus" rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm"/>
    <textarea value={customer.notes} onChange={(e)=>setCustomer({...customer,notes:e.target.value})} placeholder="Catatan untuk admin (opsional)" rows={2} className="w-full rounded-xl border border-slate-200 p-3 text-sm"/>
    <label className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[11px] leading-5 text-[#0A2E63]"><input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} className="mt-1"/><span>Saya mengonfirmasi setiap peserta telah memberi informasi skrining kesehatan yang benar, memahami persyaratan aktivitas, dan menyetujui aturan keselamatan. SHIAP akan meninjau ketersediaan dan kecocokan sebelum pembayaran dibuka.</span></label>
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-orange-800">Estimasi awal</p><ServiceFeeSummary quote={feeQuote.data} error={feeQuote.error} /><p className="mt-1 text-[10px] leading-4 text-slate-600">Harga akhir dan ketersediaan dikonfirmasi admin. Pembayaran dinonaktifkan sampai persetujuan.</p></div>
    {cart.length > 0 && <fieldset className="space-y-2 rounded-xl border border-blue-100 p-3">
      <legend className="font-bold text-[#0A2E63]">Gabungkan layanan</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={includeCart} onChange={(event) => setIncludeCart(event.target.checked)} />Sertakan layanan dari keranjang Booking</label>
      {includeCart && <ul className="space-y-2 text-xs">
        {cart.map((item) => <li key={item.id} className="break-words"><strong>{item.serviceName}</strong> · {bookingDate(item.dateStart)} · {item.guests} orang · {formatRupiah(item.stayRate ? item.stayRate.subtotal * item.quantity : Number(item.unitPrice) * item.guests)}</li>)}
        <li>Masuk ke akun untuk checkout gabungan. Tagihan akhir dihitung saat reservasi dibuat dan pembayaran tersedia setelah semua persetujuan selesai.</li>
      </ul>}
    </fieldset>}
    {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"><AlertCircle size={15} className="shrink-0"/>{error}</p>}
    <button disabled={pending || !feeQuote.data || (needsSession && (!applicableSessions.length || !sessionId))} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 text-sm font-extrabold text-white hover:bg-[#0A2E63] disabled:opacity-60">{pending?<LoaderCircle size={17} className="animate-spin"/>:<ShieldCheck size={17}/>} {pending?"Mengirim permintaan...":"Kirim permintaan booking"}</button>
  </form>;
}
