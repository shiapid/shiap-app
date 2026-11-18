# SHIAP E-Ticket V1

E-Ticket extends the existing Booking & Payment V2 records. It has no parallel booking, payment, or notification engine.

## Customer experience

- After the authoritative Full Payment 100% transition to `paid`, the database issues one voucher per booking service item. Historical paid bookings are not automatically backfilled.
- Vouchers appear in the existing `/my-booking/[id]` detail after the customer or active guest session passes the current booking ownership check.
- The existing `payment_verified` email explains that E-Tickets are available. The existing Admin WhatsApp One-Click template `ticket_ready` contains only the protected booking-detail URL and no QR credential.
- `/api/bookings/[id]/tickets/pdf` creates a private, A4 portrait PDF on the server. Multi-service orders produce multiple ticket pages. `Cache-Control: private, no-store` and the existing owner check protect each download.

## QR and check-in

- QR contains only `SHIAP1:<random UUID>`; it contains no name, booking code, phone, email, service, or schedule.
- Credentials are stored in the RLS-protected `booking_tickets` table, which grants no access to anonymous or authenticated browser roles. The server returns them only after the booking owner check and verified payment.
- Staff use the Admin-only `/admin/tickets/check-in` camera scanner or paste a QR payload. Its API requires the existing `requireAdmin`, same-origin POST, and rate limit. A database row lock and conditional status update prevent duplicate attendance.
- A revoked, unpaid, cancelled, expired, or rejected ticket cannot be checked in. A repeated scan reports that attendance was already recorded.

## SHIAP business contact settings

Configure these in **Admin → Pengaturan → SHIAP Business Contact Settings** before release:

- Customer Service WhatsApp
- Customer Service email
- Contact display name
- Official HTTPS website
- Official Instagram (optional)

The existing official website and booking application are shown. No support number or support email is fabricated; `notifications@shiap.id` is not assumed to be Customer Service. The Admin form shows a release warning until WhatsApp and email exist. Existing paid transactions remain accessible if these details have not yet been configured; the ticket displays “Belum dikonfigurasi Admin” for missing contacts.

## Release and verification

- Migration: `20261118085558_shiap_eticket_v1.sql` (local only; not applied to Supabase Cloud).
- PDF uses the official supplied SHIAP logo already verified byte-for-byte against `public/logo/shiap-logo.png`, and embeds the bundled Geist font. The logo aspect ratio is preserved.
- Required server environment variables: none.
- Generate synthetic QA material only with `npm run sample:eticket`. It creates `output/pdf/SHIAP-E-TICKET-SAMPLE-SYNTHETIC.pdf`, labels each page as non-valid synthetic QA, and uses random non-production QR tokens. It creates no booking or database record.
- Production release is not approved until the migration is reviewed/applied by an authorized release, Customer Service WhatsApp and email are configured, and the generated PDF is visually reviewed.
