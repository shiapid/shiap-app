# Admin Operations V1 release snapshot

## Provenance

- Production release identifier: `shiap-20261118-155121-573d1666`.
- The identifier is not a Git commit found in fetched refs, tags, reflogs, or recoverable Git objects.
- Production source commit: unavailable.
- Reconstructed baseline tree: `9ec35f40c0524623f215f3fafd77321e8fdbdc69`.
- That tree contains the production release ZIP with the same SHA-1 Git blob as the local artifact (`19b9d5bf6ba60af105253df4f09a4f7d41288a79`). The ZIP contains compiled standalone output, so this is a correlated reconstruction baseline, not proof of the original TypeScript source commit.
- Reconstructed baseline commit: `32052bf66e86e34794a9aabc9dc262941234a5e8`.

## Release contents

Phase 1 application release contains the Admin Operations schedule editor, server-side schedule routes and guards, booking archive/trash/bulk actions, restore behavior, public schedule mapping, the schedule-change notification context, the Admin Operations test, and migration `20261118070000_admin_operations_upgrade_v1.sql`.

Phase 2 is isolated in `release-artifacts/admin-operations-phase2/20261118070001_admin_operations_schedule_write_lockdown.sql`. It must be applied only after the phase 1 application is deployed and its server-backed schedule editor/API has been verified. It is deliberately outside `supabase/migrations` in this release snapshot, so a phase-1 migration preview cannot accidentally select it.

E-Ticket is excluded: no E-Ticket source or migration is present. In particular, `20261118085558_shiap_eticket_v1.sql` is not included.

## Production ordering (not executed)

1. From this isolated snapshot, preview and apply only `20261118070000_admin_operations_upgrade_v1.sql` against project `sbomjhwmjmqteybsegdl`, using a selective CLI workflow and verifying the proposed migration list before applying.
2. Deploy the phase-1 application commit. Confirm the new admin schedule API and Booking Center, then smoke-check public Trip availability, Booking API, Live Bank Transfer, Notifications/Cron, and Finance.
3. Only after those checks, apply `20261118070001_admin_operations_schedule_write_lockdown.sql` as a separate selective migration. Recheck admin API authorization and RLS/direct-write rejection.
4. Leave E-Ticket and all other unrelated migrations pending.

No production migration or deployment is part of preparing this snapshot.

## Preservation

The original mixed worktree was preserved separately under `tmp/adminops-protection-64554fd1a520465985e6912ba75cc989`, including a verified Git refs bundle, staged and unstaged patches, copies of non-ignored untracked files, and a SHA-256 manifest. The isolated worktree is derived from the reconstruction baseline and does not require cleaning, resetting, or stashing the original checkout.
