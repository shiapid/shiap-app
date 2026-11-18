import SimpleAppHeader from "./simple-app-header";

type SimpleAppShellProps = {
  children: React.ReactNode;
};

export default function SimpleAppShell({ children }: SimpleAppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SimpleAppHeader />
      <main className="min-w-0 flex-1 pb-[82px] md:pb-0">{children}</main>
    </div>
  );
}
