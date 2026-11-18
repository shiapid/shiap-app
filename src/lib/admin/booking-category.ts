import type { BookingServiceType } from "../booking-engine";

const categoryAliases = new Map<string, Exclude<BookingServiceType, "other">>([
  ["trip", "trip"],
  ["strip", "trip"],
  ["stay", "stay"],
  ["activity", "activity"],
  ["rental", "rental"],
  ["documentation", "documentation"],
  ["shinema", "documentation"],
]);

function knownCategory(value?: string | null) {
  return categoryAliases.get(value?.trim().toLowerCase() ?? "");
}

export function bookingItemCategory(item: { service_category?: string | null; service_type: string }) {
  return knownCategory(item.service_category) ?? knownCategory(item.service_type) ?? "other";
}

export function bookingServiceFilter(value: string) {
  return knownCategory(value) ?? "all";
}
