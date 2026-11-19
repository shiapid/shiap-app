import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Camera,
  ChevronRight,
  Compass,
  Flame,
  MapPin,
  Sailboat,
  Sparkles,
  UsersRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Trip } from "@/lib/trips";
import { HomePageHeader } from "@/components/home/homepage-client-chrome";
import FavoriteTripButton from "@/components/home/favorite-trip-button";
import HomepageServiceIcon from "@/components/home/homepage-service-icon";
import HomepageUiIcon from "@/components/home/homepage-ui-icon";
import HomeSearchForm from "@/components/home/home-search-form";

export type HomeHero = {
  eyebrow: string;
  title_line_one: string;
  title_line_two: string;
  description: string;
  button_label: string;
  button_href: string;
  search_placeholder: string;
  image_url: string | null;
};

export type HomeDestination = { name: string; image: string | null; href: string; source: "Trip" | "Stay" };
type HomepageProfile = { name: string; avatarUrl: string | null; isLoggedIn: boolean } | null;
type FeaturedTrip = Pick<Trip, "slug" | "title" | "location" | "duration" | "description" | "category"> & { image: string | null };

const mainServices = [
  { name: "Strip", description: "Paket perjalanan", href: "/trip", iconKey: "trip" as const },
  { name: "Stay", description: "Villa & penginapan", href: "/stay", iconKey: "stay" as const },
  { name: "Places", description: "Penginapan terverifikasi", href: "/places", iconKey: "places" as const },
  { name: "Aktivitas", description: "Wahana & laut", href: "/activities", iconKey: "activities" as const },
  { name: "Shinema", description: "Foto & video", href: "/shinema", iconKey: "shinema" as const },
  { name: "Rental", description: "Peralatan wisata", href: "/rental", iconKey: "rental" as const },
];

const trustItems = [
  { title: "Destinasi", subtitle: "Terkurasi", iconKey: "trust_destinations" as const },
  { title: "Booking", subtitle: "Mudah & Aman", iconKey: "trust_booking" as const },
  { title: "Partner Lokal", subtitle: "Terhubung", iconKey: "trust_partners" as const, hideOnMobile: true },
  { title: "Dukungan", subtitle: "Wisata Berkelanjutan", iconKey: "trust_sustainability" as const },
];

const moreExperiences: { title: string; href: string; icon: LucideIcon; iconKey: "custom_trip" | "trip" | "private_trip" | "shinema" | "activities" | "stay" }[] = [
  { title: "Paket Khusus", href: "/custom-trip", icon: Sparkles, iconKey: "custom_trip" as const },
  { title: "Open Trip", href: "/trip?mode=open", icon: Sailboat, iconKey: "trip" as const },
  { title: "Private Trip", href: "/trip?mode=private", icon: UsersRound, iconKey: "private_trip" as const },
  { title: "Foto & Video", href: "/shinema", icon: Camera, iconKey: "shinema" as const },
  { title: "Aktivitas Laut", href: "/activities", icon: Waves, iconKey: "activities" as const },
  { title: "Experience", href: "/experiences", icon: Sparkles, iconKey: "custom_trip" as const },
  { title: "Stay & Villa", href: "/stay", icon: BedDouble, iconKey: "stay" as const },
];

function SectionHeading({ eyebrow, title, subtitle, href, iconKey }: { eyebrow?: string; title: string; subtitle: string; href?: string; iconKey: "featured_trips" | "popular_destinations" | "more_experiences" }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 px-1">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FC] text-[#0A2E63]">
          <HomepageUiIcon iconKey={iconKey} size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          {eyebrow && <p className="text-[9px] font-extrabold tracking-[.16em] text-[#1974FF]">{eyebrow}</p>}
          <h2 className="text-[18px] font-extrabold leading-tight tracking-tight text-[#0A2E63] sm:text-xl">{title}</h2>
          <p className="mt-1 max-w-[270px] text-[10px] leading-4 text-slate-500 sm:text-xs">{subtitle}</p>
        </div>
      </div>
      {href && <Link href={href} className="mb-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] font-bold text-[#1974FF] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1974FF] sm:text-xs">Lihat semua <ChevronRight size={15} /></Link>}
    </div>
  );
}

function TripCard({ trip }: { trip: FeaturedTrip }) {
  return (
    <article className="group relative h-[265px] w-[84%] shrink-0 snap-start overflow-hidden rounded-[24px] bg-[#0A2E63] shadow-[0_10px_28px_rgba(10,46,99,0.13)] sm:h-[290px] sm:w-[65%] md:h-[290px] md:w-auto">
      <Link href={`/trip/${encodeURIComponent(trip.slug)}`} aria-label={`Lihat trip ${trip.title}`} className="absolute inset-0 z-0 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#1974FF]">
        {trip.image && <Image src={trip.image} alt={trip.title} fill unoptimized sizes="(max-width: 640px) 84vw, (max-width: 1024px) 65vw, 33vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />}
        <span className="absolute inset-0 bg-gradient-to-t from-[#03182E]/95 via-[#03182E]/25 to-transparent" />
      </Link>
      <FavoriteTripButton slug={trip.slug} title={trip.title} className="absolute right-3 top-3 z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold text-[#0A2E63]">
          <Flame size={12} className="shrink-0 text-[#FF8518]" />
          <span className="truncate">{trip.category[0] || "Trip SHIAP"}</span>
        </span>
        <h3 className="mt-2 line-clamp-2 text-lg font-extrabold leading-tight sm:text-[22px]">{trip.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-white/85"><MapPin size={12} className="shrink-0"/><span className="truncate">{trip.location}</span></p>
        <p className="mt-1 line-clamp-1 text-[10px] text-white/80">{trip.duration}</p>
        <span className="pointer-events-auto mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-[#FF8518] px-4 text-[10px] font-extrabold text-white shadow-md transition group-hover:bg-white group-hover:text-[#0A2E63]">Lihat Detail <ArrowRight size={14}/></span>
      </div>
    </article>
  );
}

function DestinationCard({ destination }: { destination: HomeDestination }) {
  return (
    <Link href={destination.href} className="group relative h-[150px] w-[42%] shrink-0 snap-start overflow-hidden rounded-[21px] bg-gradient-to-br from-[#1974FF] to-[#0A2E63] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1974FF] sm:h-[172px] sm:w-[210px]">
      {destination.image && <Image src={destination.image} alt={destination.name} fill unoptimized sizes="(max-width: 640px) 42vw, 210px" className="object-cover transition duration-700 group-hover:scale-105" />}
      <span className="absolute inset-0 bg-gradient-to-t from-[#03182E]/90 via-[#03182E]/10 to-transparent" />
      <span className="absolute bottom-3 left-3 right-3">
        <span className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-white/75"><MapPin size={11}/>{destination.source}</span>
        <span className="line-clamp-2 block text-[13px] font-extrabold leading-tight text-white sm:text-sm">{destination.name}</span>
      </span>
    </Link>
  );
}

export default function HomePageSections({ hero, trips, destinations, profile }: { hero: HomeHero; trips: FeaturedTrip[]; destinations: HomeDestination[]; profile: HomepageProfile }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-0 sm:px-4 md:px-6 lg:px-8">
      <section className="relative isolate min-h-[465px] overflow-hidden rounded-b-[30px] bg-gradient-to-br from-[#07345E] via-[#075A88] to-[#138BB0] shadow-[0_18px_46px_rgba(5,54,89,0.18)] sm:min-h-[500px] sm:rounded-b-[30px] md:min-h-[545px]">
        {hero.image_url && (
          <div className="absolute inset-0 -z-20">
            <Image src={hero.image_url} alt="" fill priority unoptimized sizes="100vw" className="object-cover object-[65%_43%] md:object-[center_43%]" />
          </div>
        )}
        {hero.image_url && <span className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(10,46,99,0.92)_0%,rgba(10,46,99,0.72)_55%,rgba(10,46,99,0.20)_100%)] md:bg-[linear-gradient(90deg,#0A2E63_0%,#0A2E63_40%,rgba(10,46,99,0.92)_50%,rgba(10,46,99,0.65)_62%,rgba(10,46,99,0.25)_78%,rgba(10,46,99,0)_100%)]" />}
        <span className="absolute -right-24 top-28 -z-10 h-80 w-80 rounded-full border border-white/10 sm:right-0" />
        <span className="absolute -right-10 top-40 -z-10 h-56 w-56 rounded-full border border-white/10" />
        <HomePageHeader profile={profile} />

        <div className="mx-auto max-w-6xl px-5 pb-24 pt-4 sm:px-8 sm:pb-28 sm:pt-8 md:px-10 md:pt-8">
          <p className="text-[10px] font-extrabold tracking-[.25em] text-white/85 sm:text-xs">{hero.eyebrow}</p>
          <span className="mt-2 block h-1.5 w-14 rounded-full bg-[#FF8518]" />
          <h1 className="mt-4 max-w-[580px] text-[34px] font-extrabold leading-[1.02] tracking-[-.035em] text-white sm:text-5xl md:text-[58px]">
            {hero.title_line_one}<br />{hero.title_line_two}
          </h1>
          <p className="mt-4 max-w-[380px] text-[14px] leading-[1.55] text-white/90 sm:text-base">{hero.description}</p>
          <Link href={hero.button_href} className="mt-5 inline-flex min-h-10 items-center gap-3 rounded-full bg-white px-4 text-[11px] font-extrabold text-[#0A2E63] shadow-md transition hover:bg-[#FF8518] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{hero.button_label}<ArrowRight size={15}/></Link>
        </div>

        <HomeSearchForm placeholder={hero.search_placeholder} />
      </section>

      <div className="space-y-8 px-4 pt-5 sm:px-4 sm:pt-7 md:space-y-10 md:px-2 md:pt-8">
        <section aria-labelledby="main-services-heading" className="-mx-1">
          <h2 id="main-services-heading" className="sr-only">Layanan utama SHIAP</h2>
          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            {mainServices.map(({ name, description, href, iconKey }) => (
              <Link href={href} key={name} aria-label={`${name}: ${description}`} className="group flex min-w-0 flex-col items-center rounded-[20px] border border-white/80 bg-white/95 px-1 py-3 text-center shadow-[0_8px_25px_rgba(10,46,99,0.08)] transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1974FF] sm:rounded-[22px] sm:px-2.5 sm:py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF3FC] text-[#1974FF] sm:h-14 sm:w-14">
                  <HomepageServiceIcon iconKey={iconKey} />
                </span>
                <span className="mt-1.5 block max-w-full truncate text-[10px] font-extrabold leading-tight text-[#0A2E63] sm:mt-2 sm:text-sm">{name}</span>
                <span className="mt-1 block max-w-full text-[9px] leading-4 text-slate-500 sm:max-w-[110px] sm:text-[10px]">{description}</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="-mx-1">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-3 gap-1 rounded-[22px] border border-white bg-white/90 p-1.5 shadow-[0_8px_28px_rgba(10,46,99,0.08)] sm:gap-2 sm:p-3 md:flex md:items-center md:justify-between md:rounded-full md:px-5 md:py-3">
            {trustItems.map(({ title, subtitle, iconKey, hideOnMobile }, index) => (
              <div key={title} className={`flex min-w-0 items-center ${hideOnMobile ? "hidden md:flex" : ""}`}>
                <div className="flex min-h-[54px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl px-1 py-2 sm:gap-2.5 sm:px-3 md:min-h-0 md:justify-start md:rounded-none md:px-3 md:py-1">
                  <HomepageUiIcon iconKey={iconKey} size={24} className="shrink-0 text-[#FF8518] sm:h-6 sm:w-6" strokeWidth={2.3}/>
                  <span className="min-w-0 text-[10px] leading-snug text-[#0A2E63] sm:text-xs md:text-sm"><strong className="block font-extrabold">{title}</strong><span className="block">{subtitle}</span></span>
                </div>
                {index < trustItems.length - 1 && <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-blue-100 md:block"/>}
              </div>
            ))}
          </div>
        </div>

        <section aria-labelledby="featured-trips-heading">
          <SectionHeading eyebrow="PILIHAN SHIAP" title="Pilihan Trip Spesial" subtitle="Paket perjalanan pilihan dari katalog SHIAP." href="/trip" iconKey="featured_trips"/>
          {trips.length > 0 ? (
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
              {trips.map((trip) => <TripCard key={trip.slug} trip={trip}/>)}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-blue-200 bg-white px-5 py-8 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[#1974FF]"><Compass size={22}/></span>
              <h3 className="mt-3 text-sm font-bold text-[#0A2E63]">Trip unggulan segera hadir</h3>
              <p className="mt-1 text-xs text-slate-500">Paket akan tampil di sini setelah dipublikasikan dari katalog SHIAP.</p>
              <Link href="/trip" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1974FF]">Lihat katalog trip <ArrowRight size={14}/></Link>
            </div>
          )}
        </section>

        <section aria-labelledby="popular-destinations-heading">
          <SectionHeading eyebrow="DARI KATALOG TRIP & STAY" title="Destinasi Populer" subtitle="Jelajahi lokasi yang tersedia di katalog SHIAP." href="/explore" iconKey="popular_destinations"/>
          {destinations.length > 0 ? (
            <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {destinations.map((destination) => <DestinationCard key={destination.name} destination={destination}/>)}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-blue-200 bg-white p-5 text-center text-xs text-slate-500">Destinasi akan tampil setelah Trip atau Stay dipublikasikan di katalog.</div>
          )}
        </section>

        <section aria-labelledby="more-experiences-heading">
          <SectionHeading eyebrow="JELAJAHI LEBIH BANYAK" title="Pengalaman SHIAP" subtitle="Pilih layanan lain untuk melengkapi perjalananmu." href="/explore" iconKey="more_experiences"/>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-6">
            {moreExperiences.map(({ title, href, icon: Icon, iconKey }) => (
              <Link key={title} href={href} className="group flex min-h-[105px] flex-col items-center justify-center rounded-[20px] border border-white bg-white/85 p-3 text-center shadow-[0_6px_20px_rgba(10,46,99,0.06)] transition hover:-translate-y-1 hover:border-blue-200 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1974FF] sm:min-h-[122px]">
                {iconKey ? <HomepageUiIcon iconKey={iconKey} size={27} strokeWidth={1.8} className="text-[#0A2E63] transition group-hover:text-[#1974FF]"/> : <Icon size={27} strokeWidth={1.8} className="text-[#0A2E63] transition group-hover:text-[#1974FF]"/>}
                <span className="mt-2 text-[10px] font-bold leading-tight text-[#0A2E63] sm:text-xs">{title}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-2 overflow-hidden rounded-[24px] bg-gradient-to-r from-[#082C58] to-[#1265D8] px-5 py-5 text-white shadow-lg shadow-blue-900/10 sm:px-7 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="max-w-[78%]">
              <p className="text-[9px] font-bold tracking-wide text-blue-100">Rencanakan perjalananmu bersama SHIAP</p>
              <h2 className="mt-1 text-lg font-extrabold leading-tight sm:text-xl">Perjalanan seru dimulai dari sini.</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/trip" className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#FF8518] px-4 text-[10px] font-extrabold text-white transition hover:bg-white hover:text-[#0A2E63]">Jelajahi Trip <ArrowRight size={13}/></Link>
                <Link href="/custom-trip" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 text-[10px] font-extrabold text-white transition hover:bg-white hover:text-[#0A2E63]"><Sparkles size={13}/> Rancang Trip</Link>
              </div>
            </div>
            <Sailboat size={72} strokeWidth={1.2} className="shrink-0 text-white/30 sm:h-[90px] sm:w-[90px]" aria-hidden="true"/>
          </div>
        </section>

        <footer className="px-2 pb-5 pt-2 text-center md:pb-8">
          <Image src="/logo/shiap-logo.png" alt="SHIAP" width={112} height={38} className="mx-auto h-9 w-28 object-contain" />
          <p className="mt-1 text-[10px] text-slate-500">Travel · Stay · Experience</p>
          <p className="mt-2 text-[9px] text-slate-400">© 2026 SHIAP · PT SHIAP BERSAMA MARAIS</p>
        </footer>
      </div>
    </div>
  );
}
