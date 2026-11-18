# SHIAP Service Fee V1

Integrated into the existing booking engine, including guest checkout, nested Experience bookings, idempotency, payment proofs and Finance. No separate booking or payment engine was introduced.

Each category has a disabled toggle, percentage or fixed tariff, and configurable percentage cap. Defaults are disabled/Rp0, a recommended percentage of 2%, and a cap of 10%. The database limits the cap below 100% (maximum 99.99%). It rejects an active percentage exceeding its cap. Fixed fees apply once to the aggregated category subtotal and are clamped to the cap.

Calculation uses integer IDR. Category percentage rounds half-up once. The percentage ceiling rounds down, then is limited to subtotal minus Rp1. Zero or Rp1 subtotals can therefore have zero fee. Preview and booking use the same database function. Public quotes use estimated package subtotals for display only. Actual checkout ignores all submitted fees, recalculates catalog item prices through the existing engine and snapshots the actual category fees in its transaction.

The order stores package subtotal, total fee and a category breakdown containing the applied tariff, cap, requested fee and actual fee. Snapshot values and priced items cannot be changed afterward. Existing orders retain their totals and legacy version. Rate changes affect only new orders. Payment-proof and posted-payment triggers validate the snapshot before accepting payment operations. Customer checkout and payment detail show Harga Paket, Biaya Layanan SHIAP and Total Pembayaran 100%, including transparent explanations when capped.

Admin Settings provides per-category input, enable toggle, maximum percentage, server-calculated fee and total preview. Updates are audited and saved against the loaded version to reject stale Admin changes.

Finance records the fee as a component of the existing full payment, not an additional cash transaction. The reports and CSV separate fee amount, collected fee, refunded fee and recognized platform revenue. Existing completed-and-paid recognition remains. Recognition of the fee is bounded by actual posted payment entries. Unscoped refunds are allocated proportionally between package and fee, using integer rounding. A full refund reverses the full collected fee. Service P&L allocates package revenue to services and platform fee revenue to its own platform row so margin is counted once. Cancellation removes recognized revenue without fabricating a refund.

Forward-only migration: `supabase/migrations/20261118063553_service_fee_management_v1.sql`. Applied only to local Docker Supabase. No Cloud schema or production tariff changes were made. Cloud application and release require approval. All production tariffs remain disabled when the migration is first applied.

Verification: `supabase/tests/service_fee_smoke.sql`, existing Booking V2/Finance/Experience SQL regressions, and `scripts/booking-payment-browser.mjs` test rounding, caps, aggregation, snapshots, access, retry safety, payment amount and refund allocation, plus mobile Admin previews. Fixtures roll back or are removed and local tariff settings are restored. The regular lint, TypeScript, unit tests and production build also apply.
