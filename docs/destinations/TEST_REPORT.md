# Master Destinasi V1 — validation record

Baseline: c00e5f25d283193893adcd0e72e6ed2b8cc0eb97 (Places Compact + Leads, production release shiap-20261119-113332-426d58cd).

Local verification on 2026-11-19:
- TypeScript PASS; full ESLint PASS (one existing youtube img warning).
- All 34 unit tests PASS.
- SQL/RLS smoke PASS, transaction rolled back; synthetic Admin and non-Admin roles.
- Production build PASS against isolated local Supabase.
- Authenticated Admin browser create/edit/search PASS; layouts 320/375/390/430/1280 without page overflow.
- Duplicate rejection, parent-cycle rejection, stale version 409, stable slug, archive confirmation, restore/activation PASS.
- Trip ordered primary/secondary assignment and reordering PASS.
- Stay primary; Wahana/Activity, Rental coverage, Shinema catalog; Experience product/session assignments persist through authenticated application APIs.
- Public Trip/Stay/Experience destination filters PASS using synthetic local records.
- Existing location text, prices, itinerary, meeting point, address and session venue preserved.
- Retired destinations reject new assignment; existing Places visibility/contact remain functional.
- Places lead browser regression PASS at all five widths: popup only after click, close creates no lead, failure fallback, actual server save, intercepted WhatsApp handoff, concurrent retry idempotency, Admin followup/erasure, anonymous denial. No WhatsApp messages sent.

Resolved defects:
1. Browser article selector counted the Admin shell, not just destination rows. Scoped selectors and keyboard input now exercise actual form behavior.
2. Local production HTTP tests require the existing CI environment mode; production retains HTTPS/secure-cookie checks.
3. Business-version conflict SQLSTATE 40001 caused PostgREST retry loops. Replaced with PT409 and verified immediate application HTTP409. See https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b.
4. WhatsApp harness now captures the numbered navigation rather than a later favicon request.

Release boundary:
- All services retain legacy operational location fields intentionally; destination_id supplements them rather than replacing addresses/venues.
- Explore retains its existing legacy-location aggregation; canonical filters are added to Places/Trip/Stay/Experience. No unsupported Rental pickup/geographical inference.
- Public catalogue detail routes and historical booking/payment snapshots are untouched.
- No production authenticated UI mutation has been used for testing.
- Reviewed migration scope: 20261119034051_master_destinations_v1.sql only. Schedule-lockdown 20261118070001 remains held.
- Cloud migration/deployment and Linux smoke results are recorded separately by Fast Release; this local record does not imply deployment.
