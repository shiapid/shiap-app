begin;

-- Keep receipts and adjustments behind their audited RPCs. TRUNCATE bypasses row triggers.
revoke insert, truncate on public.finance_transaction_entries, public.places_platform_cash_entries
from public, anon, authenticated, service_role;

commit;
