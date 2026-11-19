# Ecosystem milestone verification

## M0
Verified production source 3c23733f0f93c6696cc946906bfb3ae3c56bbaa2 / shiap-20261119-164939-80214e2f. Canonical places_destinations retained. Three existing properties/profiles in Cloud; no Cloud changes for this milestone yet. Existing schedule-lockdown migration 20261118070001 remains held. No DNS changes authorized/performed.

## M1 foundation
Implemented product distinction, dynamic proposed monthly/yearly prices, actual configured business contact CTAs, separate Premium editor and Admin review, private preview, real-data website and entitlement-based downgrade. Premium enrollment/payment remains unavailable; no incomplete paid product is advertised as active.

Migration: 20261119091647_places_ecosystem_foundation_v1.sql. Additive; preserves existing profile rows, property IDs, URLs and destination references. Existing profile content becomes a private draft; only reviewed snapshots with a valid entitlement may be public. No trial/subscription backfill or financial transactions. Old directory view retains column signature and Free contact visibility. New publication view uses security_invoker and explicit allowlist. No subscription client-write grant.

Local results: SQL/RLS PASS; anonymous/non-Admin cannot read drafts or write entitlements; approved active publication visible, expired publication hidden; draft retained; stale writes return PT409. TypeScript PASS; lint PASS (existing img warning); 36 unit tests PASS. Production build PASS. Authenticated Admin E2E PASS: browser save/review, API authorization, stale conflict, public entitlement gate and expiry downgrade. Admin editor and Premium website responsive PASS at 320/375/390/430/768/1024/1280. Fixtures synthetic and local only; no messages/payments sent. Free compact search/contact/lead regression PASS at all seven widths, including persistence/idempotency/WhatsApp handoff and Admin privacy erasure. Final Linux/Passenger smoke runs on the integrated release before production.

Rollback: existing application remains schema-compatible; additive schema stays in place if application rolls back. Never delete profile/history rows or reverse migrations blindly. Production mutation requires fresh protected backup and exact selective dry-run first.

## Remaining milestones
M2 ownership verification, partner portal, tenant permissions, media and Digital Kit not yet implemented. M3 real trial/billing/payment verification/Finance not yet implemented; no activation endpoint exists in M1. M4 marketing analytics and SEO/cross-selling pending. M5 operational Stay gap review/integration pending; existing Stay engine unchanged. Custom subdomains remain blocked pending infrastructure verification and explicit DNS authorization.
