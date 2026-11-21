begin;
set local lock_timeout = '5s';

-- Route Stay Partner options through the existing shared item-insert path.
-- Legacy Stay and all other service types keep the previous addon contract.
do $migration$
declare
  old_body text := replace(pg_get_functiondef('public.create_booking_order(text,text,text,text,jsonb)'::regprocedure),chr(13),'');
  old_clause text := $old$case when typ in('activity','documentation') then coalesce(item->'selected_addons','[]'::jsonb) else '[]'::jsonb end)$old$;
  new_clause text := $new$case when typ in('activity','documentation')
        or (typ='stay' and shiap_private.stay_partner_public_mode(pid) in ('REQUEST_TO_BOOK','INSTANT'))
        then coalesce(item->'selected_addons','[]'::jsonb) else '[]'::jsonb end)$new$;
begin
  if length(old_body)-length(replace(old_body,old_clause,''))<>length(old_clause) then
    raise exception 'Stay Partner checkout differs from the reviewed baseline.';
  end if;
  execute replace(old_body,old_clause,new_clause);
end;
$migration$;

create function shiap_private.guard_stay_partner_item_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.stay_partner_fulfillment p where p.order_id=new.booking_id) then
    raise exception 'Pesanan Stay Partner harus dibuat terpisah.' using errcode='P0001';
  end if;
  if new.service_type<>'stay' and exists(
    select 1 from public.stay_properties s where (s.id=new.property_id or s.id=(
      select r.property_id from public.stay_room_types r where r.id=new.room_type_id))
      and (s.partner_booking_required
        or exists(select 1 from public.stay_partner_booking_config c where c.property_id=s.id)
        or exists(select 1 from public.places_properties p where p.stay_property_id=s.id))
  ) then raise exception 'Referensi kamar Partner hanya sah untuk reservasi Stay.' using errcode='P0001'; end if;
  return new;
end;
$$;
revoke all on function shiap_private.guard_stay_partner_item_scope() from public,anon,authenticated;
create trigger aa_stay_partner_scope before insert on public.booking_items
for each row execute function shiap_private.guard_stay_partner_item_scope();

create function shiap_private.sync_stay_partner_cancelled_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.stay_partner_fulfillment set status='CANCELLED',updated_at=clock_timestamp()
  where order_id=new.id and status not in ('REJECTED','CANCELLED','COMPLETED');
  return new;
end;
$$;
revoke all on function shiap_private.sync_stay_partner_cancelled_order() from public,anon,authenticated;
create trigger stay_partner_cancelled_order after update of order_status on public.booking_orders
for each row when (old.order_status is distinct from new.order_status and new.order_status in ('cancelled','expired','rejected'))
execute function shiap_private.sync_stay_partner_cancelled_order();

commit;
