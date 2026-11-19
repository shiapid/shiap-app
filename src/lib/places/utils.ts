import { DEFAULT_PLACES_WHATSAPP_TEMPLATE, renderPlacesWhatsAppTemplate } from "./whatsapp-template.ts";
export type WhatsAppMessageOptions = {
  template?: string;
  phone: string;
  propertyName: string;
  refCode: string;
  checkIn?: string | null;
  guests?: number | null;
};

const refPattern = /^SHP-[A-HJ-NP-Z2-9]{5}$/;

export function normalizeIdPhone(input: string): string | null {
  const value = input.trim();
  if (!value || !/^[+\d\s().-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!/^62[0-9]{8,13}$/.test(digits)) return null;
  return digits;
}

export function normalizePlacesSearch(input: string): string {
  return input.normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function buildWhatsAppUrl({ phone, propertyName, refCode, checkIn, guests, template = DEFAULT_PLACES_WHATSAPP_TEMPLATE }: WhatsAppMessageOptions): string | null {
  const normalizedPhone = normalizeIdPhone(phone);
  const name = propertyName.trim();
  if (!normalizedPhone || !name || !refPattern.test(refCode)) return null;

  const optionalLines = [
    checkIn?.trim() ? `Tanggal check-in: ${checkIn.trim()}` : null,
    Number.isInteger(guests) && Number(guests) > 0 ? `Jumlah tamu: ${guests}` : null,
  ].filter((line): line is string => Boolean(line));
  const message = [renderPlacesWhatsAppTemplate(template, name, refCode), ...optionalLines].join("\n");
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
