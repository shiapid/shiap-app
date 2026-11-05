
"use client";

import { useState } from "react";
import AppHeader from "./app-header";
import BottomNavigation from "./bottom-navigation";
import ServicesSheet from "./services-sheet";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [servicesOpen, setServicesOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader onMenuClick={() => setServicesOpen(true)} />

      <main className="min-w-0 flex-1 pb-[82px] md:pb-0">
        {children}
      </main>

      <BottomNavigation
        onServicesClick={() => setServicesOpen(true)}
      />

      <ServicesSheet
        open={servicesOpen}
        onClose={() => setServicesOpen(false)}
      />
    </div>
  );
}
