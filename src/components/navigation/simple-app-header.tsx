"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, TicketCheck, UserRound } from "lucide-react";

const items = [
  { label: "Home", href: "/", icon: House },
  { label: "Explore", href: "/trip", icon: Compass },
  { label: "Booking", href: "/booking", icon: TicketCheck },
  { label: "Profile", href: "/profile", icon: UserRound },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/trip") return pathname === "/trip" || pathname.startsWith("/trip/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SimpleAppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-slate-100 bg-white/95 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link href="/" aria-label="SHIAP Home" className="shrink-0">
          <Image
            src="/logo/shiap-logo.png"
            alt="SHIAP"
            width={150}
            height={54}
            priority
            className="h-auto w-[126px] object-contain"
          />
        </Link>

        <nav aria-label="Navigasi utama" className="flex items-center gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isCurrent(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-blue-50 text-[#1974FF]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-[#0A2E63]"
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span className="text-[10px] font-bold tracking-[0.16em] text-slate-400">
          TRAVEL · STAY · EXPERIENCE
        </span>
      </div>
    </header>
  );
}
