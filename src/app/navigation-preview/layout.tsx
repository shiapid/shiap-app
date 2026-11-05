import SimpleAppShell from "@/components/navigation/simple-app-shell";

export default function NavigationPreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <SimpleAppShell>{children}</SimpleAppShell>;
}
