-- Align the cost matcher with the booking category adapter's legacy 'other' default.
create or replace function public.finance_snapshot_booking_item(p_item_id uuid,p_force boolean default false,p_reason text default null)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare bi public.booking_items%rowtype; t record; existing public.finance_booking_cost_snapshots%rowtype;
  product_key uuid; service_key text; nights numeric; sales_basis numeric; multiplier numeric; line_cost numeric;
  total_cost numeric:=0; lines jsonb:='[]'::jsonb;
begin
  if p_force and not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into bi from public.booking_items where id=p_item_id;
  if not found then raise exception 'Booking item tidak ditemukan.'; end if;
  select * into existing from public.finance_booking_cost_snapshots where booking_item_id=p_item_id;
  if found and not p_force then return existing.estimated_cost; end if;
  service_key:=case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end;
  product_key:=coalesce(bi.service_catalog_id,bi.trip_id,bi.room_type_id,bi.property_id);
  nights:=greatest(coalesce(bi.date_end-bi.date_start,1),1);
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
      when 'per_night' then nights*bi.quantity when 'per_hour' then 0 when 'per_day' then nights*bi.quantity
      when 'per_unit' then bi.quantity when 'percentage' then sales_basis/100 else 0 end;
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

create or replace view public.finance_service_profit_v with (security_invoker=true) as
with item_sales as (
  select bi.id,bi.booking_id,case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end service_type,
    (case when bi.service_type='trip' or bi.price_basis='per_person' then bi.unit_price*bi.guests*bi.quantity
      when bi.service_type='stay' then bi.unit_price*greatest(coalesce(bi.date_end-bi.date_start,1),1)*bi.quantity
      else bi.unit_price*bi.quantity end)::numeric(14,2) gross_item_sales
  from public.booking_items bi
), order_sales as (
  select booking_id,sum(gross_item_sales)::numeric(14,2) gross_total from item_sales group by booking_id
), item_costs as (
  select booking_item_id,sum(estimated_cost)::numeric(14,2) estimated_direct_cost from public.finance_booking_cost_snapshots group by booking_item_id
), item_expenses as (
  select booking_item_id,sum(amount)::numeric(14,2) actual_direct_cost from public.finance_expenses
  where status='approved' and booking_item_id is not null group by booking_item_id
)
select s.service_type,
  sum(case when o.order_status='completed' and o.payment_status='paid'
    then (case when nullif(os.gross_total,0) is null then 0 else o.total_amount*s.gross_item_sales/os.gross_total end) else 0 end)::numeric(14,2) recognized_revenue,
  sum(coalesce(c.estimated_direct_cost,0))::numeric(14,2) estimated_direct_cost,
  sum(coalesce(x.actual_direct_cost,0))::numeric(14,2) actual_direct_cost,
  sum(case when o.order_status='completed' and o.payment_status='paid'
    then (case when nullif(os.gross_total,0) is null then 0 else o.total_amount*s.gross_item_sales/os.gross_total end)-coalesce(x.actual_direct_cost,0) else 0 end)::numeric(14,2) contribution_profit,
  count(distinct s.booking_id)::integer booking_count
from item_sales s join public.booking_orders o on o.id=s.booking_id
left join order_sales os on os.booking_id=s.booking_id left join item_costs c on c.booking_item_id=s.id
left join item_expenses x on x.booking_item_id=s.id
group by s.service_type;
