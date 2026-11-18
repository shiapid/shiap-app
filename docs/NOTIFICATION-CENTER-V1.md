# SHIAP Notification Center V1

## Release state

Implemented locally alongside Service Fee V1, using the existing Booking V2 records, authorization and Finance ledger. No Cloud migrations, production deployment, cron installation, payment changes or email activation were performed. Email defaults disabled. In-app admin events and manual WhatsApp templates default enabled.

The read-only production probe found all eight SMTP environment variables present and the host, port, TLS, username and sender matching the operator-supplied configuration. Nodemailer verification failed with `ETIMEDOUT`, command `CONN`, before authentication. No test email was sent. Public DNS for `mail.shiap.id` returned Cloudflare proxy addresses `104.21.17.216`, `172.67.178.86` and Cloudflare IPv6 addresses. Mail must use DNS-only records pointing to the actual cPanel mail origin. Do not guess the origin IP, change `app.shiap.id`, disable certificate validation or replace credentials.

SPF, DKIM at `default._domainkey.shiap.id`, and DMARC are published. DMARC policy is `none`. Publication does not prove SPF authorization, DKIM signing or DMARC alignment for an actual email. After the DNS fix, inspect `Authentication-Results` on the test email. No DNS changes were made.

## Architecture

`notification_events` records authoritative database changes. AFTER triggers insert events and channel deliveries in the same transaction as the booking or payment change. A dispatcher in a separate HTTP request can only see committed records. Email is never sent by a trigger, checkout request, browser timer or Passenger background timer. Failed dispatch changes only notification state.

Events cover booking creation, proof receipt, verified full payment, rejected proof, cancellation, expiry, Experience approval, payment reminders, travel reminders, today's operations and terminal delivery failures. Event deduplication keys and unique per-event/channel/audience delivery rows prevent duplicates on checkout/proof retries. Full-payment events require the existing posted payment with the full amount and a bank reference. A screenshot never emits a payment-verified event.

The scheduler rechecks the existing deadline, active booking state, payment eligibility, proof state and notification settings. Payment reminders default to five minutes before expiry, once per booking, with a configurable 1–10 minute lead. They stop after proof submission, payment, cancellation or deadline expiry. They do not extend holds or restore capacity.

Travel reminders use the actual Experience session timestamp where available. Date-only products receive an H-1 reminder without inventing departure times. Only confirmed, paid orders receive customer travel reminders. Existing meeting points, locations and check-in information are included when recorded.

Jobs use `FOR UPDATE SKIP LOCKED`, a 90-second lease, a maximum of three claims per request, five attempts, exponential backoff and a bounded retry window. Definite temporary SMTP rejection or pre-delivery connection failure can retry. SMTP has no durable idempotency guarantee: a persisted dispatch-start marker prevents automatic resend after an ambiguous DATA timeout or a worker crash during submission. Those jobs become `SMTP_DELIVERY_UNCERTAIN` and need operator reconciliation. Stable Message-ID helps investigation but is not claimed to guarantee inbox deduplication. `sent` means accepted by SMTP, not confirmed delivery.

Templates are Indonesian, HTML escaped, responsive and use SHIAP colors. No private proof URLs or access secrets appear in messages. Guest booking links do not grant authorization. Guests are directed to the original browser/device or manual ownership recovery.

## Admin routes and behavior

- `/admin/notifications`: filters, priority, persistent per-admin read state, mark all read, booking links, retry/failure information.
- `/admin/settings`: notification toggles, sender display name, internal admin email, reminder options, SMTP test and WhatsApp template editing.
- `/admin/bookings` and `/admin/bookings/[id]`: manual WhatsApp preview, template choice, editing, copy and wa.me link.
- Admin header bell refreshes every 30 seconds while visible. Existing operational dashboard data is reused.

WhatsApp numbers are normalized to valid Indonesian mobile numbers. The selected template, operator and timestamps are stored. Opening wa.me records `opened`, not `sent` or `delivered`. The separate manual confirmation records `manual_sent` as an operator assertion. There is no WhatsApp gateway, Cloud API or Web automation.

## SMTP configuration

Set these variables in cPanel Setup Node.js App's server environment. Never commit a password, prefix it with `NEXT_PUBLIC_`, place it in a release ZIP, use SMTP debug logging or put credentials in command arguments.

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | Official cPanel SMTP hostname |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | Existing authenticated mailbox |
| `SMTP_PASSWORD` | Existing mailbox password, server only |
| `SMTP_FROM_EMAIL` | Authorized sender matching the mailbox |
| `SMTP_FROM_NAME` | Sender display name |
| `ADMIN_NOTIFICATION_EMAIL` | Internal recipient and controlled SMTP test destination |
| `NOTIFICATION_CRON_SECRET` | Random server-only secret, at least 32 characters |

Existing server Supabase credentials are also required. SMTP uses Nodemailer 10.6.0 with implicit TLS, certificate verification and TLS 1.2 minimum. File/URL attachment access and transport debug logging are disabled. Configuration is read at runtime. Live dispatch additionally requires the production environment and canonical SHIAP Cloud URL. Development tests use mocks and fictional recipients.

## Enabling email after an approved release

1. Fix the DNS-only mail record using the origin provided by cPanel/hosting. Verify TCP 465 and a valid certificate for the official mail hostname.
2. Configure server variables and restart Passenger through the approved release process.
3. In Admin Settings, press **Kirim email uji**. The server verifies SMTP, then sends one test to `ADMIN_NOTIFICATION_EMAIL`, or the verified Admin account email if no internal recipient is configured. Arbitrary client-supplied recipients are not accepted.
4. Inspect inbox/spam and SPF/DKIM/DMARC authentication results. Enter the six-digit code from the email. The code is hashed in a private test table, expires after 15 minutes and allows five confirmation attempts. Sending is rate limited to three tests per Admin per hour and ten globally per hour.
5. Successful confirmation still leaves automation disabled. Admin explicitly enables desired email events and saves. Server checks the confirmed transport fingerprint and verifies SMTP again before allowing activation.
6. Install the authenticated cron job below only after release approval. Never enable bulk or promotional sends.

## Cron

The production probe confirmed `crontab` and `curl` are available. Use cPanel Cron once per minute. No Supabase Cron extension or hosted database scheduler change is required.

The operator should create a curl config outside the webroot, owned by the application user with mode 600. Its content contains the HTTPS dispatch URL, POST method and Authorization Bearer header with the same `NOTIFICATION_CRON_SECRET`. Never include that file in the release or print its content. Use a 60-second timeout, fail on HTTP errors and silent/show-error options. The cron command contains only the private config file path:

```cron
* * * * * /usr/bin/curl --config /home/shiapsit/.config/shiap-notification-cron.conf
```

Target: `POST https://app.shiap.id/api/internal/notifications/dispatch`. There is no secret in the URL. Requests without the correct server secret return 401. The handler returns only aggregate dispatch results.

## Schema and security

Forward-only migration: `supabase/migrations/20261118065410_notification_center_v1.sql`. It has been exercised only on Docker Supabase locally. Cloud application requires approval. Apply after Booking V2 and the pending Service Fee V1 migration in chronological order.

Tables: settings, events, deliveries, per-admin reads, SMTP test challenges, WhatsApp templates and activity. All have RLS. Anonymous users have no notification access. Non-admin authenticated users cannot read admin data or change settings. Public clients cannot mutate the queue, claim jobs, complete deliveries or read SMTP challenge hashes. Private payment proofs and booking ownership remain in their existing architecture. Email provider passwords, cron secrets and Supabase server keys are never returned by Admin APIs.

## Verification

- `npm test`: booking categories/status, destinations, notification rendering, WhatsApp normalization, cron auth, provider mocks and SMTP safety.
- `node scripts/notification-commit.test.mjs`: two local connections verify visibility after commit, then remove fixtures.
- `supabase/tests/notifications_smoke.sql`: event deduplication, stale reminders, retry/backoff, SMTP ambiguity, confirmed payment event, read state, Admin permissions and test-email confirmation. All changes roll back.
- Existing booking, guest checkout, RLS, Finance, Experience and Service Fee SQL regressions remain required.
- `scripts/booking-payment-browser.mjs`: local-only Booking V2, fee and notification/WhatsApp browser regression. No real customer data or live external messages.
- Run lint, TypeScript, production build and local security advisors before release.

Remaining live blocker: DNS-proxied SMTP host prevents connection and therefore authenticated SMTP/deliverability verification. Keep automatic email disabled until the DNS fix, a successful email test with inbox confirmation, approved Cloud migration and approved application release.

## Changed file groups

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20261118065410_notification_center_v1.sql`, `supabase/tests/notifications_smoke.sql` |
| Server engine | `src/lib/notifications/messages.ts`, `provider.ts`, `smtp.ts`, `authorization.ts`, `server.ts` |
| Admin APIs | `src/app/api/admin/notifications/route.ts`, `settings/route.ts`, `test-email/route.ts`, `src/app/api/admin/bookings/[id]/whatsapp/route.ts` |
| Worker endpoint | `src/app/api/internal/notifications/dispatch/route.ts` |
| Admin UI | `src/app/admin/notifications/page.tsx`, `src/components/admin/notification-center.tsx`, `notification-settings-form.tsx`, `booking-whatsapp.tsx` |
| Existing integration | Admin shell navigation, Booking Center list, booking detail, settings page and operational dashboard |
| Validation | `scripts/notifications.test.mjs`, `scripts/smtp.test.mjs`, `scripts/notification-commit.test.mjs`, `scripts/booking-payment-browser.mjs` |
| Runtime diagnosis | `scripts/check-smtp-configuration.mjs`, `scripts/probe-smtp-runtime.mjs` |
| Dependencies | `package.json`, `package-lock.json` pin Nodemailer and include notification tests |

Final local verification passed: 21 unit tests, seven rollback-only SQL suites, post-commit visibility test, lint without errors (one pre-existing YouTube image warning), TypeScript, production build, local security advisors and browser checks at 320/375/390/430/1280px. The browser checks also cover persisted unread/read state, WhatsApp opened audit without confirmed sending, disabled unverified email, Service Fee controls and existing Booking V2 flows. No external email was sent by development tests.
