# SHIAP Stay V2 · Phase 3

## Source and QA

Base source is Phase 2 commit `31b11823974cfbd9f1ce567a4a39951cf1ffd575`.
Use only the isolated Supabase QA project `shiap-stay-v2-qa` on local
Postgres port 57322. The QA project contains the 68 production-applied baseline
versions and Phase 2. Schedule lockdown remains outside this workstream.

The QA cleanup removed two known Stay HTTP fixtures
`stay-linked-25ce842f` and `stay-legacy-25ce842f`. The linked Places listing
was retained with its mapping cleared. There were no dependent rooms, inventory
blocks, rates, guest bookings, financial records, or stored images to delete.

## Onboarding and activation

1. Verify the Places contact, owner and Places–Stay mapping in the existing
   Admin review. Review the Partner application and record its decision.
2. Register the mapped Stay, the reviewed application and a matching accepted
   Booking Partner agreement at `/admin/stay/operations`. The verified owner
   is also an active owner on the agreement.
3. Submit from Draft to Pending Review. Confirm the bank account in the
   approved back-office channel. Phase 3 stores the bank name and last four
   digits with reviewer and timestamp. No full account number or payout details
   are needed here.
4. Complete room setup, including active inventory, positive weekend and
   weekday pricing, capacity and check-in/out times. Admin approval and
   activation are separate decisions.
5. Activation starts in Request-to-book. Instant Booking requires separate
   approval. Booking eligibility is evaluated again server-side after changes
   to the agreement, verification, ownership, inventory or the bank record.

Admin and verified agreement owners manage reservations from the existing
Stay workspace. Admin can place or release an operational hold. Suspension
stops intake; authorized operators can still fulfill existing valid orders.

## Checkout and fulfillment

A Partner booking has one order and one Stay item. The shared checkout still
calculates rates, Service Fee, holds, billing and guest authorization. The item
guard blocks alternate service types carrying managed Stay references and
mixed orders. Legacy unlinked Stay inventory retains its existing behavior.

Request-to-book holds stock for the existing 15-minute window with payment
closed. Approval while a hold is valid opens a fresh 15-minute payment window.
Rejection or expiry releases the hold through the existing inventory rules.
Instant Booking reserves inventory atomically and hands customers to the
existing full bank transfer flow. Late manual recording before the expiry
job is blocked for Partner orders. Proof already submitted on time remains
eligible for authorized review after the deadline.

After verified payment, fulfillment moves through Confirmed, Checked-in,
Checked-out and Completed. Completion requires that the scheduled WITA
check-out has passed, no proof review or posted refund is outstanding, and
Admin has cleared operational holds. Booking Center cannot complete a Partner
order ahead of its fulfillment item. Partner operators cannot verify payment.

Room night rates and inventory blocks use the existing Stay tables. Extra
guests are priced above the configured included occupancy, within the room's
existing capacity. When multiple rooms require extra guests, occupancy must be
evenly assigned or rooms must be booked separately. Property add-ons are
priced per room per stay. Physical unit labels are assigned during check-in
inside the Stay calendar lock. The room-type total remains the authoritative
checkout inventory. Date maintenance blocks reserve a quantity of units.

Phase 3 records the agreement ID and version per fulfillment item. Mixed
checkout, item payment allocation, Partner commission posting, earnings,
withdrawals and payouts remain separate phases. To pause intake in QA, suspend
the Partner configuration and preserve the lifecycle and audit records.
