# Ecosystem release checklist

- Verify actual current release/commit still matches the branch baseline; preserve later production changes.
- Clean isolated release worktree and reviewed commits/tags; no .env, secret, backup, ZIP, browser session or customer export committed/packaged.
- TypeScript, lint, units, core SQL/RLS, authenticated Admin/partner/customer tests, responsive seven widths, production build and Linux Node24 Passenger/Sharp smoke pass.
- Obtain fresh protected schema/data/roles recovery, assess auth/storage metadata and existing object coverage; verify readable integrity/checksums and restore/forward-recovery path.
- Verify Cloud project sbomjhwmjmqteybsegdl, genuine migration history, pending list and exact selective dry-run. Exclude held schedule-lockdown and unrelated development migrations.
- M1/M2 are additive. M3 changes notification scheduling wrappers but keeps existing booking behavior. Apply reviewed notification schema before deploying code that reads new subject columns. New email types are absent from enabled email_events, so old application will not dispatch them during the short rollout window.
- Do not create historical subscriptions/trials/invoices/events. Billing, trial eligibility and new email events stay disabled until deliberately reviewed/configured by Admin.
- Preserve current bank, Live Bank Transfer, Full Payment 100%, Service Fee settings, SMTP/cron and existing data. No real paid test orders or test customer emails.
- Run established Fast Release from committed isolated source with `-FastRelease -Deploy -EnableLivePayments`; allowlist only the genuinely held pending migration after scoped new migrations apply.
- Verify runtime backup, ZIP checksum, atomic switch and rollback. Record actual release ID, Git commit/tag, migration versions, recovery location and three scheduled ticks.
- Public verify Free compact directory/search/contact/privacy, guarded partner/Admin routes, booking API and notification transport. Authenticated production writes require actual authorized account and nonfinancial controlled data; never claim UI E2E if only redirects were checked.
- Roll back application only after compatibility assessment. Leave additive schema/history in place; never blindly reverse financial migrations or delete historical records. Paid flags must remain disabled until compatibility and authorization are verified.
- Custom subdomain/DNS activation remains outside this release until separately approved and infrastructure-verified. Independent PMS/direct-property payments/field management are not made active by these migrations.
