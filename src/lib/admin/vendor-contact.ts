import { normalizeIdPhone } from "../places/utils.ts";

export const vendorProductColumns = ["trip_id", "stay_id", "places_id", "experience_id", "catalog_id"] as const;
export type VendorProductColumn = typeof vendorProductColumns[number];
export type VendorContact = { name: string; whatsapp: string; notes: string };

export function parseVendorContact(form: FormData): VendorContact | null {
  const rawName = form.get("name");
  const phone = form.get("whatsapp");
  const rawNotes = form.get("notes");
  if (typeof rawName !== "string" || typeof phone !== "string" || (rawNotes !== null && typeof rawNotes !== "string")) return null;
  const name = rawName.trim();
  const whatsapp = phone.length <= 40 ? normalizeIdPhone(phone) : null;
  const notes = (rawNotes ?? "").trim();
  if (!name || name.length > 120 || !whatsapp || notes.length > 1000) return null;
  return { name, whatsapp, notes };
}

export function vendorWhatsAppLink(phone: string, booking: string, service: string, dates: string, guests: number, quantity: number) {
  const whatsapp = normalizeIdPhone(phone);
  if (!whatsapp) return null;
  const message = [
    "Halo, kami dari SHIAP ingin mengonfirmasi layanan berikut.",
    "Kode booking: " + booking,
    "Layanan: " + service,
    "Tanggal: " + dates,
    "Jumlah: " + guests + " peserta / " + quantity + " unit",
    "Mohon konfirmasinya. Terima kasih.",
  ].join("\n");
  return "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(message);
}
