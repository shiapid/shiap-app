# Places release checklist

- [ ] Review migration `20261119100000_places_directory_v1.sql` and dependency ordering against Cloud history.
- [ ] Apply only to local/staging first; run `places_v1_smoke.sql` and existing RLS/Stay regression checks.
- [ ] Confirm the target Supabase project explicitly; production was not queried or migrated for Places.
- [ ] Verify admin contact verification, expiry, publication gating, audit visibility, and plan settings with an authorized staging admin.
- [ ] Verify no demo property appears publicly and no invented price, rating, or availability is shown.
- [ ] Check directory/search/detail/partner routes at 320/375/390/430/1280px.
- [ ] Confirm official Stay booking, checkout, inventory, and payment routes remain unchanged.
- [ ] Configure an approved partner enquiry channel before enabling application/contact CTA buttons.
- [ ] Keep Premium, booking, and hybrid payments disabled until those systems and commercial approvals exist.
- [ ] Deploy only after explicit production approval and a reviewed isolated release.
