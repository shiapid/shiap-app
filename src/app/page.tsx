
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Waves,
  BedDouble,
  Camera,
  Fish,
  Smile,
  Sailboat,
  Anchor,
  Search,
  Menu,
  UserRound,
  House,
  LayoutGrid,
  X,
  ChevronRight,
  Sparkles,
  Ship,
} from "lucide-react";

/* =========================================
   SHIAP SERVICES
========================================= */

const services = [
  {
    name: "Trip",
    description: "Island hopping, snorkeling, diving & private trip.",
    icon: Waves,
    href: "/trip",
  },
  {
    name: "Stay",
    description: "Villa & Homestay.",
    icon: BedDouble,
    href: "/stay",
  },
  {
    name: "Shinema",
    description: "Foto & video perjalanan.",
    icon: Camera,
    href: "/shinema",
  },
  {
    name: "Snorkeling",
    description: "Terumbu karang dan spot Nemo.",
    icon: Fish,
    href: "/activities",
  },
  {
    name: "Banana Boat",
    description: "Seru bersama keluarga & teman.",
    icon: Smile,
    href: "/activities",
  },
  {
    name: "Jetski",
    description: "Adrenalin di laut Kotabaru.",
    icon: Sailboat,
    href: "/activities",
  },
  {
    name: "Paddleboard",
    description: "Santai menikmati laut.",
    icon: Anchor,
    href: "/activities",
  },
  {
    name: "Kano / Kayak",
    description: "Eksplorasi lebih dekat.",
    icon: Ship,
    href: "/activities",
  },
];

const quickAccess = services.slice(0, 4);

/* =========================================
   FEATURED EXPERIENCES
========================================= */

const destinations = [
  {
    name: "Open & Private Trip",
    category: "TRIP",
    description: "Pulau · Snorkeling · Adventure",
    image:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=900&q=85",
    href: "/trip",
  },
  {
    name: "Stay Experience",
    category: "STAY",
    description: "Liburan nyaman tanpa ribet",
    image:
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=900&q=85",
    href: "/stay",
  },
  {
    name: "Underwater Stories",
    category: "SHINEMA",
    description: "Abadikan setiap perjalanan",
    image:
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=900&q=85",
    href: "/shinema",
  },
];

/* =========================================
   NAVIGATION
========================================= */

const navItems = [
  { name: "Home", href: "/", icon: House },
  { name: "Trip", href: "/trip", icon: Waves },
  { name: "Stay", href: "/stay", icon: BedDouble },
];

/* =========================================
   HOMEPAGE
========================================= */

export default function Home() {
  const [activeMenu, setActiveMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (query) {
      window.location.href = `/explore?q=${encodeURIComponent(query)}`;
    } else {
      window.location.href = "/explore";
    }
  }

  return (
    <main className="min-h-screen bg-[#F3F7FC] pb-28 text-[#0A2E63] md:pb-10">

      {/* =====================================
          HEADER
      ===================================== */}

      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-6xl items-center justify-between px-5">

          <Link href="/" className="relative h-10 w-[112px]">
            <Image
              src="/logo/shiap-logo.png"
              alt="SHIAP"
              fill
              priority
              sizes="112px"
              className="object-contain object-left"
            />
          </Link>

          <div className="flex items-center gap-2.5">

            <Link
              href="/profile"
              aria-label="Profile"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-slate-100 text-slate-400 shadow-sm"
            >
              <UserRound size={25} fill="currentColor" strokeWidth={1.5} />
            </Link>

            <button
              onClick={() => setActiveMenu(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition hover:bg-blue-50"
            >
              <Menu size={21} />
            </button>

          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-8">

        {/* =====================================
            HERO
        ===================================== */}

        <section className="relative">

          <div className="relative min-h-[238px] overflow-hidden rounded-[25px] bg-gradient-to-br from-[#082653] via-[#1052A6] to-[#1974FF] px-5 py-6 shadow-lg shadow-blue-900/10 md:min-h-[330px] md:px-10 md:py-10">

            <div className="absolute -right-16 top-10 h-64 w-64 rounded-full border border-white/10" />

            <div className="absolute -right-5 top-20 h-48 w-48 rounded-full border border-white/15" />

            <div className="absolute -bottom-28 right-10 h-56 w-56 rounded-full bg-cyan-300/10 blur-2xl" />

            <div className="relative z-10 max-w-[430px]">

              <p className="text-[10px] font-bold tracking-[0.18em] text-[#B9E5FF]">
                TRAVEL · EXPLORE · DISCOVER
              </p>

              <h1 className="mt-3 text-[29px] font-extrabold leading-[1.08] tracking-tight text-white md:text-5xl">
                Explore More.
                <br />
                With SHIAP.
              </h1>

              <p className="mt-3 max-w-[330px] text-[12px] leading-[1.7] text-blue-50 md:text-sm">
                Satu pintu untuk trip, stay, aktivitas laut, dokumentasi dan
                pengalaman wisata di Kotabaru.
              </p>

              <Link
                href="/explore"
                className="mt-4 inline-flex items-center gap-5 rounded-xl bg-white px-4 py-2.5 text-[11px] font-bold text-[#0A2E63] shadow-sm transition hover:bg-[#FF8518] hover:text-white"
              >
                Mulai Jelajah
                <ArrowRight size={15} />
              </Link>

            </div>

            <div className="pointer-events-none absolute -bottom-4 right-0 hidden text-white/10 md:block">
              <Waves size={210} strokeWidth={0.7} />
            </div>

          </div>

          {/* SEARCH BAR */}

          <form
            onSubmit={handleSearch}
            className="relative z-20 mx-3 -mt-4 flex h-[54px] items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 shadow-[0_10px_30px_rgba(10,46,99,0.10)] md:mx-8"
          >

            <Search size={18} className="shrink-0 text-[#1974FF]" />

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari trip, stay, snorkeling..."
              className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
            />

            <button
              type="submit"
              className="flex shrink-0 items-center gap-2 rounded-xl bg-[#1974FF] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#0A2E63]"
            >
              Cari
              <ArrowRight size={14} />
            </button>

          </form>

        </section>

        {/* =====================================
            QUICK ACCESS
        ===================================== */}

        <section className="mt-7">

          <div className="mb-3">

            <p className="text-[9px] font-extrabold tracking-[0.2em] text-[#1974FF]">
              MULAI DARI SINI
            </p>

            <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
              Akses Cepat
            </h2>

            <p className="mt-1 text-[10px] text-slate-500">
              Layanan favorit untuk perjalananmu.
            </p>

          </div>

          <div className="grid grid-cols-2 gap-2.5">

            {quickAccess.map((service) => {
              const Icon = service.icon;

              return (
                <Link
                  href={service.href}
                  key={service.name}
                  className="group flex min-h-[70px] items-center gap-2.5 rounded-[19px] border border-[#DCE8F6] bg-white p-3 shadow-[0_4px_15px_rgba(10,46,99,0.03)] transition hover:border-blue-300 hover:shadow-md"
                >

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-blue-100 bg-[#EEF6FF] text-[#1974FF]">
                    <Icon size={21} strokeWidth={2.2} />
                  </div>

                  <div className="min-w-0 flex-1">

                    <h3 className="text-[12px] font-bold text-[#0A2E63]">
                      {service.name}
                    </h3>

                    <p className="mt-1 line-clamp-2 text-[9px] leading-[1.45] text-slate-500">
                      {service.description}
                    </p>

                  </div>

                  <ArrowUpRight
                    size={13}
                    className="shrink-0 self-start text-[#1974FF]"
                  />

                </Link>
              );
            })}

          </div>
        </section>

        {/* =====================================
            EXPLORE SHIAP
        ===================================== */}

        <section className="mt-7">

          <div className="mb-3 flex items-end justify-between">

            <div>

              <p className="text-[9px] font-extrabold tracking-[0.2em] text-[#1974FF]">
                INSPIRASI PERJALANAN
              </p>

              <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
                Explore SHIAP
              </h2>

              <p className="mt-1 text-[10px] text-slate-500">
                Temukan pengalaman baru di Kotabaru.
              </p>

            </div>

            <Link
              href="/explore"
              className="mb-1 flex items-center gap-1 text-[10px] font-bold text-[#1974FF]"
            >
              Lihat semua
              <ArrowRight size={12} />
            </Link>

          </div>

          <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">

            {destinations.map((destination) => (

              <Link
                href={destination.href}
                key={destination.name}
                className="group relative h-[164px] w-[76%] shrink-0 snap-start overflow-hidden rounded-[20px] bg-[#0A2E63] shadow-md sm:w-[48%] md:h-[230px] md:w-[32%]"
              >

                <Image
                  src={destination.image}
                  alt={destination.name}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 76vw, 33vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#061D40]/90 via-[#061D40]/10 to-transparent" />

                <div className="absolute bottom-0 left-0 right-0 p-3.5">

                  <span className="inline-flex rounded-full bg-[#FF8518] px-2.5 py-1 text-[9px] font-extrabold text-white">
                    {destination.category}
                  </span>

                  <h3 className="mt-2 text-[16px] font-extrabold text-white">
                    {destination.name}
                  </h3>

                  <p className="mt-1 text-[10px] text-white/80">
                    {destination.description}
                  </p>

                </div>

              </Link>

            ))}

          </div>

        </section>

        {/* =====================================
            PROMOTION BANNER
        ===================================== */}

        <section className="mt-6">

          <div className="relative flex min-h-[110px] items-center overflow-hidden rounded-[22px] bg-gradient-to-r from-[#0A2E63] to-[#1459B2] px-4 py-5 shadow-lg shadow-blue-900/10">

            <div className="relative z-10 max-w-[72%]">

              <p className="text-[9px] font-medium text-blue-100">
                Rencanakan pengalaman wisatamu bersama SHIAP.
              </p>

              <h3 className="mt-1 text-[15px] font-extrabold leading-tight text-white">
                Your Next Journey Starts Here.
              </h3>

              <Link
                href="/trip"
                className="mt-3 inline-flex items-center gap-3 rounded-xl bg-[#FF8518] px-3.5 py-2.5 text-[10px] font-bold text-white transition hover:bg-white hover:text-[#0A2E63]"
              >
                Jelajahi Trip
                <ArrowRight size={13} />
              </Link>

            </div>

            <div className="absolute -right-3 bottom-0 text-white/15">
              <Ship size={115} strokeWidth={1} />
            </div>

            <Sparkles
              size={20}
              className="absolute right-8 top-5 text-cyan-300"
            />

          </div>

        </section>

        {/* =====================================
            ALL SERVICES
        ===================================== */}

        <section className="mt-7">

          <div className="mb-3 flex items-end justify-between">

            <div>

              <p className="text-[9px] font-extrabold tracking-[0.2em] text-[#1974FF]">
                SATU PINTU UNTUK WISATA
              </p>

              <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
                Jelajahi Layanan SHIAP
              </h2>

              <p className="mt-1 text-[10px] text-slate-500">
                Pilih pengalaman yang kamu butuhkan.
              </p>

            </div>

            <span className="mb-1 rounded-full bg-[#E5F0FF] px-2.5 py-1.5 text-[9px] font-bold text-[#1974FF]">
              8 layanan
            </span>

          </div>

          <div className="grid grid-cols-2 gap-2.5">

            {services.map((service) => {
              const Icon = service.icon;

              return (
                <Link
                  href={service.href}
                  key={service.name}
                  className="group relative flex min-h-[145px] flex-col rounded-[20px] border border-[#DCE8F6] bg-white p-3 shadow-[0_5px_18px_rgba(10,46,99,0.035)] transition hover:-translate-y-1 hover:shadow-lg"
                >

                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-blue-100 bg-[#EEF6FF] text-[#1974FF]">
                    <Icon size={22} strokeWidth={2.2} />
                  </div>

                  <h3 className="mt-2.5 text-[12px] font-bold">
                    {service.name}
                  </h3>

                  <p className="mt-1 max-w-[155px] text-[9px] leading-[1.5] text-slate-500">
                    {service.description}
                  </p>

                  <span className="absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF4FF] text-[#1974FF] transition group-hover:bg-[#1974FF] group-hover:text-white">
                    <ChevronRight size={13} />
                  </span>

                </Link>
              );
            })}

          </div>

        </section>

        {/* =====================================
            WHY SHIAP
        ===================================== */}

        <section className="mb-4 mt-7 rounded-[23px] border border-[#D7E8FA] bg-[#EAF3FC] p-4 md:p-7">

          <p className="text-[9px] font-extrabold tracking-[0.2em] text-[#1974FF]">
            WHY SHIAP
          </p>

          <h2 className="mt-2 max-w-[280px] text-[19px] font-extrabold leading-tight">
            Liburan lebih mudah, dari satu pintu.
          </h2>

          <p className="mt-2 text-[10px] leading-[1.7] text-slate-600">
            Temukan trip, stay, aktivitas laut, dan dokumentasi perjalanan
            dalam satu pengalaman.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">

            {[
              {
                number: "01",
                title: "Lokal Kotabaru",
                description: "Kenali destinasi dari perspektif lokal.",
              },
              {
                number: "02",
                title: "Booking praktis",
                description: "Informasi layanan dalam satu aplikasi.",
              },
              {
                number: "03",
                title: "#PastiShiap",
                description: "Siap menemani rencana perjalananmu.",
              },
            ].map((item) => (

              <div
                key={item.number}
                className="rounded-[17px] bg-white/85 p-3"
              >

                <p className="text-[9px] font-bold text-[#1974FF]">
                  {item.number}
                </p>

                <h3 className="mt-1.5 text-[10px] font-bold">
                  {item.title}
                </h3>

                <p className="mt-1 text-[9px] leading-[1.5] text-slate-500">
                  {item.description}
                </p>

              </div>

            ))}

          </div>

        </section>

        {/* =====================================
            FOOTER
        ===================================== */}

        <footer className="px-2 pb-5 pt-5 text-center md:pb-8">

          <div className="relative mx-auto mb-2 h-9 w-[110px]">

            <Image
              src="/logo/shiap-logo.png"
              alt="SHIAP"
              fill
              sizes="110px"
              className="object-contain"
            />

          </div>

          <p className="text-[10px] text-slate-500">
            Travel · Stay · Experience
          </p>

          <p className="mt-2 text-[9px] text-slate-400">
            © 2026 SHIAP. All rights reserved.
          </p>

        </footer>

      </div>

      {/* =====================================
          MOBILE BOTTOM NAVIGATION
      ===================================== */}

      <nav className="fixed bottom-2.5 left-3 right-3 z-40 rounded-[23px] border border-[#DCE8F6] bg-white/95 p-1.5 shadow-[0_8px_35px_rgba(10,46,99,0.13)] backdrop-blur-xl md:hidden">

        <div className="grid grid-cols-4 gap-1">

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.name === "Home";

            return (
              <Link
                href={item.href}
                key={item.name}
                className={`flex flex-col items-center justify-center gap-1 rounded-[16px] py-2.5 transition ${
                  active
                    ? "bg-[#EEF4FF] text-[#1974FF]"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >

                <Icon
                  size={19}
                  fill={active ? "currentColor" : "none"}
                />

                <span className="text-[9px] font-bold">
                  {item.name}
                </span>

              </Link>
            );
          })}

          <button
            onClick={() => setActiveMenu(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-[16px] py-2.5 text-slate-500 transition hover:bg-slate-50"
          >

            <LayoutGrid size={19} />

            <span className="text-[9px] font-bold">
              Layanan
            </span>

          </button>

        </div>

      </nav>

      {/* =====================================
          SERVICE MENU BOTTOM SHEET
      ===================================== */}

      {activeMenu && (

        <div className="fixed inset-0 z-[60]">

          <button
            aria-label="Close menu"
            onClick={() => setActiveMenu(false)}
            className="absolute inset-0 bg-[#071C39]/50 backdrop-blur-[3px]"
          />

          <section className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto rounded-t-[27px] bg-[#F8FAFD] px-4 pb-8 pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300">

            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300" />

            <div className="mb-4 flex items-center justify-between">

              <div className="relative h-10 w-[115px]">

                <Image
                  src="/logo/shiap-logo.png"
                  alt="SHIAP"
                  fill
                  sizes="115px"
                  className="object-contain object-left"
                />

              </div>

              <button
                onClick={() => setActiveMenu(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF1F7] text-[#0A2E63]"
              >

                <X size={19} />

              </button>

            </div>

            <p className="text-[9px] font-extrabold tracking-[0.2em] text-[#1974FF]">
              EXPLORE
            </p>

            <h2 className="mt-1 text-xl font-extrabold">
              Layanan SHIAP
            </h2>

            <p className="mt-1 text-[11px] text-slate-500">
              Temukan pengalaman yang kamu butuhkan.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">

              {services.map((service) => {
                const Icon = service.icon;

                return (
                  <Link
                    href={service.href}
                    key={service.name}
                    onClick={() => setActiveMenu(false)}
                    className="rounded-[19px] border border-[#DCE8F6] bg-white p-3.5 transition hover:border-blue-300"
                  >

                    <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#EEF4FF] text-[#1974FF]">
                      <Icon size={21} />
                    </div>

                    <h3 className="mt-2 text-[11px] font-bold">
                      {service.name}
                    </h3>

                    <p className="mt-1 text-[9px] leading-[1.5] text-slate-500">
                      {service.description}
                    </p>

                  </Link>
                );
              })}

            </div>

            <Link
              href="/booking"
              onClick={() => setActiveMenu(false)}
              className="mt-4 flex items-center justify-between rounded-[18px] bg-[#0A2E63] p-4 text-white"
            >

              <div>

                <p className="text-[10px] font-semibold text-blue-200">
                  BUTUH BANTUAN?
                </p>

                <p className="mt-1 text-sm font-bold">
                  Lihat booking kamu
                </p>

              </div>

              <ArrowRight size={19} />

            </Link>

          </section>

        </div>

      )}

    </main>
  );
}
