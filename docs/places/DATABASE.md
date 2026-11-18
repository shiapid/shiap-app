# Places database foundation

Migration: `20261119100000_places_directory_v1.sql` (forward-only, additive).

## Tables

- `places_destinations`: canonical Indonesian destination identifiers and aliases. The migration inserts only Teluk Tamiang, Pulau Kerayaan, and Pantai Gedambaan as destinations.
- `places_properties`: public business contact, type, publication state, demo exclusion, verification expiry, and explicit optional Stay mapping.
- `places_property_profiles`: optional public profile fields, room summaries, facilities, policies, and integer IDR starting price.
- `places_property_verifications`: admin-only verification method, notes, private evidence path, verifier, and expiry.
- `places_admin_audit_logs`: admin-only record of property/profile/plan and destination writes.
- `places_plan_settings`: configurable pilot price/status/unit limit; Premium defaults to disabled and price status defaults to proposed.
- `places_wa_click_events`: property, opaque referral code, and timestamp only; no visitor phone, IP address, or message contents.

## Public projections

`places_public_destinations_v`, `places_public_directory_v`, and `places_public_plan_v` are explicit column allowlists. The directory projection filters out demo, unpublished, unverified, and expired-contact rows. Public roles receive view access but no direct select on private/admin tables. No Stay table, booking RPC, inventory trigger, or payment table is changed.

Run `supabase/tests/places_v1_smoke.sql` after applying the migration in local/staging. The test checks RLS flags, public allowlist grants, private-table denial, and verification RPC grants.

Do not apply the migration to Supabase Cloud as part of this implementation task.
