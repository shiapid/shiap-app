# Places Compact Responsive UI V2

Baseline: production shiap-20261119-130925-891d0e34, source b37bfdff40fc55c7cf7a69365d84023805f7cc0d.
Branch: release/shiap-places-responsive-v2.

Scope:
- Remove only the Places link from the shared top header; retain official logo, tagline and existing profile/avatar behavior.
- Compact Places title/subtitle and remove the large search-card wrapper and redundant directory eyebrow.
- Shared two-column mobile search row, 44px controls, accessible labels and bounded widths. The third desktop search button appears at 768px.
- Mobile changes debounce 300ms and replace the current URL entry; explicit desktop/Enter submission pushes a history entry. Preserve unrelated URL parameters, combine query/destination, reset pagination and restore controls on browser Back.
- Master Destinasi data source, property rows, Premium-compatible row presentation, contact dialog, privacy notice, lead API, referral handling, WhatsApp templates, booking and payments are unchanged.
- No dependencies, database schema, migrations or financial logic changed.

Validation:
- TypeScript PASS.
- Full lint PASS; one pre-existing img warning in youtube-tour-embed.tsx.
- All 35 unit tests PASS, including filter URL encoding/combination and pagination reset.
- Local production build PASS.
- Local browser at 320/375/390/430/768/1024/1280 PASS: aligned controls, hidden mobile submit, intact logo/profile, no header Places link, first property row above 320px, no horizontal overflow, contact open/close without lead.
- Mobile auto-search and combined destination, long destination text, desktop explicit submit, preserved query parameters and browser Back PASS.
- Synthetic local lead persistence, intercepted WhatsApp handoff, error fallback, concurrent retry idempotency, Admin followup/erasure and anonymous access rejection PASS. No real customer lead or WhatsApp message used for testing.
- Fast Release performs the final Linux Node24/Passenger/Sharp and production health gates before activation. Deployment results are stored in the private release record.

Rollback uses the existing atomic runtime pointer/backup. No database rollback is required for this UI-only change. The unrelated pending schedule-lockdown migration remains held.
