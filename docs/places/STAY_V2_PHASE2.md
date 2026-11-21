# SHIAP Stay V2 · Phase 2

An accommodation keeps its commercial Places UUID and operational Stay UUID.
The existing verified Places foreign key links the pair. Admin reconciles the
pair with a private note. The database enforces one-to-one mapping. Legacy
properties and booking foreign keys keep their existing identity.

## Reproduce the baseline

Use a new Supabase CLI workdir and Docker project ID plus unused API, DB and
auxiliary ports. Disable the local fixture seed. Do not link the workdir to
Cloud. Start with the exact files from commit
`cde77eb977f27aa7538f82eff2dc7e92805faa71`.

1. Copy versions up to and including `20261118232044`, excluding
   `20261118070001_admin_operations_schedule_write_lockdown.sql`. Also copy
   `20261119100000_places_directory_v1.sql`, keeping the filename and contents.
2. Start the new stack. The Directory migration must create Places before
   Free Listing Management, lead capture and Master Destinasi use the tables.
3. Copy the other production-applied versions into this same staging directory.
   Use local `supabase db push --include-all --skip-vault` from the isolated
   CLI workdir to include the intervening older version numbers. Confirm that
   the target is the new local port and the history matches all 68 versions.
4. Copy only `20261121034416_stay_v2_unified_plans.sql` and use local
   `supabase db push --skip-vault`. Test with synthetic fixtures.

The only change to historical replay is execution order. Migration versions
and source files remain intact. Both independent local replays reached the
production baseline. The audit compared columns, constraints including foreign
keys, RLS and policies for 17 key tables with production metadata.

## Release order and rollback

Review duplicate existing Stay targets read-only before applying the migration.
Resolve any conflicting links through evidence reviewed by Admin. The unique
index fails on conflicts. Deploy the compatible app after the SQL migration
using the usual reviewed release procedure. Keep Premium invoice and trial
availability under the existing Admin controls. No activation is seeded.

If a later release has application issues, restore the previous application
build and use reviewed forward SQL to restore the previous content gate if
needed. Preserve approved mappings, invoices, subscriptions and audit history.
Phase 2 adds marketing entitlements only. Partner banking, commission posting,
booking activation, payment routing, refunds and payouts are separate delivery phases.
