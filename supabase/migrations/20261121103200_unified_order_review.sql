begin;

alter table shiap_private.unified_order_items add column review_open boolean not null default false;

do $migration$
declare definition text; corrected text;
begin
  definition:=pg_get_functiondef('shiap_private.create_unified_booking(jsonb)'::regprocedure);
  corrected:=replace(definition,$old$'selected_addons',i->'selected_addons'$old$,
    $new$'selected_addons',coalesce(nullif(i->'selected_addons','null'::jsonb),'[]'::jsonb)$new$);
  if corrected=definition then raise exception 'Unified add-on contract differs.'; end if;
  execute corrected;

  definition:=pg_get_functiondef('shiap_private.seal_unified_checkout(uuid)'::regprocedure);
  corrected:=replace(definition,$old$then item.unit_price*greatest(item.date_end-item.date_start,1)*item.quantity$old$,
    $new$then coalesce((item.stay_rate_snapshot->>'subtotal')::numeric,item.unit_price*greatest(item.date_end-item.date_start,1))*item.quantity$new$);
  if corrected=definition then raise exception 'Unified nightly price contract differs.'; end if;
  execute corrected;

  definition:=pg_get_functiondef('shiap_private.unified_payment_error(uuid,boolean)'::regprocedure);
  corrected:=replace(definition,'  for item in',
    $new$  if exists(select 1 from shiap_private.unified_order_items where booking_id=b.id and review_open) then
    return 'Layanan sedang ditinjau Finance.';
  end if;
  for item in$new$);
  if corrected=definition then raise exception 'Unified payment gate differs.'; end if;
  execute corrected;

  definition:=pg_get_functiondef('shiap_private.unified_all_fulfilled(uuid)'::regprocedure);
  corrected:=replace(definition,'and bool_and(case',
    'and bool_and(not s.review_open and case');
  if corrected=definition then raise exception 'Unified completion gate differs.'; end if;
  execute corrected;

  definition:=pg_get_functiondef('shiap_private.guard_unified_cash_receipt()'::regprocedure);
  corrected:=replace(definition,$old$new.entry_type='refund'$old$,$new$new.entry_type in ('refund','discount')$new$);
  if corrected=definition then raise exception 'Unified cash guard differs.'; end if;
  execute corrected;

  definition:=pg_get_functiondef('public.admin_complete_unified_service(uuid,text)'::regprocedure);
  corrected:=replace(definition,$old$if s.fulfillment='COMPLETED' then return; end if;$old$,
    $new$if s.fulfillment='COMPLETED' then return; end if;
  if s.review_open then raise exception 'Selesaikan tinjauan Finance terlebih dahulu.' using errcode='23514'; end if;$new$);
  if corrected=definition then raise exception 'Unified service completion differs.'; end if;
  execute corrected;
end $migration$;

create table shiap_private.unified_item_review_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references shiap_private.unified_order_items(item_id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  review_open boolean not null,
  reason text not null check(length(btrim(reason)) between 10 and 500),
  created_at timestamptz not null default clock_timestamp()
);
create index unified_item_review_history on shiap_private.unified_item_review_events(item_id,created_at desc);
alter table shiap_private.unified_item_review_events enable row level security;
revoke all on shiap_private.unified_item_review_events from public,anon,authenticated,service_role;

create function public.admin_review_unified_service(p_item uuid,p_open boolean,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare parent_id uuid; current_order public.booking_orders%rowtype;
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if p_open is null or coalesce(length(btrim(p_note)),0) not between 10 and 500 then
    raise exception 'Isi alasan tinjauan (10–500 karakter).' using errcode='22023';
  end if;
  select booking_id into parent_id from shiap_private.unified_order_items where item_id=p_item;
  if not found then raise exception 'Layanan tidak tersedia.' using errcode='22023'; end if;
  select * into strict current_order from public.booking_orders where id=parent_id for update;
  update shiap_private.unified_order_items set review_open=p_open where item_id=p_item and review_open<>p_open;
  if not found then return; end if;
  insert into shiap_private.unified_item_review_events(item_id,actor_id,review_open,reason)
  values(p_item,auth.uid(),p_open,btrim(p_note));
  if current_order.payment_status='unpaid' and current_order.order_status='pending_confirmation' then
    perform shiap_private.unified_refresh_payment(parent_id);
  elsif not p_open then
    perform shiap_private.unified_complete_parent(parent_id);
  end if;
end $$;
revoke all on function public.admin_review_unified_service(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_review_unified_service(uuid,boolean,text) to authenticated;

do $migration$
declare definition text; corrected text;
begin
  definition:=pg_get_functiondef('public.server_unified_booking_view(uuid)'::regprocedure);
  corrected:=replace(definition,$old$'fulfillment',coalesce(f.status,s.fulfillment),$old$,
    $new$'fulfillment',coalesce(f.status,s.fulfillment),'review_open',s.review_open,$new$);
  if corrected=definition then raise exception 'Unified review projection differs.'; end if;
  execute corrected;

  definition:=pg_get_functiondef('public.manage_stay_partner_item(uuid,text,text,uuid[])'::regprocedure);
  corrected:=replace(definition,$old$when 'COMPLETE' then$old$,
    $new$when 'COMPLETE' then
        if mixed and exists(select 1 from shiap_private.unified_order_items where item_id=p_item and review_open) then
          raise exception 'Selesaikan tinjauan Finance terlebih dahulu.' using errcode='23514';
        end if;$new$);
  if corrected=definition then raise exception 'Unified Stay completion guard differs.'; end if;
  execute corrected;
end $migration$;


create function public.admin_list_unified_service_reviews()
returns table(booking_id uuid, order_number text, service text, service_name text, reason text, opened_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  return query select b.id,b.order_number,s.service,i.service_name,r.reason,r.created_at
  from shiap_private.unified_order_items s join public.booking_items i on i.id=s.item_id
  join public.booking_orders b on b.id=s.booking_id
  cross join lateral (
    select e.reason,e.created_at from shiap_private.unified_item_review_events e where e.item_id=s.item_id
      order by e.created_at desc,e.id desc limit 1
  ) r
  where s.review_open order by r.created_at desc limit 100;
end $$;
revoke all on function public.admin_list_unified_service_reviews() from public,anon,authenticated,service_role;
grant execute on function public.admin_list_unified_service_reviews() to authenticated;

commit;
