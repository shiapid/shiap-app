export type BookingServiceType =
  | "trip"
  | "stay"
  | "rental"
  | "activity"
  | "documentation"
  | "other";

export type BookingPriceStatus = "unquoted" | "quoted" | "confirmed";

export type StayNight = { night: string; rate: number; rate_kind: "weekday" | "weekend" | "special" };
export type StayRateSnapshot = { subtotal: number; nights: StayNight[]; extras?: number; addonSubtotal?: number };

export type BookingItem = {
  id: string;
  serviceType: BookingServiceType;
  serviceName: string;
  serviceCatalogId?: string;
  priceBasis?: "per_person" | "per_unit";
  priceUnitLabel?: string;
  selectedAddons?: { id: string; name: string; price: number }[];
  bundleRequires?: "none" | "trip_or_activity" | "snorkeling";
  variant?: string;
  dateStart: string;
  dateEnd?: string;
  quantity: number;
  guests: number;
  unitPrice?: number;
  stayRate?: StayRateSnapshot;
  partnerStay?: boolean;
  priceStatus: BookingPriceStatus;
  notes?: string;
  tripId?: string;
  departureId?: string;
  propertyId?: string;
  roomTypeId?: string;
  addedAt: string;
};

export type BookingCustomer = {
  name: string;
  whatsapp: string;
  email?: string;
  notes?: string;
};

export const BOOKING_STORAGE_KEY = "shiap_universal_booking_v1";

export const serviceLabels: Record<BookingServiceType, string> = {
  trip: "Trip",
  stay: "Stay / Villa",
  rental: "Rental",
  activity: "Wahana / Activities",
  documentation: "Dokumentasi / Shinema",
  other: "Layanan lainnya",
};

export function formatRupiah(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Menunggu penawaran";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
