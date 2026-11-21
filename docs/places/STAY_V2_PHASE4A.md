# Stay V2 Phase 4A — Payment Integrity Gate

## Inventory before implementation

| Entry point | Existing financial behavior | Gate |
| --- | --- | --- |
| Admin Booking Center manual transfer → `admin_mark_booking_paid_full_amount` | Creates a full booking receipt through `finance_record_transaction` and updates Paid | Shared bank settlement |
| Admin Booking Center proof approval/rejection → `admin_review_booking_payment_full_amount` | Approval inserts a receipt through `finance_capture_approved_payment_proof` and updates Paid. Rejection only updates review state | Shared gate for approval |
| Admin Finance → `finance_record_transaction` | Records a full payment or a separate refund, processing fee or discount | Shared gate for payment. Non-receipt adjustments keep existing validation |
| Admin Places Billing → `admin_review_places_invoice` | Approval inserts Premium cash receipt, settles invoice and activates/schedules subscription. Rejection only updates review state | Same canonical bank identity as booking |
| `admin_refund_places_invoice` | Records confirmed outbound refund and optionally suspends subscription | Existing separate adjustment; does not release inbound bank transaction |
| Booking/guest proofs → `submit_booking_payment_proof`; Places proof → `server_submit_places_billing_proof` | Records customer evidence and advances review state | Cannot allocate or mark Paid |
| Trip, legacy Stay, Partner Stay, Experience, Rental and Shinema | Serve booking creation or fulfillment through shared booking orders. Experience/Partner Stay approvals open payment but do not receive funds | Same booking ledger gate |
| Retired `admin_mark_booking_paid` and `admin_review_booking_payment` | Revoked stubs | Remain revoked |
| Finance reversal/reconciliation | No exposed receipt reversal or reconciliation function found. Booking ledger carries reversal metadata. Premium refund is an outbound adjustment | Preserve both ledgers; introduce an explicit reconciliation path |

The local function inventory was checked against the 72-migration QA database. The Phase 4 audit demonstrated that two booking orders could each settle with identical typed references. The fixture was rolled back. Cross-ledger integrity was previously absent.

## Integrity contract

- Use the configured official receiving account. Finance reads the stable transaction ID and timestamp from the bank's own statement, uploads only the relevant redacted evidence, checks the amount and submits. A customer receipt and human-facing reference are insufficient. Manual attestation still depends on Finance inspecting the original bank channel. There is no automated bank verification in this phase.
- The private canonical table stores the bank name, account fingerprint and last four digits, the exact source transaction ID, display reference, timestamp, amount in IDR, evidence location, and verifier. Account digits deliberately remain stable if the display name is edited. If two different banks have the same account digits and source ID the system treats it as a conflict requiring review. Premium invoice settlement additionally checks the account and bank in its original transfer instructions.
- The primary key of the allocation table is the canonical transfer ID. It points to exactly one booking or one invoice, each of which is unique. Both existing receipts bind to that allocation through database triggers, and the Paid/Settled transitions require the matching receipt. Retrying the same transfer and target returns the allocation without creating a second Finance entry.
- The database commits the canonical transfer, allocation, existing payment transition and receipt, and Finance audit together. A bank statement file lives in private Storage and is uploaded before this transaction. Failed or abandoned submissions can leave an unreferenced private file. Treat such files under a separate audited retention process. Never purge referenced evidence as part of routine cleanup.
- A missing reliable ID and the verified actor's reconciliation notes are carried in the private audit. No transfer ID is fabricated. Existing payments without canonical allocations are shown in Finance as historical unmatched. No historical rows are merged, auto-backfilled, treated as unpaid or modified by the migrations.
- Finance can record a proven reversal for a canonical booking still waiting for operational confirmation, provided no registered check-in or refund exists. The receipt is retained with reversal metadata and the order is cancelled with payment disabled. A confirmed/fulfilled booking or Premium invoice enters reversal review without a financial mutation. Keep the existing confirmed external-refund workflow separate. Finance records actual reconciliation outcomes. The original transfer remains bound to its original order even after reversal.

## QA and rollout boundaries

Only local QA project `shiap-stay-v2-qa` on port 57322 was used. Phase 4A migration versions are `20261121100000`, `20261121100100`, `20261121100200`, and `20261121100300`. The follow-ups protect receipt history and database privileges, and keep bank notes out of customer-readable booking events. The old Docker project, Cloud, schedule lockdown and new financial products are outside scope.

For any separately authorized release, verify which bank-export field is actually stable for the receiving account and agree with Finance on historical duplicate review, evidence retention, and exception handling for account changes. Coordinate the application and schema rollout: existing UI code cannot approve new receipts after the guards are installed. An application-only rollback to that UI intentionally fails closed for new transfers. Existing bookings, invoices, and prior receipts remain readable.

## Verified results

- 54 unit tests, TypeScript, ESLint, and production build with Webpack passed. ESLint reported one baseline image warning unrelated to payments.
- 10 SQL/RLS suites passed, including Finance, Service Fee, guest checkout, Trip and legacy Stay, Partner Stay, Experience, Notifications, and Places Premium billing. The Experience seed was loaded only inside its rollback-only test.
- Two simultaneous Finance sessions attempting the same bank transfer produced one Paid order, one allocation, and one receipt. A simultaneous proof review and manual entry produced one receipt and no orphan bank transfer. The populated concurrency fixture had zero duplicate receipt allocations.
- The Storage test used real QA Auth sessions. Admin upload and read passed. Overwrite, customer access and anonymous access were denied.
- The QA baseline contains 76 migration versions after Phase 4A, with schedule lockdown still absent. Synthetic Auth and payment fixtures were removed or rolled back.
