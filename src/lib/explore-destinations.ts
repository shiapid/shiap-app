export function normalizeSearch(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("id")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matchesSearch(value: string, query: string) {
  const haystack = normalizeSearch(value);
  return normalizeSearch(query).split(" ").every((word) => haystack.includes(word));
}

const locationParts = (value: string) => value.trim().split(/\s*,\s*/).filter(Boolean);
const locationKey = (parts: string[]) => parts.map(normalizeSearch).filter(Boolean).join(",");

export function catalogDestinations(locations: string[]) {
  const recorded = new Map<string, string[]>();
  for (const location of locations) {
    const parts = locationParts(location);
    if (normalizeSearch(parts.at(-1) ?? "") === "indonesia" && parts.length > 1) parts.pop();
    const key = locationKey(parts);
    if (key && !recorded.has(key)) recorded.set(key, parts);
  }
  const canonical = new Map<string, { id: string; label: string }>();
  for (const [key, parts] of recorded) {
    const longer = [...recorded.keys()].filter((candidate) => candidate.startsWith(key + ","));
    const id = longer.length === 1 ? longer[0] : key;
    canonical.set(key, { id, label: (recorded.get(id) ?? parts).join(", ") });
  }
  return (location: string) => {
    const parts = locationParts(location);
    if (normalizeSearch(parts.at(-1) ?? "") === "indonesia" && parts.length > 1) parts.pop();
    return canonical.get(locationKey(parts)) ?? null;
  };
}
