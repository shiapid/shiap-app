
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Ship,
  BedDouble,
  LayoutGrid,
} from "lucide-react";

type BottomNavigationProps = {
  onServicesClick: () => void;
};

const navigationItems = [
  {
    label: "Home",
    href: "/",
    icon: House,
  },
  {
    label: "Trip",
    href: "/trip",
    icon: Ship,
  },
  {
    label: "Stay",
    href: "/stay",
    icon: BedDouble,
  },
];

export default function BottomNavigation({
  onServicesClick,
}: BottomNavigationProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[66px] max-w-lg grid-cols-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 transition ${
                active ? "text-[#1974FF]" : "text-slate-400"
              }`}
            >
              <Icon
                size={21}
                strokeWidth={active ? 2.3 : 1.8}
              />
              <span className="text-[10px] font-semibold">
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onServicesClick}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 transition hover:text-[#1974FF]"
        >
          <LayoutGrid size={21} strokeWidth={1.8} />
          <span className="text-[10px] font-semibold">Layanan</span>
        </button>
      </div>
    </nav>
  );
}
