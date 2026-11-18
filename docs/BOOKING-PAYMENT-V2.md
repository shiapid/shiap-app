# Booking and payment V2

The existing booking and Experience RPCs calculate the price and reserve inventory. The service-only checkout adapter adds transactional idempotency and a guest access context. Authenticated customers retain the existing `user_id` relationship and RLS. Guest orders have a nullable `user_id` and a separate guest session reference.

## Runtime configuration

Apply `supabase/migrations/20261118010758_booking_payment_experience_v2.sql` through the approved migration workflow before releasing the application. Local verification uses the Docker Supabase stack. Cloud migration and production deployment require their own authorized release operation.

Configure `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` in the server runtime environment in cPanel. Use the key for the same project as `NEXT_PUBLIC_SUPABASE_URL`. Never prefix it with `NEXT_PUBLIC_`, write it to the repository, or include it in the release ZIP. The server uses it only after verifying the authenticated user or guest grant and scopes every customer query to that owner. Public clients cannot invoke the checkout or guest-action adapters.

For an existing Passenger application returning the generic Booking API 503, open cPanel → Setup Node.js App → `shiap-app` → Environment Variables. Set one of the server key variables above using an existing valid server key from project `sbomjhwmjmqteybsegdl`. Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured for that project. Save and restart the application through cPanel, then check `GET /api/bookings` without cookies returns HTTP 200 with an empty guest order list. Do not copy secrets into `.htaccess`, release archives, command arguments or diagnostic output. Never bypass booking ownership checks to clear this error.

The production release script runs `scripts/check-booking-production.mjs` over SSH before packaging and again before reporting deployment success. It inspects only this app's Passenger Node workers, reports variable presence, validates the canonical project and server role, performs a zero-row read of the private Booking V2 schema, and checks the unauthenticated Booking API returns no private records. Missing credentials, invalid credentials, permission/schema failures, connection failures or an unhealthy API block success. A failure after activation invokes the existing rollback. Build-time public settings do not replace server credentials in the Passenger runtime.

Production guest access uses a random 256-bit opaque secret in the `__Host-shiap_booking` cookie. It is HttpOnly, Secure, SameSite=Lax and scoped to `/`. The database stores only its SHA-256 hash. Access expires after 30 days and can be revoked through `DELETE /api/bookings/session` or by setting the session's `revoked_at`. Development and isolated CI use a separate cookie name to support loopback HTTP.

Checkout and mutations require a same-origin request. Persisted database rate limits cover session creation, checkout, reads, mutations and proof uploads across Node processes. The reverse proxy must replace client-supplied forwarding headers with the actual client address. Configure that at the hosting proxy if it does not already do so.

## Ownership recovery

There is no WhatsApp OTP integration in this package. The detail page explains that a guest should return in the original browser. Cross-device recovery goes to the configured SHIAP support contact for manual ownership verification. An email address, phone number, booking code or booking ID never grants access by itself.

A customer with the active guest cookie can explicitly claim an order after signing into an account whose email or phone has been verified by Supabase Auth. The database locks the order, verifies both relationships, transfers ownership and removes the guest reference atomically. Existing account bookings do not depend on the guest cookie.

## Payment and inventory

The initial hold remains 15 minutes in the existing server RPC. Screenshots enter `pending` review and never create a successful Finance payment. Existing full-amount and bank-reference verification remains mandatory. A qualifying pending proof preserves the inventory hold past the original payment deadline. Expired reservations cannot be revived by submitting proof.

Only one pending proof per order is accepted. Content is checked on the server, image files are decoded and normalized, and PDFs require their signature and end marker. The private proof bucket accepts customer uploads only through the application server. Proof downloads require ownership again and use a short-lived signed download URL.

The new `review_due_at` marks a 24-hour follow-up deadline. Customer and admin views flag overdue review for human resolution while preserving the reservation during funds verification. It does not represent a new automatic cancellation policy. Rejection and cancellation continue through existing inventory and Finance rules.

## Verification

Run the normal lint, TypeScript, unit tests and production build. The rollback-only `supabase/tests/guest_checkout_smoke.sql` checks guest ownership, idempotency, proof retries, no screenshot-created payments, hold expiry, verified claims, revocation and adapter privileges. Existing booking, RLS, Experience and Finance smoke tests must also pass.
