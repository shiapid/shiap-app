-- Use the catalog duration carried in booking_items.variant for hourly cost rules.
create or replace function public.finance_snapshot_booking_item(p_item_id uuid,p_force boolean default false,p_reason text default null)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare bi public.booking_items%rowtype; t record; existing public.finance_booking_cost_snapshots%rowtype;
  product_key uuid; service_key text; nights numeric; duration_match text[]; duration_hours numeric:=0;
  sales_basis numeric; multiplier numeric; line_cost numeric; total_cost numeric:=0; lines jsonb:='[]'::jsonb;
begin
  if p_force and not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into bi from public.booking_items where id=p_item_id;
  if not found then raise exception 'Booking item tidak ditemukan.'; end if;
  select * into existing from public.finance_booking_cost_snapshots where booking_item_id=p_item_id;
  if found and not p_force then return existing.estimated_cost; end if;
  service_key:=case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end;
  product_key:=coalesce(bi.service_catalog_id,bi.trip_id,bi.room_type_id,bi.property_id);
  nights:=greatest(coalesce(bi.date_end-bi.date_start,1),1);
  duration_match:=regexp_match(coalesce(bi.variant,''),'([0-9]+([.,][0-9]+)?)[[:space:]]*(jam|hours?|menit|minutes?)','i');
  if duration_match is not null then
    duration_hours:=replace(duration_match[1],',','.')::numeric;
    if lower(duration_match[3]) in ('menit','minute','minutes') then duration_hours:=duration_hours/60; end if;
  end if;
  sales_basis:=case when bi.service_type='trip' or bi.price_basis='per_person' then bi.unit_price*bi.guests*bi.quantity
    when bi.service_type='stay' then bi.unit_price*nights*bi.quantity else bi.unit_price*bi.quantity end;
  perform 1 from public.booking_orders where id=bi.booking_id for update;
  for t in select * from public.finance_cost_templates c
    where c.is_active and c.service_type=service_key and (c.product_id is null or c.product_id=product_key)
    order by c.created_at,c.id
  loop
    if t.cost_basis='fixed_per_booking' and exists (
      select 1 from public.finance_booking_cost_snapshots s
      cross join lateral jsonb_array_elements(s.components) as component(value)
      where s.booking_id=bi.booking_id and s.booking_item_id<>bi.id and component.value->>'template_id'=t.id::text
    ) then continue; end if;
    multiplier:=case t.cost_basis when 'fixed_per_booking' then 1 when 'per_participant' then bi.guests*bi.quantity
      when 'per_night' then nights*bi.quantity when 'per_hour' then duration_hours*bi.quantity
      when 'per_day' then nights*bi.quantity when 'per_unit' then bi.quantity
      when 'percentage' then sales_basis/100 else 0 end;
    line_cost:=round(t.amount*multiplier,2); total_cost:=total_cost+line_cost;
    lines:=lines||jsonb_build_array(jsonb_build_object('template_id',t.id,'name',t.name,'basis',t.cost_basis,
      'rate',t.amount,'multiplier',multiplier,'estimated_cost',line_cost,'product_id',t.product_id));
  end loop;
  if existing.booking_item_id is not null then
    insert into public.finance_cost_recalculation_audit(booking_id,booking_item_id,actor_user_id,reason,previous_snapshot,next_snapshot)
    values(bi.booking_id,bi.id,auth.uid(),coalesce(nullif(trim(p_reason),''),'Rekalkulasi biaya booking'),
      jsonb_build_object('estimated_cost',existing.estimated_cost,'components',existing.components,'snapshotted_at',existing.snapshotted_at),
      jsonb_build_object('estimated_cost',total_cost,'components',lines,'snapshotted_at',now()));
  end if;
  insert into public.finance_booking_cost_snapshots(booking_item_id,booking_id,service_type,product_id,estimated_cost,components,snapshotted_at,updated_at)
  values(bi.id,bi.booking_id,service_key,product_key,total_cost,lines,now(),now())
  on conflict(booking_item_id) do update set service_type=excluded.service_type,product_id=excluded.product_id,
    estimated_cost=excluded.estimated_cost,components=excluded.components,snapshotted_at=excluded.snapshotted_at,updated_at=now();
  return total_cost;
end $$;

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
      else greatest(b.total_amount-coalesce(e.cash_received,case when b.payment_status='paid' then b.total_amount else 0 end,0)+coalesce(e.cash_refunded,0),0) end::numeric(14,2) receivable
  from public.booking_orders b left join costs c on c.booking_id=b.id
  left join expenses x on x.booking_id=b.id left join entries e on e.booking_id=b.id
)
select *, (recognized_revenue-estimated_direct_cost)::numeric(14,2) estimated_profit,
  (recognized_revenue-actual_direct_cost)::numeric(14,2) contribution_profit,
  case when net_sales>0 then round((recognized_revenue-actual_direct_cost)/net_sales*100,2) else 0 end::numeric(7,2) profit_margin,
  (select coalesce(b.completed_at,b.updated_at) from public.booking_orders b where b.id=calculated.id) as recognized_at
from calculated;
