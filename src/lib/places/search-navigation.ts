export function placesSearchHref(search: string, query: string, destination: string) {
  const params = new URLSearchParams(search);
  params.delete("page");
  if (query.trim()) params.set("q", query.trim()); else params.delete("q");
  if (destination) params.set("destination", destination); else params.delete("destination");
  const suffix = params.toString();
  return "/places" + (suffix ? "?" + suffix : "");
}
