# SHIAP Places V1

Places is a destination-first directory for accommodations whose public contact has been reviewed by SHIAP. It is separate from the existing Stay catalog and booking engine.

## Routes

- `/places`: verified property directory with query-string search and destination selection.
- `/places/[slug]`: public allowlisted property details.
- `/places/partners`: Free, planned Premium PMS, and Stay partnership models.
- `/places/how-we-verify`: verification scope and limitations.
- `/admin/places`: admin-only destination, listing, verification, and plan-price operations.

The three seeded destinations are directory destinations only. No fictional property is seeded. When there are no published verified properties, the directory intentionally shows an empty state.

## WhatsApp

The directory opens the property’s verified business WhatsApp with an editable customer message. SHIAP does not send the message, collect the visitor’s phone number, or record message contents. Click analytics are best-effort, rate-limited, and store only the property ID, generated referral code, and timestamp.

## Product status

Places directory and the verification admin workflow are implemented. Premium room inventory, owner accounts/PMS, subscriptions, booking, and hybrid payments are not implemented and remain disabled. Partner application/contact buttons stay unavailable until SHIAP configures a supported channel.

See [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), [DATABASE.md](./DATABASE.md), [SECURITY.md](./SECURITY.md), [TEST_REPORT.md](./TEST_REPORT.md), and [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
