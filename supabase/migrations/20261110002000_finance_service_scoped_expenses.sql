-- Add service-tagged expenses that are not attached to a single booking to service P&L.
create or replace view public.finance_service_profit_v with (security_invoker=true) as
with item_sales as (
  select bi.id,bi.booking_id,
    case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end service_type,
    (case when bi.service_type='trip' or bi.price_basis='per_person' then bi.unit_price*bi.guests*bi.quantity
      when bi.service_type='stay' then bi.unit_price*greatest(coalesce(bi.date_end-bi.date_start,1),1)*bi.quantity
      else bi.unit_price*bi.quantity end)::numeric(14,2) gross_item_sales
  from public.booking_items bi
), order_sales as (
  select booking_id,sum(gross_item_sales)::numeric(14,2) gross_total from item_sales group by booking_id
), item_costs as (
  select booking_item_id,sum(estimated_cost)::numeric(14,2) estimated_direct_cost
  from public.finance_booking_cost_snapshots group by booking_item_id
), item_expenses as (
  select booking_item_id,sum(amount)::numeric(14,2) actual_direct_cost
  from public.finance_expenses where status='approved' and booking_item_id is not null group by booking_item_id
), service_pnl as (
  select s.service_type,
    sum(case when o.order_status='completed' and o.payment_status='paid'
      then case when nullif(os.gross_total,0) is null then 0
        else greatest(o.total_amount-coalesce(refunds.amount,0),0)*s.gross_item_sales/os.gross_total end
      else 0 end)::numeric(14,2) recognized_revenue,
    sum(coalesce(c.estimated_direct_cost,0))::numeric(14,2) estimated_direct_cost,
    sum(coalesce(x.actual_direct_cost,0)+case when nullif(os.gross_total,0) is null then 0
      else (coalesce(booking_expenses.amount,0)+coalesce(fees.amount,0))*s.gross_item_sales/os.gross_total end)::numeric(14,2) actual_direct_cost,
    sum(case when o.order_status='completed' and o.payment_status='paid'
      then case when nullif(os.gross_total,0) is null then 0
        else greatest(o.total_amount-coalesce(refunds.amount,0),0)*s.gross_item_sales/os.gross_total end
        -coalesce(x.actual_direct_cost,0)-case when nullif(os.gross_total,0) is null then 0
          else (coalesce(booking_expenses.amount,0)+coalesce(fees.amount,0))*s.gross_item_sales/os.gross_total end
      else 0 end)::numeric(14,2) contribution_profit,
    count(distinct s.booking_id)::integer booking_count
  from item_sales s join public.booking_orders o on o.id=s.booking_id
  left join order_sales os on os.booking_id=s.booking_id
  left join item_costs c on c.booking_item_id=s.id
  left join item_expenses x on x.booking_item_id=s.id
  left join lateral (select sum(amount) amount from public.finance_transaction_entries where booking_id=s.booking_id and entry_type='refund' and status='posted') refunds on true
  left join lateral (select sum(amount) amount from public.finance_transaction_entries where booking_id=s.booking_id and entry_type='processing_fee' and status='posted') fees on true
  left join lateral (select sum(amount) amount from public.finance_expenses where booking_id=s.booking_id and booking_item_id is null and status='approved') booking_expenses on true
  group by s.service_type
), service_expenses as (
  select service_type,sum(amount)::numeric(14,2) amount from public.finance_expenses
  where status='approved' and booking_id is null and booking_item_id is null and service_type is not null
  group by service_type
)
select p.service_type,p.recognized_revenue,p.estimated_direct_cost,
  (p.actual_direct_cost+coalesce(e.amount,0))::numeric(14,2) actual_direct_cost,
  (p.contribution_profit-coalesce(e.amount,0))::numeric(14,2) contribution_profit,
  p.booking_count
from service_pnl p left join service_expenses e on e.service_type=p.service_type
union all
select e.service_type,0::numeric(14,2),0::numeric(14,2),e.amount,(-e.amount)::numeric(14,2),0::integer
from service_expenses e where not exists(select 1 from service_pnl p where p.service_type=e.service_type);

comment on view public.finance_service_profit_v is
  'Service contribution includes allocated booking costs and approved service-scoped expenses; unmatched general overhead remains outside service P&L.';
