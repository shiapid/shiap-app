export type BookingServiceType =
  | "trip"
  | "stay"
  | "activity"
  | "documentation"
  | "other";

export type BookingPriceStatus = "unquoted" | "quoted" | "confirmed";

export type BookingItem = {
  id: string;
  serviceType: BookingServiceType;
  serviceName: string;
  variant?: string;
  dateStart: string;
  dateEnd?: string;
  quantity: number;
  guests: number;
  unitPrice?: number;
  priceStatus: BookingPriceStatus;
  notes?: string;
  addedAt: string;
};

export type BookingCustomer = {
  name: string;
  whatsapp: string;
  email?: string;
  notes?: string;
};

export type BookingDraft = {
  id: string;
  createdAt: string;
  status: "draft";
  customer: BookingCustomer;
  items: BookingItem[];
};

export const BOOKING_STORAGE_KEY = "shiap_universal_booking_v1";
export const BOOKING_DRAFTS_KEY = "shiap_universal_booking_drafts_v1";

export const serviceLabels: Record<BookingServiceType, string> = {
  trip: "Trip",
  stay: "Stay / Villa",
  activity: "Wahana / Activities",
  documentation: "Dokumentasi / Shinema",
  other: "Layanan lainnya",
};

export function createBookingId() {
  return `SH-${Date.now().toString(36).toUpperCase()}`;
}

export function formatRupiah(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Menunggu penawaran";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
