# Places test report

## Automated checks

- `scripts/places.test.mjs` covers Indonesian number normalization, invalid numbers, WhatsApp URL generation, optional message lines, referral validation, and search normalization.
- `supabase/tests/places_v1_smoke.sql` checks RLS enablement, table/view grants, and verification RPC privileges.
- Existing project tests continue to cover Booking, Payment, Notifications, and Admin Operations.

Run project lint, typecheck, tests, and production build after implementation. The Places SQL smoke test requires a local/staging database with the migration applied.

## Manual checks

Check public directory, detail, partner and verification routes at 320, 375, 390, 430, and 1280px. Confirm the fixed bottom navigation does not cover page content. Test admin listing creation, contact verification/expiry, publication, plan settings, and direct unauthorized table/RPC access in local/staging.

No Cloud migration, production listing, booking, or payment was created for these checks.
