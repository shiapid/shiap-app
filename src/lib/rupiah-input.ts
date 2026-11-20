export const MAX_CATALOG_RUPIAH = 999_999_999_999;

export function parseCatalogRupiah(value: unknown, minimum = 0): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= minimum && amount <= MAX_CATALOG_RUPIAH ? amount : null;
}
