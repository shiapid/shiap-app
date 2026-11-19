# Master Destinasi: mapping before migration

Baseline: live release shiap-20261119-113332-426d58cd, commit c00e5f25d283193893adcd0e72e6ed2b8cc0eb97. Read-only production assessment on 2026-11-19.

Canonical source: public.places_destinations, already referenced by Places properties and leads. No competing destination table exists. Preserve its IDs, slugs and references.

| Service | Legacy location | Records | Exact canonical candidates | Action |
|---|---|---:|---:|---|
| Catalog | Pantai Gedambaan | 10 | 1 | Link nullable destination_id only |
| Catalog | Pantai Risalo | 10 | 1 | Link nullable destination_id only |
| Catalog | Pulau Kerayaan | 10 | 1 | Link nullable destination_id only |
| Catalog | Pantai Teluk Tamiang | 10 | 0 | Retain; Admin review |
| Experience | Kotabaru | 1 | 0 | Retain; Admin review |
| Experience | Lokasi belum ditentukan | 4 | 0 | Retain placeholder; no inference |
| Stay | Kotabaru, Kalimantan Selatan (data dummy) | 2 | 0 | Retain; no inference |
| Trip | Kepulauan Balabalagan | 1 | 0 | Retain; Admin review |
| Trip | Kotabaru | 1 | 0 | Retain; Admin review |
| Trip | Loksado | 1 | 0 | Retain; Admin review |

Thirty exact-match candidates; twenty legacy records remain for review. Actual migration recalculates uniqueness and links only NULL references with a single exact name/canonical-name match. It never rewrites location text, itineraries, venue/session notes, pickup addresses, bookings or payment snapshots. No guessed aliases, merging or new geography seeds.

Existing Places references are already canonical and need no backfill. Sessions are assigned explicitly; location_note is operational venue data and is not automatically interpreted as a destination.
