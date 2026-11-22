# Stay V2 production validation

Validated on 22 November 2026 (Asia/Makassar).

## Release record

- Active release `shiap-stayv2-a344812`.
- Source `a3448127db799f32d868b92dea8003c59572f505`.
- Candidate SHA-256 `678ab5fcd73e27d93439912b19013face858e86f12a00f3e21168ba60925cd61`.
- Schema-compatible rollback `shiap-stayv2-rollback-e88da4c`, source `e88da4c9c3fe7c433044cd1bcfcf96b5036f9be8`.
- Rollback SHA-256 `48f339a642a1f7e9064206c6f7f8005feade764c294cd270476093e0b2a7dd9e`.
- Supabase project `sbomjhwmjmqteybsegdl`. The release applied 26 Stay V2 migrations. Schedule lockdown remains pending.

## Recovery

Database/Auth and Storage backup resides at `D:/shiap/shiap-app/tmp/private-prod-a344812-final`. Files remain private and are excluded from source control.
Runtime/configuration backup and `rollback-compatible.sh` reside at `/home/shiapsit/shiap-app-backups/stayv2-final-a344812`.
Application rollback uses the schema-compatible target and retains the migrated database.

## Verification boundaries

The production symlink was checked over SSH. The latest 120 application log lines contained zero uncaught, unhandled, missing-module or error markers. Database integrity was inspected through a read-only Supabase CLI query. Public routes and protected Admin redirects were checked over HTTPS.

Authenticated Finance form logic, evidence upload, duplicate prevention and idempotent retries passed using legitimate local QA authentication for both candidate and rollback. No synthetic financial transactions were made in production.

Production Admin browser testing is incomplete. Both available browser-control runtimes failed to initialize with a trusted Node process error. Login redirects establish route protection but do not establish authenticated Admin functionality. Full Admin Booking, Finance, Stay/PMS, Places and mixed checkout browser workflows require an available authorized browser session.

Wallet read access and payout UI remain disabled on the server. Database payout switch remains disabled and no payout operators are registered. No migrations or business data mutations were performed during this post-deployment validation.

## Backlog

- Restore the browser automation runtime and verify authenticated Admin read screens and cross-service navigation.
- Verify customer Unified Checkout presentation through the browser without submitting a production order.
- Perform authenticated Admin mobile and desktop accessibility/responsive checks.
- Historical Wallet opening balances need Finance reconciliation before read access is enabled.
- Longer-term error and reconciliation monitoring remains operational follow-up.
- Existing ESLint image optimization warning remains in the YouTube tour component.

These verification gaps prevent a claim of complete browser E2E acceptance. The deployed release is retained while the browser runtime is unavailable.

## Read-only results

Public homepage, login, Places, partner information, Stay, Trip, Experience, Rental, Shinema, Explore, booking entry and Booking API returned HTTP 200. Admin Booking, Stay, Stay Operations, Places and Finance redirected unauthenticated requests with HTTP 307.

Database results were 94 migration records including the 26 Stay V2 migrations, 9 bookings, 2 Auth users and 38 Storage objects. There were zero duplicate bank allocations, zero unbalanced item journals and zero disabled payment/order guard triggers. All three inspected Finance/order triggers were present. Payout was disabled, payout operators and withdrawals were zero, and schedule lockdown was absent.
