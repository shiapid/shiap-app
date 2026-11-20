import { isStayDate, stayHref, staySections } from "./stay-navigation.ts";

export const experienceSections = [
  { id: "overview", label: "Ringkasan" },
  { id: "categories", label: "Kategori" },
  { id: "products", label: "Daftar Produk" },
  { id: "packages", label: "Paket & Harga" },
  { id: "operations", label: "Add-on, Sesi & Resource" },
] as const;

export function experienceTab(value: string | null) {
  return experienceSections.find(section => section.id === value)?.id ?? "overview";
}

type Leaf = { label: string; href: string; detail?: string; view?: string };
type Menu = { id: string; label: string; href?: string; children?: readonly Leaf[]; query?: string };

export const adminMenu: readonly { title: string; items: readonly Menu[] }[] = [
  { title: "Operasional", items: [
    { id: "dashboard", label: "Dashboard", href: "/admin" },
    { id: "bookings", label: "Booking Center", href: "/admin/bookings" },
    { id: "calendar", label: "Kalender", href: "/admin/calendar" },
    { id: "notifications", label: "Notifikasi", href: "/admin/notifications" },
    { id: "finance", label: "Keuangan", href: "/admin/finance" },
    { id: "checkIn", label: "Check-in Tiket", href: "/admin/tickets/check-in" },
  ] },
  { title: "Katalog Layanan", items: [
    { id: "trip", label: "Trip / Strip", href: "/admin/trips" },
    { id: "stay", label: "Stay", query: "view", children: [
      ...staySections.map(section => ({ label: section.label, href: stayHref(section.id), view: section.id })),
      { label: "Kemitraan & Perjanjian", href: "/admin/stay/partners" },
    ] },
    { id: "activity", label: "Activity / Wahana", href: "/admin/activities" },
    { id: "experience", label: "Experience", query: "tab", children: experienceSections.map(section => ({
      label: section.label,
      href: section.id === "overview" ? "/admin/experiences" : `/admin/experiences?tab=${section.id}`,
      view: section.id,
    })) },
    { id: "rental", label: "Rental", href: "/admin/rental" },
    { id: "shinema", label: "Shinema", href: "/admin/shinema" },
  ] },
  { title: "Places", items: [
    { id: "places", label: "Places", children: [
      { label: "Direktori & Verifikasi", href: "/admin/places" },
      { label: "Leads", href: "/admin/places/leads" },
      { label: "Partner & Kepemilikan", href: "/admin/places/claims" },
      { label: "Konten Premium", href: "/admin/places/premium", detail: "Pratinjau Properti" },
      { label: "Langganan & Billing", href: "/admin/places/billing" },
      { label: "Analitik", href: "/admin/places/analytics" },
      { label: "Template WhatsApp", href: "/admin/places/settings" },
    ] },
  ] },
  { title: "Master Data", items: [
    { id: "destinations", label: "Destinasi", href: "/admin/destinations" },
    { id: "customers", label: "Pelanggan", href: "/admin/customers" },
  ] },
  { title: "Lainnya", items: [
    { id: "custom", label: "Custom Trip", href: "/admin/custom-trip-settings" },
    { id: "profile", label: "Profil Admin", href: "/admin/profile" },
    { id: "settings", label: "Pengaturan", href: "/admin/settings" },
    { id: "icons", label: "Ikon Website", href: "/admin/site-icons" },
  ] },
];

type Search = Pick<URLSearchParams, "get">;
const pathOf = (href: string) => href.split("?")[0];

export function adminLocation(pathname: string, search: Search) {
  for (const group of adminMenu) {
    for (const item of group.items) {
      if (item.children) {
        const scoped = [...item.children].reverse().find(leaf => !leaf.view && (
          pathname === leaf.href || (leaf.href !== "/admin/places" && pathname.startsWith(leaf.href + "/"))
        ));
        if (scoped) return { group: group.title, item, leaf: scoped, detail: pathname === scoped.href ? undefined : scoped.detail };
        if (item.query) {
          const panes = item.children.filter(leaf => leaf.view && pathname === pathOf(leaf.href));
          const view = search.get(item.query);
          const leaf = panes.find(pane => pane.view === view) ?? panes[0];
          if (leaf) return { group: group.title, item, leaf };
        }
      } else if (item.href === pathname || (item.id === "bookings" && pathname.startsWith("/admin/bookings/"))) {
        return { group: group.title, item, detail: item.id === "bookings" && pathname !== item.href ? "Detail Booking" : undefined };
      }
    }
  }
}

export function adminLeafHref(item: Menu, leaf: Leaf, pathname: string, search: Search) {
  if (item.id !== "stay" || !leaf.view || pathname !== "/admin/stay") return leaf.href;
  const date = search.get("date");
  const filter = search.get("filter");
  const section = staySections.find(section => section.id === leaf.view);
  return section ? stayHref(section.id, {
    property: search.get("property") ?? undefined,
    room: search.get("room") ?? undefined,
    date: isStayDate(date) ? date : undefined,
    filter: filter === "occupied" || filter === "full" ? filter : undefined,
  }) : leaf.href;
}
