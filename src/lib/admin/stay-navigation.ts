export const staySections = [
  { id: "properties", label: "Properti" },
  { id: "rooms", label: "Kamar & Tarif" },
  { id: "calendar", label: "Kalender Stay" },
  { id: "blocks", label: "Blokir Tanggal" },
] as const;

export type StaySection = (typeof staySections)[number]["id"];
export type StayContext = { property?: string; room?: string; date?: string; filter?: "occupied" | "full" };
export const todayInStay = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar" }).format();

export function isStayDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function stayHref(section: StaySection, { property, room, date, filter }: StayContext = {}, back = false) {
  const params = new URLSearchParams();
  if (section !== "properties") params.set("view", section);
  if (property) params.set("property", property);
  if (room) params.set("room", room);
  if (date) params.set("date", date);
  if (filter) params.set("filter", filter);
  if (back) params.set("back", "calendar");
  return params.size ? `/admin/stay?${params}` : "/admin/stay";
}

export function globalStayCalendarHref({ property, room, date }: StayContext = {}) {
  const params = new URLSearchParams({ service: "stay" });
  if (property) params.set("property", property);
  if (room) params.set("room", room);
  if (date) params.set("date", date);
  return `/admin/calendar?${params}`;
}
