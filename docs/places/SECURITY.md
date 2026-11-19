# Ecosystem security

Authorization uses verified Supabase Auth identity and database-backed Admin/membership records, never user-editable user_metadata or matching telephone/name. Ownership claims grant no access until Admin records actual authority verification. Content writers are OWNER/MANAGER; STAFF reads approved tenant drafts only. Billing is OWNER-only. Revocation is checked again in transactional writers. Critical contact/ownership changes remain Admin-verification operations.

Public projection views expose explicit approved fields. Drafts, claims, proofs, invoices, audit notes and raw marketing events are private. Subscription periods and contact publication eligibility gate websites/media on every request. Expired content stays private. Service credentials stay server-only. Mutations require same-origin, bounded input, server validation, rate limits and database authorization. Public users have no table-write grants.

Private buckets deny all direct anon/authenticated access with bucket-specific restrictive policies. Server validates actual bytes, file size, static image format and pixel limits. No upsert overwrites. Idempotent upload retries compare digests and recheck ownership before registration. Published media cannot be deleted while referenced. Proof endpoints require invoice ownership or Admin; proof never activates a subscription by itself. No proof URL appears in notification email.

Cash entries are immutable. Full verified funds, unique bank reference and idempotency request are required for activation. Refund totals cannot exceed received funds. No fabricated accommodation bookings and no duplicate commission/margin. Existing booking financial totals and Service Fee settings are untouched.

Analytics exposes aggregate counts only. No raw contact/IP/referrer URL is stored in marketing events. Browser-tab IDs are randomized, daily and property-scoped HMACs; they are not unique-person claims. DNT/GPC is respected. Raw events expire after 90 days through the existing authenticated scheduler. Admin erasure is audited and does not delete leads or Finance. Contact erasure remains in the existing Admin lead module.

Premium notifications share the booking outbox/lease/retry/uncertain-SMTP safeguards. New email event types remain opt-in. Recipient/current owner and authoritative state are rechecked before dispatch; stale events and superseded reminders are skipped. No historical notification backfill. No second cron, no in-memory Passenger scheduler, no DNS/TLS weakening.
