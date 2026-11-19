# Places Business Ecosystem V1

Baseline: source 3c23733f0f93c6696cc946906bfb3ae3c56bbaa2, release shiap-20261119-164939-80214e2f. Reconstructed historical baseline is not represented as original production source.

M0 confirms existing places_properties, places_property_profiles, places_plan_settings, Master Destinasi, private lead capture and compact V2 search. Premium was incorrectly described as PMS on the old partnership page. Existing Finance transaction entries require a booking_id: subscription income cannot be inserted there using fabricated bookings. Existing Stay engine remains authoritative.

M1 reuses profile drafts and introduces reviewed publication snapshots and property entitlement periods. Existing profiles, IDs, slugs and public contact verification are retained; drafts become private. No automatic entitlement/backfill/trial or billing activation. M2 adds verified memberships/claims and partner editor/kit. M3 adds plan versions, trial eligibility, invoice/payment verification and a separate platform revenue ledger integrated into Finance. M4 adds aggregate marketing analytics and contextual recommendations. M5 reuses Stay records and requires verified operational access and contract scope before any partner writes.

Premium is a property website/marketing service. No commission on direct WhatsApp inquiries; an inquiry is never a booking. Free and Premium share the same contact verification standard. Stay commercial models are separate agreements, not Premium tiers.

Each migration is additive, independently reviewed/tested locally, and selectively applied only after a fresh protected recovery point. No wholesale db push; schedule-lockdown remains held. DNS/custom host routing stays disabled until separately approved and verified. Paid checkout must remain unavailable until ownership, billing, Finance and authorization gates pass. Existing bank and Service Fee settings are never overwritten.
