"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, TicketCheck, UserRound } from "lucide-react";
import { SiteIcon } from "@/components/site/site-icon-provider";

const navigationItems = [
  { label: "Beranda", href: "/", icon: House, iconKey: "home" as const },
  { label: "Jelajahi", href: "/explore", icon: Compass, iconKey: "explore" as const },
  { label: "Booking", href: "/booking", icon: TicketCheck, iconKey: "booking" as const },
  { label: "Akun", href: "/profile", icon: UserRound, iconKey: "profile" as const },
];

function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`absolute right-3 top-2 h-1.5 w-1.5 rounded-full bg-[#FF8518] transition-opacity duration-150 ${pending ? "opacity-100" : "opacity-0"}`} />;
}

function matchesNavigation(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/explore") {
    return ["/explore", "/experiences", "/trip", "/stay", "/activities", "/rental", "/shinema", "/custom-trip"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  }
  if (href === "/booking") {
    return ["/booking", "/my-booking"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  }
  if (href === "/profile") {
    return ["/profile", "/favorites"].some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNavigation() {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-[60] border-t border-[#DCE8F6] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_26px_rgba(10,46,99,0.09)] backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[66px] max-w-lg grid-cols-4 gap-0.5 px-1">
        {navigationItems.map(({ label, href, icon: Icon, iconKey }) => {
          const active = matchesNavigation(pathname, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative my-1 flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1974FF] ${active ? "bg-[#EAF3FC] text-[#1974FF]" : "text-slate-500 hover:bg-slate-50 hover:text-[#0A2E63]"}`}>
              <PendingHint />
              {iconKey ? <SiteIcon iconKey={iconKey} fallback={Icon} size={21} strokeWidth={active ? 2.3 : 1.8} /> : <Icon size={21} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true"/>}
              <span className={`text-[9px] font-bold min-[380px]:text-[10px] ${active ? "text-[#1974FF]" : "text-slate-500"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
