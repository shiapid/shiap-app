# SHIAP Places Business Ecosystem

Free Places is a compact destination-first contact directory. Premium is a reviewed property website and marketing product, not a PMS. Stay by SHIAP is a separate booking/operations agreement. Paid status does not buy a stronger verification badge. Inquiry WhatsApp has no SHIAP booking commission and is never a confirmed reservation.

The existing Free directory, three-field Admin form, Master Destinasi, on-demand contact popup, private lead persistence and WhatsApp reference are preserved. Sending the form collects name/WhatsApp privately for that inquiry; closing the dialog creates no lead. Partners do not automatically receive raw leads.

## Routes
- Public: `/places`, `/places/[slug]`, `/places/partners`, `/places/how-we-verify`, `/places/privacy`.
- Admin: `/admin/places`, `/admin/places/premium`, `/admin/places/claims`, `/admin/places/billing`, `/admin/places/analytics`, `/admin/places/leads`, `/admin/places/settings`.
- Partner: `/partner`, `/partner/claims`, `/partner/places`, `/partner/places/[id]`, private preview, `/partner/subscription`, `/partner/billing`, `/partner/billing/[id]`, `/partner/analytics`.

## Commercial gates
Billing and trials default disabled. Seed prices are proposed; an Admin must review and enable plans before offering them. No automatic charge or conversion. Trial is one per eligible property, after verified ownership and approved content. Uploaded proof is pending, never paid. Full bank funds require explicit Admin verification. Renewals allocate nonoverlapping future periods. Expiration returns the website to Free and preserves private content. Cancellation does not refund automatically. Finance records subscription cash separately from booking gross and Service Fees.

## Media and Digital Kit
Partner media is validated from actual bytes, normalized to WebP and stored privately. Only approved, entitled media may be served publicly; drafts require current membership. Kit QR contains a public canonical property URL, no access credential. PDF uses official SHIAP assets and embedded font. Custom subdomains are not activated; canonical fallback is `https://app.shiap.id/places/[slug]`.

## Verification and release
See [ECOSYSTEM_PLAN.md](./ECOSYSTEM_PLAN.md), [ECOSYSTEM_TEST_REPORT.md](./ECOSYSTEM_TEST_REPORT.md), [DATABASE.md](./DATABASE.md), [SECURITY.md](./SECURITY.md), and [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md). Candidate code is not LIVE until the release record confirms deployment. Existing Stay booking engine and payment routing remain unchanged; standalone PMS/field management must not be advertised as active before operational readiness is proven.
