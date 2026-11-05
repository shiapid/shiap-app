"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Compass,
  Minus,
  Plus,
  Ship,
  ShoppingBag,
  Trash2,
  UserRound,
  Waves,
} from "lucide-react";
import { trips } from "@/lib/trips";
import {
  BOOKING_DRAFTS_KEY,
  BOOKING_STORAGE_KEY,
  createBookingId,
  formatRupiah,
  serviceLabels,
  type BookingCustomer,
  type BookingDraft,
  type BookingItem,
  type BookingServiceType,
} from "@/lib/booking-engine";

const serviceOptions: { value: BookingServiceType; label: string; description: string; icon: typeof Ship }[] = [
  { value: "trip", label: "Trip", description: "Open Trip & Private Trip", icon: Compass },
  { value: "stay", label: "Stay / Villa", description: "Villa, kamar & akomodasi", icon: BedDouble },
  { value: "activity", label: "Wahana", description: "Jetski, kano, paddleboard", icon: Waves },
  { value: "documentation", label: "Dokumentasi", description: "Drone, underwater, cinematic", icon: Camera },
  { value: "other", label: "Layanan lainnya", description: "Layanan SHIAP berikutnya", icon: ShoppingBag },
];

const emptyCustomer: BookingCustomer = { name: "", whatsapp: "", email: "", notes: "" };

function newItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function BookingEngineClient() {
  const [serviceType, setServiceType] = useState<BookingServiceType>("trip");
  const [serviceName, setServiceName] = useState("");
  const [variant, setVariant] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [guests, setGuests] = useState(2);
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [cart, setCart] = useState<BookingItem[]>([]);
  const [customer, setCustomer] = useState<BookingCustomer>(emptyCustomer);
  const [loaded, setLoaded] = useState(false);
  const [savedDraft, setSavedDraft] = useState<BookingDraft | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BOOKING_STORAGE_KEY);
      if (stored) setCart(JSON.parse(stored) as BookingItem[]);

      const params = new URLSearchParams(window.location.search);
      const tripSlug = params.get("trip");
      const mode = params.get("mode");
      if (tripSlug) {
        const trip = trips.find((item) => item.slug === tripSlug);
        if (trip) {
          setServiceType("trip");
          setServiceName(trip.title);
          setVariant(mode === "open" ? "Open Trip" : mode === "private" ? "Private Trip" : "");
        }
      }
    } catch {
      setNotice("Data booking lokal tidak dapat dibaca. Kamu masih bisa membuat pesanan baru.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(cart));
  }, [cart, loaded]);

  const selectedService = serviceOptions.find((item) => item.value === serviceType)!;
  const Icon = selectedService.icon;

  const totalGuests = useMemo(
    () => cart.reduce((sum, item) => sum + item.guests, 0),
    [cart],
  );

  function addItem() {
    if (!serviceName.trim()) {
      setNotice("Isi nama layanan terlebih dahulu.");
      return;
    }
    if (!dateStart) {
      setNotice("Pilih tanggal mulai layanan.");
      return;
    }
    if (dateEnd && dateEnd < dateStart) {
      setNotice("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }

    const item: BookingItem = {
      id: newItemId(),
      serviceType,
      serviceName: serviceName.trim(),
      variant: variant.trim() || undefined,
      dateStart,
      dateEnd: dateEnd || undefined,
      quantity: Math.max(1, quantity),
      guests: Math.max(1, guests),
      priceStatus: "unquoted",
      notes: itemNotes.trim() || undefined,
      addedAt: new Date().toISOString(),
    };
    setCart((current) => [...current, item]);
    setNotice(`${serviceName} ditambahkan ke keranjang.`);
    setServiceName("");
    setVariant("");
    setDateStart("");
    setDateEnd("");
    setItemNotes("");
    setQuantity(1);
    setGuests(2);
  }

  function removeItem(id: string) {
    setCart((current) => current.filter((item) => item.id !== id));
    setNotice("Item dihapus dari keranjang.");
  }

  function saveDraft() {
    if (cart.length === 0) {
      setNotice("Tambahkan minimal satu layanan ke keranjang.");
      return;
    }
    if (!customer.name.trim() || !customer.whatsapp.trim()) {
      setNotice("Nama dan nomor WhatsApp wajib diisi.");
      return;
    }

    const draft: BookingDraft = {
      id: createBookingId(),
      createdAt: new Date().toISOString(),
      status: "draft",
      customer,
      items: cart,
    };

    try {
      const previous = JSON.parse(localStorage.getItem(BOOKING_DRAFTS_KEY) || "[]") as BookingDraft[];
      localStorage.setItem(BOOKING_DRAFTS_KEY, JSON.stringify([...previous, draft]));
      setSavedDraft(draft);
      setNotice("Draft pesanan tersimpan di perangkat ini.");
    } catch {
      setNotice("Draft tidak dapat disimpan pada browser ini.");
    }
  }

  function updateCustomer(field: keyof BookingCustomer, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-12">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-8">
        <Link href="/trip" className="inline-flex items-center gap-2 text-xs font-semibold text-[#1974FF]">
          <ArrowLeft size={15} /> Kembali ke Trip
        </Link>

        <div className="mt-4 rounded-[26px] bg-gradient-to-br from-[#0A2E63] to-[#1974FF] p-5 text-white sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">SHIAP · One booking platform</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Semua layanan, satu booking.</h1>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-blue-100 sm:text-sm">
            Gabungkan Trip, Stay, Wahana, Dokumentasi, dan layanan SHIAP lainnya dalam satu keranjang pemesanan.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {serviceOptions.slice(0, 4).map((option) => {
              const ServiceIcon = option.icon;
              return (
                <span key={option.value} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold">
                  <ServiceIcon size={12} /> {option.label}
                </span>
              );
            })}
          </div>
        </div>

        {notice && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-[#0A2E63]">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Tutup pesan" className="shrink-0">×</button>
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1974FF]"><Icon size={20}/></span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">Add service</p>
                  <h2 className="text-base font-bold text-[#0A2E63]">Tambah layanan</h2>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {serviceOptions.map((option) => {
                  const ServiceIcon = option.icon;
                  const active = serviceType === option.value;
                  return (
                    <button key={option.value} type="button" onClick={() => { setServiceType(option.value); setServiceName(""); setVariant(""); }} className={`rounded-2xl border p-3 text-left transition ${active ? "border-[#1974FF] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}>
                      <ServiceIcon size={18} className={active ? "text-[#1974FF]" : "text-slate-400"}/>
                      <span className={`mt-2 block text-xs font-bold ${active ? "text-[#1974FF]" : "text-[#0A2E63]"}`}>{option.label}</span>
                      <span className="mt-1 block text-[9px] leading-relaxed text-slate-400">{option.description}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Nama layanan / paket</span>
                  {serviceType === "trip" ? (
                    <select value={serviceName} onChange={(event) => setServiceName(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0A2E63] outline-none focus:border-[#1974FF]">
                      <option value="">Pilih paket Trip</option>
                      {trips.map((trip) => <option key={trip.slug} value={trip.title}>{trip.title}</option>)}
                      <option value="Trip lainnya">Trip lainnya / custom</option>
                    </select>
                  ) : (
                    <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder={serviceType === "stay" ? "Contoh: Villa SHIAP - Family Room" : serviceType === "activity" ? "Contoh: Jetski / Paddleboard" : serviceType === "documentation" ? "Contoh: Drone / Underwater Video" : "Nama layanan"} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs text-[#0A2E63] outline-none placeholder:text-slate-400 focus:border-[#1974FF]"/>
                  )}
                </label>

                <label>
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Tipe / pilihan layanan</span>
                  <input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder={serviceType === "trip" ? "Open Trip / Private Trip" : "Tipe kamar / paket / sesi"} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs text-[#0A2E63] outline-none placeholder:text-slate-400 focus:border-[#1974FF]"/>
                </label>

                <label>
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Tanggal mulai</span>
                  <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs text-[#0A2E63] outline-none focus:border-[#1974FF]"/>
                </label>

                {serviceType === "stay" && (
                  <label>
                    <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Tanggal check-out</span>
                    <input type="date" min={dateStart || undefined} value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs text-[#0A2E63] outline-none focus:border-[#1974FF]"/>
                  </label>
                )}

                <div>
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Jumlah peserta / tamu</span>
                  <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 px-3">
                    <button type="button" onClick={() => setGuests((value) => Math.max(1, value - 1))} className="text-slate-500"><Minus size={15}/></button>
                    <span className="text-xs font-bold text-[#0A2E63]">{guests} orang</span>
                    <button type="button" onClick={() => setGuests((value) => Math.min(100, value + 1))} className="text-[#1974FF]"><Plus size={15}/></button>
                  </div>
                </div>

                {(serviceType === "stay" || serviceType === "activity" || serviceType === "documentation" || serviceType === "other") && (
                  <div>
                    <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">{serviceType === "stay" ? "Jumlah kamar" : "Jumlah unit / paket"}</span>
                    <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 px-3">
                      <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="text-slate-500"><Minus size={15}/></button>
                      <span className="text-xs font-bold text-[#0A2E63]">{quantity}</span>
                      <button type="button" onClick={() => setQuantity((value) => Math.min(50, value + 1))} className="text-[#1974FF]"><Plus size={15}/></button>
                    </div>
                  </div>
                )}

                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Catatan kebutuhan (opsional)</span>
                  <textarea value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} rows={2} placeholder="Tuliskan kebutuhan khusus, lokasi, jam, atau detail lainnya..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-[#0A2E63] outline-none placeholder:text-slate-400 focus:border-[#1974FF]"/>
                </label>
              </div>

              <button type="button" onClick={addItem} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-500/15 transition hover:bg-blue-700">
                <Plus size={16}/> Tambahkan ke keranjang
              </button>
              <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-400">Harga dan ketersediaan akan dikonfirmasi oleh admin SHIAP.</p>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">Your order</p>
                  <h2 className="text-base font-bold text-[#0A2E63]">Keranjang booking</h2>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-[#1974FF]">{cart.length} layanan</span>
              </div>

              {cart.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
                  <ShoppingBag size={26} className="mx-auto text-slate-300"/>
                  <p className="mt-2 text-xs font-semibold text-slate-500">Keranjang masih kosong</p>
                  <p className="mt-1 text-[10px] text-slate-400">Tambahkan layanan yang ingin kamu pesan.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {cart.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-[#1974FF]">{serviceLabels[item.serviceType]}</span>
                          <h3 className="mt-2 text-xs font-bold text-[#0A2E63]">{item.serviceName}</h3>
                          {item.variant && <p className="mt-0.5 text-[10px] text-slate-500">{item.variant}</p>}
                          <p className="mt-1 text-[10px] text-slate-500">{item.dateStart}{item.dateEnd ? ` – ${item.dateEnd}` : ""} · {item.guests} orang{item.serviceType !== "trip" ? ` · ${item.quantity} unit` : ""}</p>
                          {item.notes && <p className="mt-1 text-[10px] text-slate-400">{item.notes}</p>}
                        </div>
                        <button type="button" onClick={() => removeItem(item.id)} aria-label="Hapus item" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15}/></button>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                        <span className="text-[9px] text-slate-400">Estimasi harga</span>
                        <span className="text-[10px] font-bold text-[#0A2E63]">{formatRupiah(item.unitPrice)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1974FF]"><UserRound size={19}/></span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">Customer details</p>
                  <h2 className="text-base font-bold text-[#0A2E63]">Data pemesan</h2>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Nama lengkap *</span>
                  <input value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} placeholder="Nama pemesan" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-[#1974FF]"/>
                </label>
                <label>
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Nomor WhatsApp *</span>
                  <input value={customer.whatsapp} onChange={(event) => updateCustomer("whatsapp", event.target.value)} placeholder="08xxxxxxxxxx" inputMode="tel" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-[#1974FF]"/>
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Email (opsional)</span>
                  <input type="email" value={customer.email} onChange={(event) => updateCustomer("email", event.target.value)} placeholder="email@contoh.com" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-[#1974FF]"/>
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Catatan untuk admin (opsional)</span>
                  <textarea rows={2} value={customer.notes} onChange={(event) => updateCustomer("notes", event.target.value)} placeholder="Pesan tambahan..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-[#1974FF]"/>
                </label>
              </div>
              <button type="button" onClick={saveDraft} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A2E63] px-4 py-3.5 text-xs font-bold text-white transition hover:bg-[#08244d]">
                <ClipboardList size={16}/> Simpan draft pesanan
              </button>
              <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-400">Tahap ini menyimpan draft secara lokal di browser. Belum mengirim pesanan ke server atau admin.</p>
              {savedDraft && (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800"><CheckCircle2 size={16}/> Draft berhasil disimpan di perangkat</div>
                  <p className="mt-1 text-[10px] text-emerald-700">ID draft: {savedDraft.id}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-emerald-700">Ini belum merupakan booking terkonfirmasi. Integrasi server, invoice, pembayaran, dan WhatsApp akan dibuat pada tahap backend berikutnya.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="h-fit rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">Order summary</p>
            <h2 className="mt-1 text-lg font-bold text-[#0A2E63]">Ringkasan pesanan</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Jumlah layanan</span><strong className="text-[#0A2E63]">{cart.length}</strong></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Total peserta / tamu</span><strong className="text-[#0A2E63]">{totalGuests}</strong></div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Total harga</span><strong className="text-[#0A2E63]">Menunggu penawaran</strong></div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Harga setiap layanan akan dihitung atau dikonfirmasi sesuai jenis produk, tanggal, jumlah peserta, dan ketersediaan.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-blue-50 p-3 text-[10px] leading-relaxed text-[#1759B8]">
              Satu keranjang dapat menampung beberapa kategori layanan SHIAP.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
