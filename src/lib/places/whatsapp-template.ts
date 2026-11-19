export const DEFAULT_PLACES_WHATSAPP_TEMPLATE = `Halo Kak 👋

Saya tertarik dengan *{nama_properti}* yang saya temukan melalui SHIAP Places.

Boleh minta informasi harga dan ketersediaan penginapannya?

Terima kasih! 😊

*Ref. SHIAP:* {kode_referensi}`;

export function validPlacesWhatsAppTemplate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2000
    && value.includes("{nama_properti}") && value.includes("{kode_referensi}")
    && !/[{}]/.test(value.replace(/\{(?:nama_properti|kode_referensi)\}/g, ""));
}

export function renderPlacesWhatsAppTemplate(template: string, name: string, reference: string) {
  const source = validPlacesWhatsAppTemplate(template) ? template : DEFAULT_PLACES_WHATSAPP_TEMPLATE;
  return source.replace(/\{(nama_properti|kode_referensi)\}/g, (_, key: string) => key === "nama_properti" ? name : reference);
}
