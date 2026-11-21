begin;

create function shiap_private.unified_item_active(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from shiap_private.unified_order_items where item_id=p_item and cancelled_at is not null)
$$;
revoke all on function shiap_private.unified_item_active(uuid) from public,anon,authenticated,service_role;
-- Some legacy availability functions execute with their caller's privileges.
-- They can read only this boolean via their existing private-schema calls.
grant execute on function shiap_private.unified_item_active(uuid) to authenticated,anon,service_role;

create function pg_temp.refund_replace(p_definition text,p_old text,p_new text,p_expected integer default 1)
returns text language plpgsql as $$
begin
  if length(p_definition)-length(replace(p_definition,p_old,''))<>p_expected*length(p_old) then
    raise exception 'Refund guard baseline differs near %',left(p_old,180);
  end if;
  return replace(p_definition,p_old,p_new);
end $$;

do $migration$
declare d text;
begin
  d:=pg_get_functiondef('shiap_private.guard_unified_parent()'::regprocedure);
  execute pg_temp.refund_replace(d,$old$and not (new.payment_status='unpaid' and exists ($old$,
    $new$and not (new.order_status='cancelled' and new.payment_status='paid'
        and exists(select 1 from shiap_private.unified_order_items where booking_id=old.id)
        and not exists(select 1 from shiap_private.unified_order_items where booking_id=old.id and cancelled_at is null))
      and not (new.payment_status='unpaid' and exists ($new$);

  d:=pg_get_functiondef('shiap_private.guard_stay_partner_order_transition()'::regprocedure);
  d:=pg_temp.refund_replace(d,$old$if not found then return new; end if;$old$,
    $new$if not found or not shiap_private.unified_item_active(item.item_id) then return new; end if;$new$);
  execute d;

  d:=pg_get_functiondef('public.manage_stay_partner_item(uuid,text,text,uuid[])'::regprocedure);
  d:=pg_temp.refund_replace(d,$old$select * into item from public.stay_partner_fulfillment where item_id=p_item for update;$old$,
    $new$select * into item from public.stay_partner_fulfillment where item_id=p_item for update;
  if not shiap_private.unified_item_active(p_item) then
    raise exception 'Layanan Stay telah dibatalkan.' using errcode='23514';
  end if;$new$);
  d:=pg_temp.refund_replace(d,$old$and not exists (select 1 from public.finance_transaction_entries f where f.booking_id=b.id and f.entry_type='refund' and f.status='posted')$old$,
    $new$and (mixed or not exists (select 1 from public.finance_transaction_entries f where f.booking_id=b.id and f.entry_type='refund' and f.status='posted'))$new$);
  execute d;

  d:=pg_get_functiondef('public.admin_complete_unified_service(uuid,text)'::regprocedure);
  execute pg_temp.refund_replace(d,$old$if s.fulfillment='COMPLETED' then return; end if;$old$,
    $new$if s.cancelled_at is not null then raise exception 'Layanan telah dibatalkan.' using errcode='23514'; end if;
  if s.fulfillment='COMPLETED' then return; end if;$new$);

  d:=pg_get_functiondef('public.recalculate_trip_departure_inventory(uuid)'::regprocedure);
  execute pg_temp.refund_replace(d,'where i.departure_id=p_departure_id',
    'where i.departure_id=p_departure_id and shiap_private.unified_item_active(i.id)');
  d:=pg_get_functiondef('shiap_private.create_booking_order_core(text,text,text,text,jsonb,boolean)'::regprocedure);
  execute pg_temp.refund_replace(d,'where i.departure_id=did','where i.departure_id=did and shiap_private.unified_item_active(i.id)');
  d:=pg_get_functiondef('shiap_private.stay_inventory_reservations(uuid,date,date)'::regprocedure);
  execute pg_temp.refund_replace(d,'where i.room_type_id is not null','where i.room_type_id is not null and shiap_private.unified_item_active(i.id)');
  d:=pg_get_functiondef('shiap_private.create_experience_booking_core(uuid,uuid,date,integer,text,text,text,text,jsonb,jsonb,jsonb,boolean,jsonb)'::regprocedure);
  execute pg_temp.refund_replace(d,'where r.session_id=s.id','where r.session_id=s.id and shiap_private.unified_item_active(r.booking_item_id)');

  d:=pg_get_functiondef('shiap_private.unified_payment_error(uuid,boolean)'::regprocedure);
  d:=pg_temp.refund_replace(d,'where i.departure_id=item.departure_id and','where i.departure_id=item.departure_id and shiap_private.unified_item_active(i.id) and');
  d:=pg_temp.refund_replace(d,'where e.session_id=exp.session_id and','where e.session_id=exp.session_id and shiap_private.unified_item_active(e.booking_item_id) and');
  execute d;

  d:=pg_get_functiondef('public.admin_update_trip_departure(uuid,uuid,integer,date,date,time,numeric,integer,integer,text,text,text,text,boolean)'::regprocedure);
  execute pg_temp.refund_replace(d,'where i.departure_id=p_departure_id and b.order_status',
    'where i.departure_id=p_departure_id and shiap_private.unified_item_active(i.id) and b.order_status',2);
  d:=pg_get_functiondef('public.partner_stay_snapshot(uuid,date)'::regprocedure);
  execute pg_temp.refund_replace(d,$old$where i.property_id=a.stay_property_id and i.service_type='stay'$old$,
    $new$where i.property_id=a.stay_property_id and i.service_type='stay' and shiap_private.unified_item_active(i.id)$new$);
end $migration$;

commit;
