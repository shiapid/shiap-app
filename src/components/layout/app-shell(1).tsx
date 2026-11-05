import AppHeader from "./app-header";
import BottomNavigation from "./bottom-navigation";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader />
      <main className="min-w-0 flex-1 pb-[82px] md:pb-0">{children}</main>
      <BottomNavigation />
    </div>
  );
}
