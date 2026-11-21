# Stay V2 Phase 5B — Wallet QA checkpoint

## Implemented

- Wallet at `/partner/stay/wallet` shows verified earnings, pending and held funds, eligible estimates, reserved funds, paid payouts, refund exposure, and masked history. The preview is enabled by `SHIAP_STAY_WALLET_READ_ENABLED=true`.
- A Partner owner can only query Wallet data for an agreement and property they are verified to manage. Finance actions require an explicit entry in the private payout operator allowlist in addition to SHIAP Admin membership.
- The database payout switch is off by default. The QA test enables it inside a rollback-only transaction. Neither a normal Partner nor a Finance operator can edit it from the app.
- A verified payout account matches the existing Partner bank verification and has a private verification document. The ledger stores a fingerprint and final four digits. A changed account cannot replace the active account while a withdrawal is in progress.
- Request, Finance approval, authorization to transfer, and confirmed bank payment are separate states. Reserved and paid amounts consume the same per-item cumulative early cap. Final availability requires validated checkout and completion. A verified failed transfer releases its reservation.
- `Paid` requires official outgoing bank evidence, exact amount, configured SHIAP source and verified beneficiary. The same statement ID cannot be recorded twice for the same source account or reused across payment, refund, bank-return and Partner-payout flows.
- A Partner with negative net payable is blocked from further requests and approvals. Existing accounting and audit records remain immutable.

## Open activation requirements

The Partner form and Finance console are gated by the separate server flag `SHIAP_STAY_PAYOUT_UI_ENABLED=true`. The database gate remains independent. Evidence is stored in a private bucket scoped to payout operators. A returned payout restores the payable with a compensating journal, preserves the original transfer, and holds the item for reconciliation. Contract-authorized recoupment still requires an explicit policy and paired per-item adjustments. Unresolved historical openings, bank-return suspense, and returned payouts remain held.

## QA

Database smoke covers verified earnings, cross-property denial, the default-off switch, the 50% cumulative early cap, distinct owner/Finance permissions, verified beneficiary, idempotent paid confirmation, held funds during refund review, final settlement after confirmed check-out, and releasing a failed payout reservation, and compensating an already recorded payout returned by the bank. The separate concurrency suite proves one of two competing requests can reserve the full early limit. All requests, bank evidence, and transfers were synthetic.
