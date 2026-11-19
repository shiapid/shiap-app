# Ecosystem database

Canonical existing masters remain `places_properties`, `places_destinations`, Stay catalogs and booking/Finance tables. No property/destination master is duplicated and no uncertain location mappings are made.

Additive candidate migrations:
1. `20261119091647_places_ecosystem_foundation_v1.sql`: profile draft/review metadata, approved publication snapshots, property entitlement periods, public visibility gate.
2. `20261119094111_places_partner_platform_v1.sql`: verified property memberships, ownership claims, private audit and normalized media, shared transactional profile writer.
3. `20261119102749_places_premium_billing_v1.sql`: configurable plans, trial eligibility, invoices, private proofs and immutable platform cash entries. Proposed prices unavailable/default billing disabled.
4. `20261119104831_places_billing_notifications_v1.sql`: Places subjects/events appended to the actual deployed notification allowlist; wrappers preserve existing booking scheduling/eligibility and share the same outbox.
5. `20261119105804_places_marketing_analytics_v1.sql`: private marketing events, tenant-authorized aggregate RPC, Admin erasure and 90-day retention using the same scheduler.

6. `20261119111059_stay_partner_agreements_foundation_v1.sql`: separate Stay inquiries, contract/access metadata and guarded aggregate snapshot. No engine mutation.
7. `20261119112717_places_public_projection_hardening_v1.sql`: preserve public projection signatures/filters behind invoker views and private controlled readers; no raw-table public grants.

No row backfills, historical tickets, subscription grants, PAID changes or external email activation. Foreign keys restrict removal of commercial records. RLS and explicit grants apply to every new table/function. Invoice and proof/payment statuses are distinct. Dates are authoritative; scheduled renewals use [start,end) and serialized property locks/overlap validation. A unique introductory trial prevents reuse. Booking hold/expiry durations are unchanged.

Premium income uses `places_platform_cash_entries` and `PLACES_PREMIUM_SUBSCRIPTION`, separate from `finance_transaction_entries` (which requires a real booking). Revenue is displayed on verified cash basis, with immutable refunds and retained service periods; it is not automatic accrual revenue recognition. No partner settlements or new payment gateways are invented.

Apply only the reviewed candidate files from an isolated migration scope after a protected recovery point. Retain genuine applied migration files; do not repair history artificially or include held `20261118070001_admin_operations_schedule_write_lockdown.sql`. `--include-all` is needed because the original Places migration has a later timestamp already applied. Exact dry-run must show only approved files.
