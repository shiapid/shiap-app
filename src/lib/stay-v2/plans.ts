export const stayV2CommercialTerms = {
  freeIdr: 0, premiumMonthlyIdr: 199_000, premiumYearlyIdr: 1_950_000,
  trialDays: 14, partnerSubscriptionIdr: 0, partnerCommissionBps: 1_500,
} as const;

const free = [
  "directory", "basicInformation", "verifiedBadge", "officialWhatsApp", "destination",
  "ownershipClaim", "basicProfileEditing", "whatsAppInquiry", "ownerDashboard",
  "ownerVerification", "standardSupport",
] as const;
const premiumMarketing = [
  "description", "photos", "videos", "amenities", "map", "policies", "startingPrice",
  "microsite", "socialLinks", "seo", "promotions", "relatedExperiences", "visitAnalytics",
  "leadAnalytics", "billing",
] as const;
export const stayV2PlanFeatures = {
  FREE: free,
  PREMIUM: [...free, ...premiumMarketing, "trial"],
  PARTNER: [...free, ...premiumMarketing, "digitalKitWithQr", "featuredListing",
    "subdomain", "customDomain", "vouchers", "partnerBadge", "booking", "requestToBook",
    "instantBooking", "unifiedCheckout", "bookingManagement", "guestRecords",
    "paymentVerification", "shiapPaymentCollection", "bookingReminders", "cancellations",
    "bookingInvoices", "roomTypes", "physicalUnits", "availabilityCalendar", "weekdayWeekendPricing",
    "specialDatePricing", "inventoryBlocks", "capacity", "propertyAddons", "checkInOut",
    "conversionAnalytics", "bookingAndCommissionReports", "occupancy", "earningsAndBalances",
    "withdrawals", "payoutHistory", "agreement", "prioritySupport", "contentSetup", "whatsAppTemplates"],
} as const;

export type StayV2Access = {
  property_id: string;
  commercial_plan: keyof typeof stayV2PlanFeatures;
  premium_content: boolean;
  partner_status: "NONE" | "IN_REVIEW" | "MARKETING_ACTIVE" | "INACTIVE";
  owner_verified: boolean;
  contact_verified: boolean;
};

export function stayV2OwnerMenu(accesses: StayV2Access[], isOwner: boolean) {
  return [
    { href: "/partner", label: "Ringkasan" },
    { href: "/partner/places", label: "Properti Saya" },
    { href: "/partner/claims", label: "Verifikasi & Klaim" },
    ...(isOwner ? [
      { href: "/partner/subscription", label: "Paket & Langganan" },
      { href: "/partner/billing", label: "Riwayat Invoice" },
    ] : []),
    ...(accesses.some(access => access.premium_content) ? [{ href: "/partner/analytics", label: "Analitik" }] : []),
    ...(isOwner || accesses.some(access => access.partner_status !== "NONE")
      ? [{ href: "/partner/stay", label: "Kemitraan Stay" }] : []),
  ];
}
