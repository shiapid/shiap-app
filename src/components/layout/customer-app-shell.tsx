"use client";

import { usePathname } from "next/navigation";
import AppHeader from "@/components/layout/app-header";
import BottomNavigation from "@/components/layout/bottom-navigation";

const bottomSpacedRoutes = ["/trip", "/stay", "/booking", "/profile", "/my-booking", "/navigation-preview"];

export default function CustomerAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isHome = pathname === "/";
  const hasLegacyBottomSpacing = bottomSpacedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  return (
    <>
      <div aria-hidden={isHome || isAdmin} className={isHome || isAdmin ? "hidden" : undefined}>
        <AppHeader />
      </div>
      <div className={`min-w-0 flex-1 ${hasLegacyBottomSpacing && !isAdmin ? "pb-[82px] md:pb-0" : ""}`}>
        {children}
      </div>
      <BottomNavigation />
    </>
  );
}
