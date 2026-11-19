import type { PlacesDestination } from "./types.ts";

/** Counts come only from the published, verified, non-demo Places projection. */
export function placesDestinationChoices(destinations: PlacesDestination[], loadError = false) {
 return [...new Map(destinations.map(destination => [destination.id, destination])).values()]
  .sort((a, b) => Number(b.listing_count > 0) - Number(a.listing_count > 0) || a.name.localeCompare(b.name, "id"))
  .map(destination => ({ id: destination.slug, label: destination.name, region: [destination.city, destination.province].filter(Boolean).join(", "), terms: [destination.canonical_name, ...destination.aliases], count: loadError ? undefined : destination.listing_count }));
}
