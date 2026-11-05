"use client";

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

export default function SimpleBottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid h-[66px] max-w-lg grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isCurrent(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 transition ${
                active ? "text-[#1974FF]" : "text-slate-400"
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.35 : 1.8} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
