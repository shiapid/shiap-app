create or replace function public.finance_validate_expense_transition()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' and new.status<>'pending' then raise exception 'Pengeluaran baru harus menunggu peninjauan.'; end if;
  if tg_op='UPDATE' and old.status is distinct from new.status then
    if old.status='void' then raise exception 'Pengeluaran void tidak dapat diubah kembali.'; end if;
    if old.status='pending' and new.status not in('approved','rejected','void') then raise exception 'Transisi status pengeluaran tidak valid.'; end if;
    if old.status='approved' and new.status<>'void' then raise exception 'Pengeluaran disetujui hanya dapat di-void.'; end if;
    if old.status='rejected' and new.status not in('pending','void') then raise exception 'Pengeluaran ditolak hanya dapat diajukan kembali atau di-void.'; end if;
    if new.status in('approved','rejected','void') and (new.reviewed_by is null or new.reviewed_at is null) then
      raise exception 'Status final pengeluaran memerlukan reviewer dan waktu peninjauan.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.finance_validate_expense_transition() from public,anon,authenticated;
drop trigger if exists finance_expenses_transition_guard on public.finance_expenses;
create trigger finance_expenses_transition_guard before insert or update on public.finance_expenses
  for each row execute function public.finance_validate_expense_transition();

alter table public.booking_orders add column if not exists completed_at timestamptz;
update public.booking_orders set completed_at=updated_at where order_status='completed' and completed_at is null;
create or replace function public.finance_track_booking_completion()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.order_status='completed' and old.order_status is distinct from 'completed' then new.completed_at:=coalesce(new.completed_at,now()); end if;
  return new;
end $$;
revoke all on function public.finance_track_booking_completion() from public,anon,authenticated;
drop trigger if exists finance_track_booking_completion on public.booking_orders;
create trigger finance_track_booking_completion before update of order_status on public.booking_orders
  for each row execute function public.finance_track_booking_completion();

create or replace view public.finance_booking_profit_v with (security_invoker=true) as
with costs as (
  select booking_id,sum(estimated_cost)::numeric(14,2) estimated_direct_cost from public.finance_booking_cost_snapshots group by booking_id
), expenses as (
  select booking_id,sum(amount)::numeric(14,2) actual_expenses from public.finance_expenses where status='approved' and booking_id is not null group by booking_id
), entries as (
  select booking_id,
    sum(amount) filter(where entry_type='payment' and status='posted')::numeric(14,2) cash_received,
    sum(amount) filter(where entry_type='refund' and status='posted')::numeric(14,2) cash_refunded,
    sum(amount) filter(where entry_type='processing_fee' and status='posted')::numeric(14,2) processing_fees,
    sum(amount) filter(where entry_type='discount' and status='posted')::numeric(14,2) discounts
  from public.finance_transaction_entries group by booking_id
), calculated as (
  select b.id,b.order_number,b.order_status,b.payment_status,b.created_at,b.total_amount::numeric(14,2) payable_amount,
    coalesce(e.discounts,0)::numeric(14,2) discount_amount,
    (b.total_amount+coalesce(e.discounts,0))::numeric(14,2) gross_sales,
    greatest(b.total_amount-coalesce(e.cash_refunded,0),0)::numeric(14,2) net_sales,
    case when b.order_status='completed' and b.payment_status='paid'
      then greatest(b.total_amount-coalesce(e.cash_refunded,0),0) else 0 end::numeric(14,2) recognized_revenue,
    coalesce(e.cash_received,case when b.payment_status='paid' then b.total_amount else 0 end,0)::numeric(14,2) cash_received,
    coalesce(e.cash_refunded,0)::numeric(14,2) refunds,
    coalesce(c.estimated_direct_cost,0)::numeric(14,2) estimated_direct_cost,
    (coalesce(x.actual_expenses,0)+coalesce(e.processing_fees,0))::numeric(14,2) actual_direct_cost,
    coalesce(e.processing_fees,0)::numeric(14,2) processing_fees,
    case when b.order_status in('cancelled','rejected','expired') then 0
      else greatest(b.total_amount-coalesce(e.cash_received,case when b.payment_status='paid' then b.total_amount else 0 end,0),0) end::numeric(14,2) receivable
  from public.booking_orders b left join costs c on c.booking_id=b.id
  left join expenses x on x.booking_id=b.id left join entries e on e.booking_id=b.id
)
select *, (recognized_revenue-estimated_direct_cost)::numeric(14,2) estimated_profit,
  (recognized_revenue-actual_direct_cost)::numeric(14,2) contribution_profit,
  case when net_sales>0 then round((recognized_revenue-actual_direct_cost)/net_sales*100,2) else 0 end::numeric(7,2) profit_margin,
  (select coalesce(b.completed_at,b.updated_at) from public.booking_orders b where b.id=calculated.id) as recognized_at
from calculated;
