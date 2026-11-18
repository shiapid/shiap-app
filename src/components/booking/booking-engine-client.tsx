"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkoutBooking } from "@/lib/checkout-client";
import ServiceCategoryIcon from "@/components/booking/service-category-icon";
import ServiceFeeSummary, { useServiceFeeQuote } from "@/components/booking/service-fee-summary";
import {
  Minus,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  BOOKING_STORAGE_KEY,
  formatRupiah,
  serviceLabels,
  type BookingCustomer,
  type BookingItem,
  type BookingServiceType,
} from "@/lib/booking-engine";

const serviceOptions: { value: BookingServiceType; label: string }[] = [
  { value: "trip", label: "Trip" },
  { value: "stay", label: "Stay / Villa" },
  { value: "rental", label: "Rental" },
  { value: "activity", label: "Wahana" },
  { value: "documentation", label: "Dokumentasi" },
];

const emptyCustomer: BookingCustomer = { name: "", whatsapp: "", email: "", notes: "" };
type DepartureOption = { id: string; departure_date: string; status: string; max_participants: number | null; booked_seats: number; price_per_person: number | null };
type TripOption = { id: string; slug: string; title: string; max_pax: number | null; min_pax: number | null; minimum_package_price: number; price_tiers: unknown; trip_modes: string[]; trip_departures: DepartureOption[] };
type RoomOption = { id: string; name: string; capacity: number; status: string; total_units: number; weekday_price: number; weekend_price: number };
type StayOption = { id: string; slug: string; name: string; stay_room_types: RoomOption[] };
type ExperienceOption = { id: string; experience_type: "activity" | "documentation"; catalog_category: "activity" | "rental" | "documentation"; rental_category: string | null; title: string; slug: string; location: string; duration: string | null; base_price: number; price_basis: "per_person" | "per_unit"; price_unit_label: string; min_quantity: number; max_quantity: number; bundle_requires: "none" | "trip_or_activity" | "snorkeling"; addons: { id: string; name: string; price: number }[] };

function newItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatBookingDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date(year, month - 1, day));
}

function experienceMatchesService(item: ExperienceOption, serviceType: BookingServiceType) {
  if (serviceType === "rental") return item.catalog_category === "rental";
  if (serviceType === "activity") return item.experience_type === "activity" && item.catalog_category === "activity";
  return serviceType === "documentation" && item.experience_type === "documentation";
}

export default function BookingEngineClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const submitLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const saveLock = useRef(false);
  const [savingItem, setSavingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<BookingItem | null>(null);
  const serviceEditor = useRef<HTMLHeadingElement>(null);
  const [serviceType, setServiceType] = useState<BookingServiceType>("trip");
  const [serviceName, setServiceName] = useState("");
  const [variant, setVariant] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [departureId, setDepartureId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [roomTypeId, setRoomTypeId] = useState<string | null>(null);
  const [serviceCatalogId, setServiceCatalogId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [guests, setGuests] = useState(2);
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [cart, setCart] = useState<BookingItem[]>([]);
  const [customer, setCustomer] = useState<BookingCustomer>(emptyCustomer);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [tripOptions, setTripOptions] = useState<TripOption[]>([]);
  const [stayOptions, setStayOptions] = useState<StayOption[]>([]);
  const [departureOptions, setDepartureOptions] = useState<DepartureOption[]>([]);
  const [roomOptions, setRoomOptions] = useState<RoomOption[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<ExperienceOption[]>([]);

  useEffect(() => {
    let active = true;
    const loadPrefill = async () => {
      try {
        const stored = localStorage.getItem(BOOKING_STORAGE_KEY);
        if (stored && active) setCart(JSON.parse(stored) as BookingItem[]);

        const [{ data: tripsData }, { data: staysData }, { data: experiencesData }] = await Promise.all([
          supabase.from("trip_packages").select("id,slug,title,min_pax,max_pax,minimum_package_price,price_tiers,trip_modes,trip_departures(id,departure_date,status,max_participants,booked_seats,price_per_person)").eq("status", "published").order("title"),
          supabase.from("stay_properties").select("id,slug,name,stay_room_types(id,name,capacity,status,total_units,weekday_price,weekend_price)").eq("status", "published").order("name"),
          supabase.from("shiap_experiences").select("id,experience_type,catalog_category,rental_category,title,slug,location,duration,base_price,price_basis,price_unit_label,min_quantity,max_quantity,bundle_requires,addons").is("experience_package_id", null).eq("status", "published").order("title"),
        ]);
        if (!active) return;
        const loadedTrips = (tripsData || []) as TripOption[];
        const loadedStays = (staysData || []) as StayOption[];
        const loadedExperiences = (experiencesData || []) as ExperienceOption[];
        setTripOptions(loadedTrips);
        setStayOptions(loadedStays);
        setExperienceOptions(loadedExperiences);

        const params = new URLSearchParams(window.location.search);
        const tripSlug = params.get("trip");
        const staySlug = params.get("stay");
        const roomName = params.get("room");
        const mode = params.get("mode");
        const requestedDate = params.get("date");
        const requestedPax = Number(params.get("pax") || 0);
        const experienceId = params.get("service");
        if (requestedDate && active) setDateStart(requestedDate);
        if (requestedPax > 0 && active) setGuests(requestedPax);
        if (experienceId) {
          const selectedExperience = loadedExperiences.find((item) => item.id === experienceId);
          if (!active) return;
          if (selectedExperience) {
            setServiceType(selectedExperience.catalog_category === "rental" ? "rental" : selectedExperience.experience_type);
            setServiceCatalogId(selectedExperience.id);
            setServiceName(selectedExperience.title);
            setVariant(selectedExperience.duration || "");
            setQuantity(selectedExperience.min_quantity);
            setSelectedAddonIds([]);
          }
        } else if (tripSlug) {
          const selectedTrip = loadedTrips.find((item) => item.slug === tripSlug);
          if (!active) return;
          setServiceType("trip");
          setTripId(selectedTrip?.id ?? null);
          setServiceName(selectedTrip?.title || "");
          setDepartureOptions(selectedTrip?.trip_departures || []);
          setVariant(mode === "open" ? "Open Trip" : mode === "private" ? "Private Trip" : "");
          if (selectedTrip?.id && requestedDate && mode === "open") {
            const departure = selectedTrip.trip_departures.find((item) => item.departure_date === requestedDate && item.status === "open");
            setDepartureId(departure?.id ?? null);
          }
        } else if (staySlug) {
          const selectedStay = loadedStays.find((item) => item.slug === staySlug);
          if (!active) return;
          setServiceType("stay");
          setPropertyId(selectedStay?.id ?? null);
          setServiceName(selectedStay?.name || "");
          setRoomOptions((selectedStay?.stay_room_types || []).filter((room) => room.status === "active"));
          const selectedRoom = (selectedStay?.stay_room_types || []).find((room) => room.name === roomName && room.status === "active");
          setRoomTypeId(selectedRoom?.id ?? null);
          setVariant(selectedRoom?.name || "");
        }
      } catch {
        if (active) setNotice("Data booking lokal tidak dapat dibaca. Kamu masih bisa membuat pesanan baru.");
      } finally {
        if (active) setLoaded(true);
      }
    };
    void loadPrefill();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) return;
      const { data } = await supabase.from("profiles").select("full_name,whatsapp").eq("id",user.id).maybeSingle();
      if (!active) return;
      setCustomer(current => ({
        ...current,
        name: current.name || data?.full_name || "",
        whatsapp: current.whatsapp || data?.whatsapp || "",
        email: current.email || user.email || "",
      }));
    })();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (loaded) localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(cart));
  }, [cart, loaded]);

  const selectedExperience = experienceOptions.find((item) => item.id === serviceCatalogId);

  const totalGuests = useMemo(
    () => cart.reduce((sum, item) => sum + item.guests, 0),
    [cart],
  );
  const feeSubtotals = useMemo(() => cart.map((item) => {
    let subtotal = 0;
    if (item.unitPrice == null) return { category: item.serviceType, subtotal };
    if (item.serviceType === "trip") subtotal = item.unitPrice * item.guests * item.quantity;
    else if (item.serviceType === "stay" && item.dateEnd) {
      const nights = Math.max(1, Math.round((new Date(`${item.dateEnd}T12:00:00`).getTime() - new Date(`${item.dateStart}T12:00:00`).getTime()) / 86400000));
      subtotal = item.unitPrice * nights * item.quantity;
    }
    else if (item.priceBasis === "per_person") subtotal = item.unitPrice * item.guests * item.quantity;
    else subtotal = item.unitPrice * item.quantity;
    return { category: item.serviceType, subtotal: Math.round(subtotal) };
  }), [cart]);
  const feeQuote = useServiceFeeQuote(feeSubtotals);
  const hasUnpricedItems = cart.some((item) => item.unitPrice == null || item.unitPrice <= 0);

  function resetItemForm(type: BookingServiceType, item?: BookingItem) {
    const trip = tripOptions.find((option) => option.id === item?.tripId);
    const stay = stayOptions.find((option) => option.id === item?.propertyId);
    const rooms = (stay?.stay_room_types ?? []).filter((room) => room.status === "active");
    const experience = experienceOptions.find((option) => option.id === item?.serviceCatalogId);
    setServiceType(type);
    setServiceName(item?.serviceName ?? "");
    setVariant(item?.variant ?? "");
    setTripId(trip?.id ?? null);
    setDepartureOptions(trip?.trip_departures ?? []);
    setDepartureId(trip?.trip_departures.find((option) => option.id === item?.departureId && option.status === "open")?.id ?? null);
    setPropertyId(stay?.id ?? null);
    setRoomOptions(rooms);
    setRoomTypeId(rooms.find((room) => room.id === item?.roomTypeId)?.id ?? null);
    setServiceCatalogId(experience?.id ?? null);
    setSelectedAddonIds(item?.selectedAddons?.map((addon) => addon.id) ?? []);
    setDateStart(item?.dateStart ?? "");
    setDateEnd(item?.dateEnd ?? "");
    setGuests(item?.guests ?? 2);
    setQuantity(item?.quantity ?? 1);
    setItemNotes(item?.notes ?? "");
  }

  function selectService(type: BookingServiceType) {
    if (type === serviceType) return;
    setEditingItem(null);
    setNotice("");
    resetItemForm(type);
  }

  function editItem(item: BookingItem) {
    setEditingItem(item);
    setNotice("");
    resetItemForm(item.serviceType, item);
    serviceEditor.current?.focus();
  }

  async function saveItem() {
    if (saveLock.current || submitLock.current) return;
    if (!serviceName.trim()) {
      setNotice("Isi nama layanan terlebih dahulu.");
      return;
    }
    if (!dateStart) {
      setNotice("Pilih tanggal mulai layanan.");
      return;
    }
    if (serviceType === "trip" && (!tripId || !variant)) {
      setNotice("Pilih paket dan jenis Trip dari katalog.");
      return;
    }
    if (serviceType === "trip" && variant === "Open Trip" && !departureId) {
      setNotice("Open Trip wajib memilih jadwal keberangkatan yang tersedia.");
      return;
    }
    if (serviceType === "stay" && (!propertyId || !roomTypeId || !dateEnd || dateEnd <= dateStart)) {
      setNotice("Pilih properti, tipe kamar, tanggal check-in dan check-out.");
      return;
    }
    if ((serviceType === "rental" || serviceType === "activity" || serviceType === "documentation") && !selectedExperience) {
      setNotice("Pilih layanan yang tersedia dari katalog SHIAP.");
      return;
    }
    if (selectedExperience && (quantity < selectedExperience.min_quantity || quantity > selectedExperience.max_quantity)) {
      setNotice(`Jumlah layanan harus antara ${selectedExperience.min_quantity} dan ${selectedExperience.max_quantity} ${selectedExperience.price_unit_label}.`);
      return;
    }
    if (dateEnd && dateEnd < dateStart) {
      setNotice("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }

    let unitPrice: number | undefined;
    if (serviceType === "trip" && tripId && variant === "Open Trip") {
      unitPrice = departureOptions.find((departure) => departure.id === departureId)?.price_per_person ?? undefined;
    } else if (serviceType === "trip" && tripId && variant === "Private Trip") {
      saveLock.current = true;
      setSavingItem(true);
      try {
        const { data, error } = await supabase.rpc("calculate_private_trip_quote", { p_trip_id: tripId, p_pax: guests });
        if (error) throw error;
        const quote = Array.isArray(data) ? data[0] : data;
        if (quote?.effective_price_per_person != null) unitPrice = Number(quote.effective_price_per_person);
      } catch {
        if (editingItem) {
          setNotice("Estimasi Private Trip belum tersedia. Perubahan belum disimpan.");
          return;
        }
      } finally {
        saveLock.current = false;
        setSavingItem(false);
      }
    } else if (serviceType === "stay" && roomTypeId && dateEnd) {
      const room = roomOptions.find((candidate) => candidate.id === roomTypeId);
      if (room) {
        let nightsTotal = 0;
        for (let day = new Date(`${dateStart}T12:00:00`); day < new Date(`${dateEnd}T12:00:00`); day.setDate(day.getDate() + 1)) {
          const dayOfWeek = day.getDay();
          nightsTotal += dayOfWeek === 0 || dayOfWeek === 6 ? room.weekend_price : room.weekday_price;
        }
        if (nightsTotal > 0) unitPrice = Math.ceil(nightsTotal / Math.max(1, Math.round((new Date(`${dateEnd}T12:00:00`).getTime() - new Date(`${dateStart}T12:00:00`).getTime()) / 86400000)));
      }
    } else if (selectedExperience) {
      unitPrice = Number(selectedExperience.base_price) + selectedExperience.addons.filter((addon) => selectedAddonIds.includes(addon.id)).reduce((sum, addon) => sum + Number(addon.price), 0);
    }
    const item: BookingItem = {
      id: editingItem?.id ?? newItemId(),
      serviceType,
      serviceName: serviceName.trim(),
      serviceCatalogId: selectedExperience?.id,
      priceBasis: selectedExperience?.price_basis,
      priceUnitLabel: selectedExperience?.price_unit_label,
      selectedAddons: selectedExperience?.addons.filter((addon) => selectedAddonIds.includes(addon.id)),
      bundleRequires: selectedExperience?.bundle_requires,
      variant: variant.trim() || undefined,
      dateStart,
      dateEnd: dateEnd || undefined,
      quantity: Math.max(1, quantity),
      guests: Math.max(1, guests),
      priceStatus: "unquoted",
      unitPrice,
      notes: itemNotes.trim() || undefined,
      tripId: serviceType === "trip" ? tripId || undefined : undefined,
      departureId: serviceType === "trip" ? departureId || undefined : undefined,
      propertyId: serviceType === "stay" ? propertyId || undefined : undefined,
      roomTypeId: serviceType === "stay" ? roomTypeId || undefined : undefined,
      addedAt: editingItem?.addedAt ?? new Date().toISOString(),
    };
    setCart((current) => editingItem
      ? current.map((entry) => entry.id === item.id ? item : entry)
      : [...current, item]);
    setNotice(editingItem ? `${item.serviceName} diperbarui.` : `${item.serviceName} ditambahkan ke keranjang.`);
    setEditingItem(null);
    resetItemForm(serviceType);
  }

  function removeItem(id: string) {
    setCart((current) => current.filter((item) => item.id !== id));
    if (editingItem?.id === id) {
      setEditingItem(null);
      resetItemForm(serviceType);
    }
    setNotice("Item dihapus dari keranjang.");
  }

  async function submitBooking() {
    if (submitLock.current || saveLock.current || submitting || editingItem) return;
    if (!cart.length) { setCheckoutNotice("Tambahkan minimal satu layanan ke keranjang."); return; }
    if (!feeQuote.data) { setCheckoutNotice("Tunggu rincian biaya layanan tersedia sebelum booking dikirim."); return; }
    if (hasUnpricedItems) { setCheckoutNotice("Ada layanan yang belum memiliki harga pasti. Pilih layanan Trip atau Stay yang memiliki tarif aktif sebelum mengirim booking."); return; }
    const unresolvedBundle = cart.find((item) => {
      if (item.bundleRequires === "none" || !item.bundleRequires) return false;
      const bundleService = experienceOptions.find((service) => service.id === item.serviceCatalogId);
      return !cart.some((related) => {
        if (related.id === item.id || related.dateStart !== item.dateStart) return false;
        if (item.bundleRequires === "trip_or_activity") return related.serviceType === "trip" || related.serviceType === "activity";
        const relatedService = experienceOptions.find((service) => service.id === related.serviceCatalogId);
        return related.serviceType === "activity" && relatedService?.slug.startsWith("snorkeling-") && relatedService.location === bundleService?.location;
      });
    });
    if (unresolvedBundle) { setCheckoutNotice(unresolvedBundle.bundleRequires === "snorkeling" ? "Paket Underwater harus dipesan bersama wahana snorkeling di lokasi dan tanggal yang sama." : "Paket dokumentasi bundling harus disertai Trip atau Wahana pada tanggal yang sama."); return; }
    if (!customer.name.trim() || !customer.whatsapp.trim()) { setCheckoutNotice("Nama dan nomor WhatsApp wajib diisi."); return; }
    submitLock.current = true;
    setSubmitting(true);
    setCheckoutNotice("");
    try {
      const p_items = cart.map(item => ({
        service_type: item.serviceType === "rental" ? "activity" : item.serviceType,
        service_catalog_id: item.serviceCatalogId || null,
        selected_addons: item.selectedAddons?.map((addon) => ({ id: addon.id })) || [],
        service_name: item.serviceName,
        variant: item.variant || null,
        date_start: item.dateStart,
        date_end: item.dateEnd || null,
        quantity: item.quantity,
        guests: item.guests,
        notes: item.notes || null,
        trip_id: item.tripId || null,
        departure_id: item.departureId || null,
        property_id: item.propertyId || null,
        room_type_id: item.roomTypeId || null,
      }));
      const createdId = await checkoutBooking("booking", {
        p_customer_name: customer.name.trim(),
        p_customer_whatsapp: customer.whatsapp.trim(),
        p_customer_email: customer.email?.trim() || null,
        p_customer_notes: customer.notes?.trim() || null,
        p_items,
      });
      setCart([]);
      localStorage.removeItem(BOOKING_STORAGE_KEY);
      router.replace("/my-booking/" + createdId);
    } catch (err) {
      setCheckoutNotice(err instanceof Error ? err.message : "Booking gagal dikirim. Silakan coba kembali.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function updateCustomer(field: keyof BookingCustomer, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="bg-[#F7F9FC] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
      <div className="mx-auto max-w-3xl space-y-2.5 px-3 pt-2.5 sm:space-y-4 sm:px-6 sm:pt-5">
        <div className="flex items-center justify-between gap-2"><h1 ref={serviceEditor} tabIndex={-1} className="scroll-mt-3 text-lg font-bold text-[#0A2E63] outline-none sm:text-2xl">Booking</h1><Link href="/my-booking" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#1265D8]">Pesanan Saya</Link></div>

        <section id="booking-service-form" aria-label="Detail layanan" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-4">
          <div role="group" aria-label="Pilih layanan" className="flex flex-wrap gap-1">
            {serviceOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={serviceType === value}
                disabled={!loaded || savingItem || submitting}
                onClick={() => selectService(value)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1265D8] disabled:opacity-60 sm:px-3 ${serviceType === value ? "border-[#1265D8] bg-[#1265D8] text-white" : "border-slate-200 bg-white text-[#0A2E63] hover:border-[#1265D8]"}`}
              >
                <ServiceCategoryIcon category={value} size={14} />
                {label}
              </button>
            ))}
          </div>

          {editingItem && (
            <p className="mt-2 break-words text-sm font-semibold text-[#0A2E63]">Edit {editingItem.serviceName}</p>
          )}

          <fieldset disabled={!loaded || savingItem || submitting} className="mt-2 grid min-w-0 grid-cols-2 gap-x-2 gap-y-2.5 [&>*]:min-w-0 sm:gap-x-3">
            <label className="col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-600">{serviceType === "trip" ? "Paket Trip" : serviceType === "stay" ? "Properti" : "Pilih layanan"}</span>
              {serviceType === "trip" ? (
                <select value={tripId || ""} onChange={(event) => {
                  const selected = tripOptions.find((item) => item.id === event.target.value);
                  setTripId(selected?.id || null); setServiceName(selected?.title || "");
                  setDepartureOptions((selected?.trip_departures || [])); setDepartureId(null);
                  setVariant("");
                }} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-[#0A2E63] outline-none sm:text-sm focus:border-[#1265D8]">
                  <option value="">Pilih paket Trip</option>
                  {tripOptions.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
                </select>
              ) : serviceType === "stay" ? (
                <select value={propertyId || ""} onChange={(event) => {
                  const selected = stayOptions.find((item) => item.id === event.target.value);
                  setPropertyId(selected?.id || null); setServiceName(selected?.name || "");
                  setRoomOptions((selected?.stay_room_types || []).filter((room) => room.status === "active")); setRoomTypeId(null); setVariant("");
                }} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-[#0A2E63] outline-none sm:text-sm focus:border-[#1265D8]">
                  <option value="">Pilih properti</option>
                  {stayOptions.map((stay) => <option key={stay.id} value={stay.id}>{stay.name}</option>)}
                </select>
              ) : serviceType === "rental" || serviceType === "activity" || serviceType === "documentation" ? (
                <select value={serviceCatalogId || ""} onChange={(event) => {
                  const selected = experienceOptions.find((item) => item.id === event.target.value && experienceMatchesService(item, serviceType));
                  setServiceCatalogId(selected?.id || null); setSelectedAddonIds([]); setServiceName(selected?.title || "");
                  setVariant(selected?.duration || ""); setQuantity(selected?.min_quantity || 1);
                }} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-[#0A2E63] outline-none sm:text-sm focus:border-[#1265D8]">
                  <option value="">Pilih dari katalog SHIAP</option>
                  {experienceOptions.filter((item) => experienceMatchesService(item, serviceType)).map((item) => <option key={item.id} value={item.id}>{item.title} — {formatRupiah(item.base_price)} / {item.price_basis === "per_person" ? "orang" : item.price_unit_label}</option>)}
                </select>
              ) : (
                <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Nama layanan" className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base text-[#0A2E63] outline-none sm:text-sm placeholder:text-slate-400 focus:border-[#1265D8]"/>
              )}
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Tipe / pilihan layanan</span>
              {serviceType === "trip" ? (
                <select value={variant} onChange={(event) => { setVariant(event.target.value); setDepartureId(null); }} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-[#0A2E63] sm:text-sm">
                  <option value="">Pilih jenis Trip</option>
                  {(tripOptions.find((item) => item.id === tripId)?.trip_modes || []).map((mode) => <option key={mode} value={mode === "open" ? "Open Trip" : "Private Trip"}>{mode === "open" ? "Open Trip" : "Private Trip"}</option>)}
                </select>
              ) : serviceType === "stay" ? (
                <select value={roomTypeId || ""} onChange={(event) => { const room = roomOptions.find((item) => item.id === event.target.value); setRoomTypeId(room?.id || null); setVariant(room?.name || ""); }} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-[#0A2E63] sm:text-sm">
                  <option value="">Pilih tipe kamar</option>
                  {roomOptions.map((room) => <option key={room.id} value={room.id}>{room.name} · kapasitas {room.capacity} · {room.total_units} unit</option>)}
                </select>
              ) : serviceType === "rental" || serviceType === "activity" || serviceType === "documentation" ? (
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
                  {experienceOptions.find((item) => item.id === serviceCatalogId)?.duration || "Harga katalog diterapkan otomatis"}
                </div>
              ) : (
                <input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder="Tipe / paket / sesi" className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base text-[#0A2E63] outline-none sm:text-sm placeholder:text-slate-400 focus:border-[#1265D8]"/>
              )}
            </label>

            {selectedExperience?.addons.length ? <div className="col-span-2 rounded-xl border border-orange-100 bg-orange-50/60 p-3"><p className="text-[11px] font-bold text-[#0A2E63]">Tambahan dokumentasi / add-on (opsional)</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{selectedExperience.addons.map((addon) => <label key={addon.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-orange-100 bg-white p-3"><input type="checkbox" checked={selectedAddonIds.includes(addon.id)} onChange={(event) => setSelectedAddonIds((current) => event.target.checked ? [...current, addon.id] : current.filter((id) => id !== addon.id))}/><span className="min-w-0 flex-1 text-[11px] font-semibold text-slate-700">{addon.name}</span><span className="shrink-0 text-[10px] font-bold text-[#0A2E63]">+{formatRupiah(addon.price)} / {selectedExperience.price_basis === "per_person" ? "orang" : selectedExperience.price_unit_label}</span></label>)}</div></div> : null}

            {serviceType === "trip" && variant === "Open Trip" && (
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-600">Jadwal keberangkatan</span>
                <select value={departureId || ""} onChange={(event) => {
                  const departure = departureOptions.find((item) => item.id === event.target.value);
                  setDepartureId(departure?.id || null); setDateStart(departure?.departure_date || "");
                }} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-[#0A2E63] sm:text-sm">
                  <option value="">Pilih jadwal tersedia</option>
                  {departureOptions.filter((item) => item.status === "open").map((departure) => <option key={departure.id} value={departure.id}>{departure.departure_date} · sisa {Math.max(0, (departure.max_participants ?? tripOptions.find((item) => item.id === tripId)?.max_pax ?? 0) - departure.booked_seats)} kursi</option>)}
                </select>
              </label>
            )}

            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-600">{serviceType === "stay" ? "Tanggal check-in" : "Tanggal mulai"}</span>
              <input type="date" value={dateStart} readOnly={serviceType === "trip" && variant === "Open Trip"} onChange={(event) => setDateStart(event.target.value)} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base text-[#0A2E63] outline-none sm:text-sm focus:border-[#1265D8]"/>
            </label>

            {serviceType === "stay" && (
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-600">Tanggal check-out</span>
                <input type="date" min={dateStart || undefined} value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base text-[#0A2E63] outline-none sm:text-sm focus:border-[#1265D8]"/>
              </label>
            )}

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Jumlah peserta / tamu</span>
              <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200">
                <button type="button" onClick={() => setGuests((value) => Math.max(1, value - 1))} aria-label="Kurangi peserta" className="grid size-11 shrink-0 place-items-center text-slate-600"><Minus size={15}/></button>
                <output className="text-center text-xs font-bold text-[#0A2E63]">{guests} orang</output>
                <button type="button" onClick={() => setGuests((value) => Math.min(100, value + 1))} aria-label="Tambah peserta" className="grid size-11 shrink-0 place-items-center text-[#1265D8]"><Plus size={15}/></button>
              </div>
            </div>

            {(serviceType === "stay" || serviceType === "rental" || serviceType === "activity" || serviceType === "documentation" || serviceType === "other") && (
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">{serviceType === "stay" ? "Jumlah kamar" : "Jumlah unit / paket"}</span>
                <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200">
                  <button type="button" onClick={() => setQuantity((value) => Math.max(selectedExperience?.min_quantity ?? 1, value - 1))} aria-label="Kurangi jumlah layanan" className="grid size-11 shrink-0 place-items-center text-slate-600"><Minus size={15}/></button>
                  <output className="text-xs font-bold text-[#0A2E63]">{quantity}</output>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(selectedExperience?.max_quantity ?? 50, value + 1))} aria-label="Tambah jumlah layanan" className="grid size-11 shrink-0 place-items-center text-[#1265D8]"><Plus size={15}/></button>
                </div>
              </div>
            )}

            <label className="col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Catatan kebutuhan (opsional)</span>
              <textarea value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} rows={2} placeholder="Tuliskan kebutuhan khusus, lokasi, jam, atau detail lainnya..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base text-[#0A2E63] outline-none sm:text-sm placeholder:text-slate-400 focus:border-[#1265D8]"/>
            </label>
          </fieldset>

          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={saveItem} disabled={!loaded || savingItem || submitting} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1265D8] px-3 text-sm font-bold text-white hover:bg-[#0A2E63] disabled:opacity-60">
              {!editingItem && <Plus aria-hidden size={16} />}
              {savingItem ? "Menghitung harga…" : editingItem ? "Simpan perubahan" : "Tambahkan ke keranjang"}
            </button>
            {editingItem && (
              <button type="button" disabled={savingItem} onClick={() => {
                setEditingItem(null);
                setNotice("");
                resetItemForm(serviceType);
              }} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-[#0A2E63]">Batal</button>
            )}
          </div>
          {notice && (
            <div role="status" className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-blue-50 pl-3 text-xs text-[#0A2E63]">
              <span className="min-w-0 break-words py-2">{notice}</span>
              <button type="button" onClick={() => setNotice("")} aria-label="Tutup pesan" className="grid size-11 shrink-0 place-items-center"><X aria-hidden size={16} /></button>
            </div>
          )}
        </section>

        <section aria-labelledby="booking-cart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="booking-cart-title" className="text-base font-bold text-[#0A2E63]">Keranjang booking</h2>
            <p className="text-xs text-slate-600">{cart.length} layanan · {totalGuests} orang</p>
          </div>
          {cart.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">Keranjang masih kosong.</p>
          ) : (
            <>
              <ul className="mt-1 divide-y divide-slate-100">
                {cart.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-1 py-2.5">
                    <div className="min-w-0 break-words">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1265D8]"><ServiceCategoryIcon category={item.serviceType} size={14} />{serviceLabels[item.serviceType]}</p>
                      <h3 className="text-sm font-bold text-[#0A2E63]">{item.serviceName}</h3>
                      {item.variant && <p className="text-xs text-slate-600">{item.variant}</p>}
                      <p className="text-xs text-slate-600">
                        {formatBookingDate(item.dateStart)}{item.dateEnd ? ` s.d. ${formatBookingDate(item.dateEnd)}` : ""} · {item.guests} orang{item.serviceType !== "trip" ? ` · ${item.quantity} unit` : ""}
                      </p>
                      {item.selectedAddons?.map((addon) => <p key={addon.id} className="text-xs text-orange-800">+ {addon.name} ({formatRupiah(addon.price)})</p>)}
                      {item.notes && <p className="text-xs text-slate-600">{item.notes}</p>}
                      <p className="mt-0.5 text-xs font-semibold text-[#0A2E63]">{formatRupiah(item.unitPrice)}{item.priceUnitLabel ? ` / ${item.priceBasis === "per_person" ? "orang" : item.priceUnitLabel}` : ""}</p>
                    </div>
                    <div className="flex shrink-0">
                      <button type="button" onClick={() => editItem(item)} disabled={!loaded || savingItem || submitting} aria-label={`Edit ${item.serviceName}`} className="grid size-11 place-items-center rounded-lg text-[#1265D8] hover:bg-blue-50 disabled:opacity-60"><Pencil aria-hidden size={16} /></button>
                      <button type="button" onClick={() => removeItem(item.id)} disabled={!loaded || savingItem || submitting} aria-label={`Hapus ${item.serviceName}`} className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"><Trash2 aria-hidden size={16} /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-200 pt-2">
                {hasUnpricedItems ? <p>Harga belum tersedia</p> : <ServiceFeeSummary quote={feeQuote.data} error={feeQuote.error} />}
                <p className="mt-0.5 text-xs text-slate-600">Harga final dihitung saat booking dikirim.</p>
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="booking-customer-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <h2 id="booking-customer-title" className="text-base font-bold text-[#0A2E63]">Data pemesan</h2>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2 [&>*]:min-w-0">
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Nama lengkap *</span>
              <input value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} placeholder="Nama pemesan" className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base outline-none sm:text-sm focus:border-[#1265D8]"/>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Nomor WhatsApp *</span>
              <input value={customer.whatsapp} onChange={(event) => updateCustomer("whatsapp", event.target.value)} placeholder="08xxxxxxxxxx" inputMode="tel" className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base outline-none sm:text-sm focus:border-[#1265D8]"/>
            </label>
            <label className="col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Email (opsional)</span>
              <input type="email" value={customer.email} onChange={(event) => updateCustomer("email", event.target.value)} placeholder="email@contoh.com" className="h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base outline-none sm:text-sm focus:border-[#1265D8]"/>
            </label>
            <label className="col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Catatan untuk admin (opsional)</span>
              <textarea rows={2} value={customer.notes} onChange={(event) => updateCustomer("notes", event.target.value)} placeholder="Pesan tambahan..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none sm:text-sm focus:border-[#1265D8]"/>
            </label>
          </div>
          <button type="button" onClick={submitBooking} disabled={!loaded || submitting || savingItem || Boolean(editingItem) || cart.length === 0 || hasUnpricedItems || !feeQuote.data} className="mt-2 flex min-h-11 w-full scroll-mb-24 items-center justify-center rounded-xl bg-[#1265D8] px-3 text-sm font-bold text-white disabled:opacity-50">
            {submitting ? "Mengirim booking..." : "Kirim permintaan booking"}
          </button>
          {checkoutNotice && <p role="status" className="mt-2 rounded-lg bg-blue-50 p-2 text-sm text-[#0A2E63]">{checkoutNotice}</p>}
          {editingItem && <p className="mt-1 text-xs text-slate-600">Simpan atau batalkan edit layanan sebelum mengirim booking.</p>}
          {hasUnpricedItems && cart.length > 0 && <p className="mt-2 text-center text-[10px] text-orange-700">Total belum dapat ditentukan. Layanan tanpa harga aktif tidak dapat dibayar melalui booking ini.</p>}

        </section>
      </div>
    </div>
  );
}
