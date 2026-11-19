# Master Destinasi V1

## Canonical model
`places_destinations` remains the only master. Existing IDs/slugs survive edits. The additive migration adds hierarchy, type, geography, aliases, optional metadata, archival state and optimistic versions. No separate public destination pages are introduced.

## Admin and selectors
Admin → Master Data → Destinasi (`/admin/destinations`) supports create/edit/search/status/archive/restore and connected-service inspection. Country defaults to ID; only name is required beyond defaults. New slug is generated automatically. Duplicate identity includes normalized name, city, province, country and parent. Parent cycles and stale updates are rejected server-side.

The shared DestinationSelect searches name, alias and geography, groups by province, supports single/multiple selections, retains retired selected references and refreshes after master changes. Trip supports ordered destinations with an explicit primary; catalog coverage supports multiple destinations. Stay, Experience products and sessions use one primary. Existing address, venue, pickup and itinerary fields remain independent.

Places Free form remains name/destination/WhatsApp. Existing verified/published listings and their contact handoff continue working after a destination is archived. Public Trip/Stay/Experience filters use stable IDs/slugs; unknown filters return no matches. Public directory has no Free/Premium filters.

## Security and audit
API writes require verified Admin membership, same-origin requests, bounded bodies and field allowlists. Database RPCs independently verify Admin membership. RLS protects ordered links and private service audit. Public projection exposes geographical metadata only. New assignments reject inactive/archived destinations; unchanged references remain valid. Archive/deactivation of connected destinations requires explicit confirmation. No cascade deletion or merge action exists.

Master changes are captured by the existing Places audit trigger. Service primary changes and ordered assignments record actor/old/new values in destination_service_audit. Row locks protect assignment versus retirement; optimistic versions protect master edits. Existing booking/payment snapshots and inventory are outside this migration.

## Rollout
1. Review mapping report; only unambiguous exact legacy matches are linked.
2. Verify fresh protected public schema/data/roles recovery and current runtime backup.
3. In isolated migration scope, dry-run exactly 20261119034051_master_destinations_v1.sql. Keep unrelated schedule-lockdown migration held.
4. Apply additive schema before deploying dependent UI. Existing application remains compatible.
5. Commit verified source and Fast Release with Live Bank Transfer unchanged.
6. Verify public pages/API authorization, financial invariants and existing scheduler. No synthetic production bookings or messages.

Rollback application may use previous runtime; additive schema remains. Never blindly revert migration history or delete master records. Auth/Storage are untouched; public DB backup is not advertised as a full-account backup.

## Tests
- Unit selectors/validation, local SQL/RLS smoke: synthetic data only.
- scripts/master-destinations-browser.mjs: authenticated local Admin and responsive UI/API regression.
- scripts/places-contact-browser.mjs: local contact/privacy/idempotency regression.
- Full lint/TypeScript/unit/build and Linux Passenger/Sharp via existing Fast Release.
See release report for actual execution status. Cloud changes/deployment are not implied by this document.
