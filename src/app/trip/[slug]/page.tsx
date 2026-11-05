import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, Clock3, CheckCircle2 } from "lucide-react";
import { trips } from "@/lib/trips";

type TripDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return trips.map((trip) => ({ slug: trip.slug }));
}

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { slug } = await params;
  const trip = trips.find((item) => item.slug === slug);
  if (!trip) notFound();

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-8">
        <Link href="/trip" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1974FF]">
          <ArrowLeft size={17} /> Kembali ke Explore
        </Link>

        <div className="relative mt-5 aspect-[16/10] overflow-hidden rounded-3xl bg-slate-200 sm:aspect-[21/9]">
          <Image src={trip.image} alt={trip.title} fill priority sizes="(max-width: 1024px) 100vw, 960px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07172F]/75 via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 text-white sm:bottom-8 sm:left-8">
            <div className="mb-3 flex flex-wrap gap-2">
              {trip.category.map((category) => (
                <span key={category} className="rounded-full bg-white/20 px-3 py-1.5 text-[10px] font-semibold backdrop-blur-md">{category}</span>
              ))}
            </div>
            <h1 className="text-2xl font-bold sm:text-4xl">{trip.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-white/90 sm:text-sm"><MapPin size={15} /> {trip.location}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold text-[#0A2E63]">Tentang perjalanan</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{trip.description}</p>
              <div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Clock3 size={16} className="text-[#1974FF]" /> {trip.duration}</div>
            </section>
            <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold text-[#0A2E63]">Pengalaman perjalanan</h2>
              <div className="mt-4 space-y-4">
                {trip.highlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#1974FF]" />
                    <p className="text-sm text-slate-600">{highlight}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">Plan your journey</p>
            <h2 className="mt-2 text-lg font-bold text-[#0A2E63]">Siap menjelajah?</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Hubungi tim SHIAP untuk informasi jadwal, ketersediaan, dan harga perjalanan ini.</p>
            <Link href={`/booking?trip=${trip.slug}`} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700">
              Mulai Booking <ArrowRight size={17} />
            </Link>
            <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">Jadwal dan harga akan dikonfirmasi oleh tim SHIAP.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
