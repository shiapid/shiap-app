# Stay V2 Phase 5A — Financial ledger checkpoint

## Scope

This QA checkpoint builds on Phase 4C. The existing Phase 4A bank verification, Phase 4B approval gate, and Phase 4C item refund remain the authorized paths. New journals subscribe inside their PostgreSQL transactions and share the same failure boundary. They do not create new payment or refund transfers.

## Accounting

| Bank or Finance event | Debit | Credit |
| --- | --- | --- |
| Verified unified payment | Bank, apportioned by item | Partner payable and deferred SHIAP commission for Stay. Service clearing for other services. Service Fee and tax to separate clearing accounts |
| Item refund approval | Payable and deferred commission for Stay, or item service clearing | Refund liability |
| Item refund transfer | Refund liability | Bank |
| A returned refund | Bank | Reopened refund liability |
| Bank reversal of an incoming payment | Bank return suspense | Bank |

The original booking and refund rows stay intact. The ledger is write-once. Each source can post once, and every journal must balance separately for each item. Amounts use integer IDR. Stay commission uses the immutable 15% snapshot and is rounded down. A refund decreases deferred commission by the difference between the commission before and after the cumulative approved refund. Ledger balances and bank reversal exceptions are readable by Finance Admin only. Raw journals and bank documents are excluded from Partner projections.

Evidence-backed returns require a distinct bank-issued ID on the original SHIAP account, full matching amount, verified transaction time, and private statement evidence. Return records share deduplication with incoming bank transfers and outgoing item refunds. Incoming bank reversals post to suspense so Finance can review the customer's obligation before an operational adjustment. They block fresh approved refund liability and outbound item refunds. A returned refund retains the original payment event and puts the refund back into reconciliation. This checkpoint does not add automated resubmission or recognize deferred commission as earned revenue.

## Historical reconciliation and Wallet dependency

The report `admin_stay_finance_reconciliation` identifies unposted openings, missing bank identity, single-service legacy Partner allocations, and the two return exception types. The item balance RPC `admin_stay_finance_item_balance` displays signed balances with service/vendor identity. Historical records require evidence-backed opening or correcting entries. No bank IDs, invoices, or historical balances are inferred.

Single-service Partner checkout still uses the existing booking workflow and its parent-level Finance refund path. That refund path lacks the Phase 4C per-item outbound-evidence contract. Neither these receipts nor their refund records can safely seed withdrawable funds yet. Before Wallet can be activated, add an authoritative financial allocation for single-service Partner bookings and route their refunds through verified outbound evidence. Define closing entries for bank return suspense and refund reissue, then verify holds, recoupment and payout identity against those events. Phase 5B and production activation remain gated on these items.

## QA isolation

Tested with synthetic data in `supabase_db_shiap-stay-v2-qa` on port 57322. Production, the old Docker database and the pending schedule lockdown were left unchanged. Apply only the three scoped migrations in ascending order when replaying this checkpoint on a compatible Phase 4C QA database.
