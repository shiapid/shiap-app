import Link from "next/link";
import { Compass, House, TicketCheck, UserRound } from "lucide-react";

const destinations = [
  {
    title: "Home",
    href: "/",
    description: "Kembali ke homepage SHIAP Tahap 1.",
    icon: House,
  },
  {
    title: "Explore",
    href: "/trip",
    description: "Masuk ke halaman katalog Trip yang sudah tersedia.",
    icon: Compass,
  },
  {
    title: "Booking",
    href: "/booking",
    description: "Area booking pelanggan.",
    icon: TicketCheck,
  },
  {
    title: "Profile",
    href: "/profile",
    description: "Area profil pelanggan.",
    icon: UserRound,
  },
];

export default function NavigationPreviewPage() {
  return (
    <div className="min-h-[75dvh] bg-[#F7F9FC]">
      <section className="bg-[#0A2E63]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">
            SHIAP APP · STAGE 2
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-5xl">
            One simple way to explore.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
            Navigasi sederhana untuk menghubungkan seluruh pengalaman SHIAP.
            Tampilan ini adalah halaman uji App Shell dan tidak mengubah homepage utama.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#1974FF]">
            Main navigation
          </p>
          <h2 className="mt-1 text-xl font-bold text-[#0A2E63]">
            Empat menu utama
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {destinations.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1974FF]">
                  <Icon size={21} />
                </div>
                <h3 className="mt-4 font-bold text-[#0A2E63]">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {item.description}
                </p>
                <span className="mt-4 inline-block text-xs font-bold text-[#1974FF]">
                  Buka halaman →
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
          <p className="text-sm font-semibold text-[#0A2E63]">
            Cara menguji
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
            <li>Di desktop, navigasi tampil di header bagian atas.</li>
            <li>Di mobile, navigasi tampil tetap di bagian bawah layar.</li>
            <li>Menu aktif mengikuti halaman yang sedang dibuka.</li>
            <li>Homepage utama tetap dipertahankan tanpa perubahan.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
