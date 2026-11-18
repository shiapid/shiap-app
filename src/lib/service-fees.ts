export type FeeCategory = "trip" | "stay" | "activity" | "rental" | "documentation" | "other";
export type FeeLine = {
  category: FeeCategory; subtotal: number; enabled: boolean; mode: "percentage" | "fixed";
  percentage_bps: number; fixed_amount: number; max_percentage_bps: number;
  requested_fee: number; ceiling: number; fee: number; total: number; capped: boolean;
};
export type FeeQuote = { subtotal: number; fee: number; total: number; lines: FeeLine[] };
export type FeeSetting = {
  category: FeeCategory; enabled: boolean; mode: "percentage" | "fixed";
  percentage_bps: number; fixed_amount: number; max_percentage_bps: number; version: number;
};
export const feeLabels: Record<FeeCategory, string> = {
  trip: "Trip", stay: "Stay / Villa", activity: "Experience / Wahana", rental: "Rental", documentation: "Shinema", other: "Lainnya",
};
