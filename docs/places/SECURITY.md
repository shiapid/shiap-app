# Places security notes

- Public rendering uses Supabase’s publishable-key server client and only the Places public views.
- Base property records, verification evidence, audits, plan writes, and click events have RLS. Admin table policies use the existing `is_shiap_admin()` guard.
- Admin pages call the existing `requireAdmin()` server guard. Client writes remain constrained by database grants and admin RLS.
- Contact verification is recorded through `admin_record_places_contact_verification`; it verifies `auth.uid()` against `admin_users`, updates the public verification timestamp/expiry, and records private evidence atomically.
- Public view columns exclude admin identity, evidence notes/path, audit data, and demo markers. `stay_slug` is returned only for an explicitly recorded mapping to a published Stay property.
- WhatsApp click tracking validates same-origin requests, applies the existing HMAC-backed booking rate limiter, validates IDs/referrals, rechecks public listing eligibility, and uses a server-only service-role client. No raw IP or customer phone is persisted.
- No new Storage bucket or public upload path is added. Evidence file paths remain private metadata; upload/access controls are a later task.
- Premium stays disabled. No owner tenant access, payment provider, subscription charge, inventory, or booking operation is enabled.
