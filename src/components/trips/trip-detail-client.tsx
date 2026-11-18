"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Bus,
  CalendarDays,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  MapPin,
  Ship,
  ShieldCheck,
  Ticket,
  Utensils,
  Users,
  Waves,
  X,
  XCircle,
} from "lucide-react";
import type { Trip, TripMode } from "@/lib/trips";
import YouTubeTourEmbed from "@/components/trip/youtube-tour-embed";
import PrivateTripPriceSimulator from "@/components/trip/private-trip-price-simulator";

function FacilityIcon({ item, excluded = false }: { item: string; excluded?: boolean }) {
  const text = item.toLowerCase();
  const iconClass = excluded ? "h-4 w-4" : "h-4 w-4";
  let Icon = excluded ? XCircle : CheckCircle2;

  if (/kapal|boat|perahu|speedboat|ferry|dermaga/.test(text)) Icon = Ship;
  else if (/mobil|transport|kendaraan|antar.?jemput|bus|supir|driver/.test(text)) Icon = /mobil|kendaraan|supir|driver/.test(text) ? Car : Bus;
  else if (/makan|minum|breakfast|lunch|dinner|sarapan|kopi|snack|meal|konsumsi/.test(text)) Icon = /kopi|coffee|minum/.test(text) ? Coffee : Utensils;
  else if (/villa|hotel|homestay|penginapan|kamar|akomodasi|room/.test(text)) Icon = BedDouble;
  else if (/foto|photo|video|dokumentasi|drone|kamera/.test(text)) Icon = Camera;
  else if (/snorkel|diving|freediv|laut|paddle|kano|kayak|pantai|island|pulau/.test(text)) Icon = Waves;
  else if (/tiket|izin|retribusi|karcis|masuk|entrance/.test(text)) Icon = Ticket;
  else if (/guide|pemandu|tour|trip|explore|jelajah/.test(text)) Icon = Compass;
  else if (/asuransi|keselamatan|safety|life jacket|pelampung/.test(text)) Icon = ShieldCheck;
  else if (/peserta|pax|orang|group|grup/.test(text)) Icon = Users;

  return <Icon className={iconClass} aria-hidden="true" />;
}

type AccordionSectionProps = {
  title: string;
  eyebrow?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function AccordionSection({
  title,
  eyebrow,
  icon,
  children,
  defaultOpen = false,
}: AccordionSectionProps) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.025)]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1974FF]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          {eyebrow && (
            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[#1974FF]">
              {eyebrow}
            </span>
          )}
          <span className="mt-0.5 block text-sm font-bold text-[#0A2E63]">
            {title}
          </span>
        </span>
        <ChevronDown
          size={18}
          className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
        {children}
      </div>
    </details>
  );
}

export default function TripDetailClient({ trip }: { trip: Trip }) {
  const availableModes = trip.modes;
  const [mode, setMode] = useState<TripMode>(availableModes[0] ?? "private");
  const [activeImage, setActiveImage] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [privatePax, setPrivatePax] = useState(trip.minPax ?? 2);
  const gallery = trip.gallery.length > 0 ? trip.gallery : [trip.image];
  const currentImage = gallery[activeImage] ?? trip.image;

  function showPreviousImage() {
    setActiveImage((current) => (current - 1 + gallery.length) % gallery.length);
  }

  function showNextImage() {
    setActiveImage((current) => (current + 1) % gallery.length);
  }

  const bookingHref = `/booking?trip=${encodeURIComponent(trip.slug)}&mode=${mode}${mode === "private" ? `&pax=${privatePax}` : ""}`;

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-28 md:pb-12">
      <div className="mx-auto max-w-7xl px-3 pt-3 sm:px-8 sm:pt-4">
        <Link
          href="/trip"
          className="inline-flex items-center gap-2 py-2 text-xs font-semibold text-[#1974FF]"
        >
          <ArrowLeft size={16} /> Kembali ke Explore
        </Link>

        {/* Single-image gallery slider with the thumbnail rail kept below. */}
        <section className="mt-2">
          <div
            className="group relative aspect-[4/3] overflow-hidden rounded-[22px] bg-slate-200 shadow-sm sm:aspect-[2.15/1] sm:min-h-[420px] sm:rounded-[26px]"
            onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              if (touchStartX.current === null) return;
              const touchEndX = event.changedTouches[0]?.clientX;
              if (touchEndX === undefined) return;
              const delta = touchEndX - touchStartX.current;
              if (delta < -45) showNextImage();
              if (delta > 45) showPreviousImage();
              touchStartX.current = null;
            }}
          >
            <Image
              src={currentImage}
              alt={`${trip.title} — foto ${activeImage + 1}`}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 1216px"
              unoptimized
              className="object-cover transition-transform duration-500 group-hover:scale-[1.015]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07172F]/65 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 text-white sm:bottom-7 sm:left-7">
              <div className="mb-2 flex flex-wrap gap-1">
                {trip.category.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[9px] font-semibold backdrop-blur-md"
                  >
                    {category}
                  </span>
                ))}
              </div>
              <h1 className="max-w-2xl text-xl font-bold leading-tight sm:text-4xl">
                {trip.title}
              </h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/90 sm:text-sm">
                <MapPin size={13} /> {trip.location}
              </p>
            </div>
            {gallery.length > 1 && <>
              <button
                type="button"
                aria-label="Foto sebelumnya"
                onClick={showPreviousImage}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#0A2E63]/55 text-white shadow-lg backdrop-blur transition hover:bg-[#0A2E63]/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-5 sm:h-12 sm:w-12"
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Foto berikutnya"
                onClick={showNextImage}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#0A2E63]/55 text-white shadow-lg backdrop-blur transition hover:bg-[#0A2E63]/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5 sm:h-12 sm:w-12"
              >
                <ChevronRight size={22} aria-hidden="true" />
              </button>
              <span aria-live="polite" className="absolute right-3 top-3 rounded-full border border-white/20 bg-[#0A2E63]/55 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur sm:right-5 sm:top-5 sm:text-xs">
                {activeImage + 1} / {gallery.length}
              </span>
            </>}
          </div>
        </section>

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {gallery.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveImage(index)}
              aria-label={`Pilih foto ${index + 1}`}
              className={`relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border-2 sm:h-14 sm:w-20 sm:rounded-xl ${
                activeImage === index
                  ? "border-[#1974FF]"
                  : "border-transparent opacity-70"
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" unoptimized className="object-cover" />
            </button>
          ))}
        </div>

        {/* Compact overview */}
        <section className="mt-5 rounded-2xl border border-slate-100 bg-white p-4 sm:mt-7 sm:rounded-3xl sm:p-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-500 sm:text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={14} className="text-[#1974FF]" />
              {trip.duration}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Waves size={14} className="text-[#1974FF]" />
              Ocean experience
            </span>
          </div>
          <h2 className="mt-3 text-base font-bold text-[#0A2E63] sm:text-lg">
            {trip.title}
          </h2>
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-500 sm:text-sm">
            {trip.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {trip.highlights.map((highlight) => (
              <span
                key={highlight}
                className="rounded-full bg-blue-50 px-2.5 py-1.5 text-[9px] font-medium text-[#1759B8] sm:text-[10px]"
              >
                {highlight}
              </span>
            ))}
          </div>
        </section>

        {trip.youtubeTourUrl && (
          <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-4 sm:p-6">
            <YouTubeTourEmbed url={trip.youtubeTourUrl} title="Destination Tour" />
          </div>
        )}

        {/* Dropdown information sections */}
        <section className="mt-3 space-y-2.5">
          <AccordionSection
            title="Itinerary perjalanan"
            eyebrow="Your journey"
            icon={<CalendarDays size={17} />}
            defaultOpen={trip.itinerary.length > 0}
          >
            <div className="space-y-4">
              {trip.itinerary.map((item, index) => (
                <div key={`${item.day ?? ""}-${item.time}-${item.title}-${index}`}>
                  {item.day && item.day !== trip.itinerary[index - 1]?.day && (
                    <div className="mb-3 mt-1 flex items-center gap-2">
                      <span className="rounded-full bg-[#0A2E63] px-3 py-1 text-[10px] font-extrabold text-white">{item.day}</span>
                      {item.dayTitle && <span className="text-xs font-bold text-[#0A2E63]">{item.dayTitle}</span>}
                    </div>
                  )}
                  <div className="flex gap-3">
                  <div className="flex w-[58px] shrink-0 flex-col items-center">
                    {item.time ? <span className="rounded-full bg-blue-50 px-2 py-1.5 text-[9px] font-bold text-[#1974FF]">{item.time}</span> : <span className="rounded-full bg-slate-100 px-2 py-1.5 text-[9px] font-bold text-slate-500">Agenda</span>}
                    {index !== trip.itinerary.length - 1 && (
                      <span className="mt-2 min-h-6 w-px flex-1 bg-blue-100" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <h3 className="text-xs font-bold text-[#0A2E63]">
                      {item.title}
                    </h3>
                    {item.description && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.description}</p>}
                  </div>
                  </div>
                </div>
              ))}
              {trip.itinerary.length === 0 && <p className="text-xs text-slate-500">Rangkaian kegiatan akan dikonfirmasi oleh tim SHIAP.</p>}
            </div>
          </AccordionSection>

          <AccordionSection
            title="Termasuk dalam paket"
            eyebrow="What's included"
            icon={<CheckCircle2 size={17} />}
          >
            {trip.included.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {trip.included.map((item, index) => (
                  <li key={`${item}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[11px] leading-snug text-slate-700 sm:text-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                      <FacilityIcon item={item} />
                    </span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400">Informasi fasilitas termasuk belum tersedia.</p>
            )}
          </AccordionSection>

          <AccordionSection
            title="Tidak termasuk"
            eyebrow="What's excluded"
            icon={<X size={17} />}
          >
            {trip.excluded.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {trip.excluded.map((item, index) => (
                  <li key={`${item}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-orange-100 bg-orange-50/70 px-3 py-2 text-[11px] leading-snug text-slate-700 sm:text-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#FF8518] shadow-sm">
                      <FacilityIcon item={item} excluded />
                    </span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400">Informasi fasilitas yang tidak termasuk belum tersedia.</p>
            )}
          </AccordionSection>

          <AccordionSection
            title="Informasi perjalanan"
            eyebrow="Before you go"
            icon={<ShieldCheck size={17} />}
          >
            <div className="space-y-4">
              <div className="flex gap-3">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[#1974FF]" />
                <div>
                  <h3 className="text-xs font-bold text-[#0A2E63]">
                    Meeting point
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {trip.meetingPoint}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <ShieldCheck
                  size={16}
                  className="mt-0.5 shrink-0 text-[#1974FF]"
                />
                <div>
                  <h3 className="text-xs font-bold text-[#0A2E63]">
                    Persiapan
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-500">
                    {trip.preparation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 p-3.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800">
                  Catatan penting
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-amber-900/80">
                  {trip.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Pertanyaan umum"
            eyebrow="FAQ"
            icon={<Users size={17} />}
          >
            {[
              [
                "Apakah jadwal dapat berubah?",
                "Jadwal dan rute dapat menyesuaikan cuaca, kondisi laut, dan pertimbangan keselamatan.",
              ],
              [
                "Bagaimana mengetahui harga dan ketersediaan?",
                "Pilih jenis perjalanan lalu konsultasikan tanggal dan jumlah peserta kepada tim SHIAP. Harga dan ketersediaan akan dikonfirmasi.",
              ],
              [
                "Apakah bisa request perjalanan private?",
                "Bisa jika destinasi dan kondisi operasional memungkinkan. Pilih Private Trip untuk mengajukan kebutuhan perjalanan.",
              ],
            ].map(([question, answer], index) => (
              <div key={question} className="border-b border-slate-100 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left text-[11px] font-semibold text-[#0A2E63]"
                >
                  {question}
                  <ChevronDown
                    size={15}
                    className={`shrink-0 transition ${
                      openFaq === index ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <p className="pb-3 pr-6 text-[11px] leading-relaxed text-slate-500">
                    {answer}
                  </p>
                )}
              </div>
            ))}
          </AccordionSection>
        </section>

        {/* Booking mode selector */}
        <section className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 lg:hidden">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">
            Plan your journey
          </p>
          <h2 className="mt-1 text-sm font-bold text-[#0A2E63]">
            Pilih pengalamanmu
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Tentukan model perjalanan. Harga, jadwal, dan ketersediaan akan dikonfirmasi tim SHIAP.
          </p>
          <ModeSelector trip={trip} mode={mode} setMode={setMode} />
          {mode === "open" && trip.departures && trip.departures.filter((d) => d.status === "open").length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-[#0A2E63]">Pilih jadwal keberangkatan</p>
              {trip.departures.filter((d) => d.status === "open").map((d) => <Link key={d.id} href={`/booking?trip=${encodeURIComponent(trip.slug)}&mode=open&date=${d.departureDate}`} className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 p-3 text-xs"><span><b>{new Date(`${d.departureDate}T00:00:00`).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}</b><span className="block text-[10px] text-slate-500">Kapasitas maks. {d.maxParticipants} peserta</span></span><b className="text-[#1974FF]">{d.pricePerPerson ? new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(d.pricePerPerson) : "Hubungi admin"}</b></Link>)}
            </div>
          )}
          {mode === "private" && trip.priceTiers && trip.priceTiers.length > 0 && (
            <div className="mt-3"><PrivateTripPriceSimulator tiers={trip.priceTiers} minimumPackagePrice={trip.minimumPackagePrice ?? 0} minPax={trip.minPax ?? 2} maxPax={trip.maxPax ?? 20} pax={privatePax} onPaxChange={setPrivatePax} /></div>
          )}
          <div className="mt-3 rounded-xl bg-[#F7F9FC] p-3 text-[11px] leading-relaxed text-slate-500">
            {mode === "open" ? trip.openTripInfo : trip.privateTripInfo}
          </div>
          <Link
            href={bookingHref}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3 text-xs font-bold text-white"
          >
            Konsultasi & Booking <ArrowRight size={15} />
          </Link>
        </section>

        {/* Desktop booking card */}
        <aside className="mt-6 hidden h-fit rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">
            Plan your journey
          </p>
          <h2 className="mt-2 text-xl font-bold text-[#0A2E63]">
            Pilih pengalamanmu
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Pilih model perjalanan. Tim SHIAP akan mengonfirmasi harga, jadwal, dan ketersediaan.
          </p>
          <ModeSelector trip={trip} mode={mode} setMode={setMode} />
          {mode === "open" && trip.departures && trip.departures.filter((d) => d.status === "open").length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-[#0A2E63]">Pilih jadwal keberangkatan</p>
              {trip.departures.filter((d) => d.status === "open").map((d) => <Link key={d.id} href={`/booking?trip=${encodeURIComponent(trip.slug)}&mode=open&date=${d.departureDate}`} className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 p-3 text-xs"><span><b>{new Date(`${d.departureDate}T00:00:00`).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}</b><span className="block text-[10px] text-slate-500">Kapasitas maks. {d.maxParticipants} peserta</span></span><b className="text-[#1974FF]">{d.pricePerPerson ? new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(d.pricePerPerson) : "Hubungi admin"}</b></Link>)}
            </div>
          )}
          {mode === "private" && trip.priceTiers && trip.priceTiers.length > 0 && (
            <div className="mt-4"><PrivateTripPriceSimulator tiers={trip.priceTiers} minimumPackagePrice={trip.minimumPackagePrice ?? 0} minPax={trip.minPax ?? 2} maxPax={trip.maxPax ?? 20} pax={privatePax} onPaxChange={setPrivatePax} /></div>
          )}
          <div className="mt-4 rounded-2xl bg-[#F7F9FC] p-4 text-xs leading-relaxed text-slate-500">
            {mode === "open" ? trip.openTripInfo : trip.privateTripInfo}
          </div>
          <Link
            href={bookingHref}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3.5 text-sm font-bold text-white"
          >
            Lanjut konsultasi <ArrowRight size={16} />
          </Link>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <Users size={12} /> Harga & ketersediaan dikonfirmasi admin
          </p>
        </aside>
      </div>

      {/* Mobile sticky booking bar */}
      <div className="fixed inset-x-0 bottom-[calc(66px+env(safe-area-inset-bottom))] z-40 border-t border-slate-100 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Mulai rencanakan
            </p>
            <p className="truncate text-xs font-bold text-[#0A2E63]">
              {trip.title}
            </p>
          </div>
          <Link
            href={bookingHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#1974FF] px-4 py-3 text-[11px] font-bold text-white shadow-lg shadow-blue-500/20"
          >
            Konsultasi & Booking <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ModeSelector({
  trip,
  mode,
  setMode,
}: {
  trip: Trip;
  mode: TripMode;
  setMode: (mode: TripMode) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {(["open", "private"] as TripMode[]).map((option) => {
        const enabled = trip.modes.includes(option);
        const active = mode === option;
        return (
          <button
            key={option}
            type="button"
            disabled={!enabled}
            onClick={() => setMode(option)}
            className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "border-[#1974FF] bg-blue-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <span
              className={`block text-xs font-bold ${
                active ? "text-[#1974FF]" : "text-[#0A2E63]"
              }`}
            >
              {option === "open" ? "Open Trip" : "Private Trip"}
            </span>
            <span className="mt-1 block text-[9px] text-slate-500">
              {enabled ? "Tersedia untuk konsultasi" : "Belum tersedia"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
