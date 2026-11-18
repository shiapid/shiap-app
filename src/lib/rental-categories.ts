export const RENTAL_CATEGORIES = [
  { key: "water-sports-snorkeling", label: "Water Sports & Snorkeling" },
  { key: "beach-marine-adventure", label: "Beach & Marine Adventure" },
  { key: "boat-island-transport", label: "Boat & Island Transport" },
  { key: "vehicle-mobility", label: "Vehicle & Mobility" },
  { key: "camping-outdoor-gear", label: "Camping & Outdoor Gear" },
  { key: "camera-creator-gear", label: "Camera & Creator Gear" },
  { key: "beach-leisure-equipment", label: "Beach & Leisure Equipment" },
  { key: "event-group-equipment", label: "Event & Group Equipment" },
] as const;

export type RentalCategory = (typeof RENTAL_CATEGORIES)[number]["key"];

export const RENTAL_CATEGORY_LABELS: Record<RentalCategory, string> = Object.fromEntries(
  RENTAL_CATEGORIES.map(({ key, label }) => [key, label]),
) as Record<RentalCategory, string>;
