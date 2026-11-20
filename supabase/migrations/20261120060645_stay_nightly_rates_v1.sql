begin;

create extension if not exists btree_gist with schema extensions;

create table public.stay_special_rates (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.stay_room_types(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  price numeric not null check (price > 0 and price <= 999999999999 and price = trunc(price)),
  check (isfinite(starts_on) and isfinite(ends_on) and ends_on >= starts_on),
  exclude using gist (room_type_id with =, daterange(starts_on, ends_on, '[]') with &&)
);
alter table public.stay_special_rates enable row level security;
revoke all on public.stay_special_rates from public, anon, authenticated;
grant select on public.stay_special_rates to anon, authenticated;
grant insert, update, delete on public.stay_special_rates to authenticated;
create policy stay_special_rates_published_read on public.stay_special_rates
  for select to anon, authenticated using (
    exists (select 1 from public.stay_room_types room join public.stay_properties property on property.id=room.property_id
      where room.id=room_type_id and room.status='active' and property.status='published')
  );
create policy stay_special_rates_admin on public.stay_special_rates
  for all to authenticated using ((select public.is_shiap_admin())) with check ((select public.is_shiap_admin()));

alter table public.booking_items add column stay_rate_snapshot jsonb;

create function public.quote_stay_nights(p_room_type_id uuid, p_check_in date, p_check_out date)
returns table(night date, rate numeric, rate_kind text)
language sql stable security invoker set search_path='' as $$
  select p_check_in + offset_day,
    coalesce(special.price, case when extract(isodow from p_check_in + offset_day) >= 5 then room.weekend_price else room.weekday_price end),
    case when special.id is not null then 'special'
      when extract(isodow from p_check_in + offset_day) >= 5 then 'weekend' else 'weekday' end
  from public.stay_room_types room
  join public.stay_properties property on property.id=room.property_id and property.status='published'
  cross join lateral generate_series(0, case
    when isfinite(p_check_in) and isfinite(p_check_out) and p_check_out > p_check_in
      then case when p_check_out::timestamp - p_check_in::timestamp <= interval '365 days' then p_check_out - p_check_in - 1 end end) offset_day
  left join public.stay_special_rates special on special.room_type_id=room.id
    and daterange(special.starts_on, special.ends_on, '[]') @> (p_check_in + offset_day)
  where room.id=p_room_type_id and room.status='active'
  order by 1;
$$;
revoke all on function public.quote_stay_nights(uuid,date,date) from public;
grant execute on function public.quote_stay_nights(uuid,date,date) to anon, authenticated, service_role;

-- Existing orders keep their original item prices. New stays carry an exact
-- nightly snapshot and use its per-unit subtotal for all downstream totals.
do $migration$
declare ddl text; old text; updated text;
begin
  ddl:=replace(pg_get_functiondef('public.apply_booking_item_price()'::regprocedure),chr(13),'');
  old:=$old$  for night in select d::date from generate_series(new.date_start::timestamp,(new.date_end-1)::timestamp,interval '1 day') d loop
   select case when extract(isodow from night) in(6,7) then r.weekend_price else r.weekday_price end into rate from public.stay_room_types r where r.id=new.room_type_id and r.status='active' for share;
   if rate is null or rate<=0 then total:=0; exit; end if;
   total:=total+rate;
  end loop;
  if total>0 then new.unit_price:=ceil(total/(new.date_end-new.date_start)); new.price_status:='quoted'; new.price_basis:='per_unit'; end if;$old$;
  updated:=replace(ddl,replace(old,chr(13),''),$new$  perform 1 from public.stay_room_types r
    where r.id=new.room_type_id and r.property_id=new.property_id and r.status='active' for share;
  if not found then raise exception 'Tipe kamar tidak tersedia.'; end if;
  select sum(q.rate), jsonb_build_object('subtotal',sum(q.rate),'nights',jsonb_agg(to_jsonb(q) order by q.night))
    into total,new.stay_rate_snapshot
    from public.quote_stay_nights(new.room_type_id,new.date_start,new.date_end) q
    having count(*)=new.date_end-new.date_start and min(q.rate)>0;
  if total is null or total*new.quantity>999999999999 then raise exception 'Tarif Stay belum tersedia untuk tanggal, durasi, atau jumlah yang dipilih.'; end if;
  new.unit_price:=round(total/(new.date_end-new.date_start),2);
  new.price_status:='quoted'; new.price_basis:='per_unit';$new$);
  if updated=ddl then raise exception 'Stay pricing trigger differs from reviewed baseline'; end if;
  updated:=replace(updated,'begin'||chr(10)||' if new.service_type', 'begin'||chr(10)||' new.stay_rate_snapshot:=null;'||chr(10)||' if new.service_type');
  if position('new.stay_rate_snapshot:=null;' in updated)=0 then raise exception 'Stay snapshot initialization failed'; end if;
  execute updated;

  ddl:=replace(pg_get_functiondef('public.create_booking_order(text,text,text,text,jsonb)'::regprocedure),chr(13),'');
  updated:=replace(ddl,'price numeric; basis text;','price numeric; basis text; stay_subtotal numeric;');
  updated:=replace(updated,'returning unit_price,price_basis into price,basis;', 'returning unit_price,price_basis,(stay_rate_snapshot->>''subtotal'')::numeric into price,basis,stay_subtotal;');
  updated:=replace(updated,'elsif typ=''stay'' then amount:=amount+price*(end_on-start_on)*qty;', $new$elsif typ='stay' then
      if item ? 'expected_stay_subtotal' and (item->>'expected_stay_subtotal')::numeric is distinct from stay_subtotal then
        raise exception 'Tarif Stay berubah. Perbarui pilihan kamar untuk melihat harga terbaru.';
      end if;
      amount:=amount+coalesce(stay_subtotal,price*(end_on-start_on))*qty;$new$);
  if updated=ddl or position('into price,basis,stay_subtotal' in updated)=0 or position('Tarif Stay berubah.' in updated)=0 or position('stay_subtotal numeric' in updated)=0 then
    raise exception 'Booking subtotal differs from reviewed baseline'; end if;
  execute updated;

  ddl:=replace(pg_get_functiondef('shiap_private.snapshot_service_fees()'::regprocedure),chr(13),'');
  updated:=replace(ddl,'i.unit_price*greatest(i.date_end-i.date_start,1)*i.quantity','coalesce((i.stay_rate_snapshot->>''subtotal'')::numeric,i.unit_price*greatest(i.date_end-i.date_start,1))*i.quantity');
  if ddl=updated then raise exception 'Service Fee subtotal differs from reviewed baseline'; end if;
  execute updated;

  ddl:=replace(pg_get_functiondef('public.finance_snapshot_booking_item(uuid,boolean,text)'::regprocedure),chr(13),'');
  updated:=replace(ddl,'bi.unit_price*nights*bi.quantity','coalesce((bi.stay_rate_snapshot->>''subtotal'')::numeric,bi.unit_price*nights)*bi.quantity');
  if ddl=updated then raise exception 'Finance cost snapshot differs from reviewed baseline'; end if;
  execute updated;

  ddl:=pg_get_viewdef('public.finance_service_profit_v'::regclass,true);
  updated:=replace(ddl,'bi.unit_price * GREATEST(COALESCE(bi.date_end - bi.date_start, 1), 1)::numeric * bi.quantity::numeric',
    'coalesce((bi.stay_rate_snapshot->>''subtotal'')::numeric,bi.unit_price * GREATEST(COALESCE(bi.date_end - bi.date_start, 1), 1)::numeric) * bi.quantity::numeric');
  if ddl=updated then raise exception 'Finance service allocation differs from reviewed baseline'; end if;
  execute 'create or replace view public.finance_service_profit_v with (security_invoker=true) as '||updated;
end $migration$;

-- Validate only new or edited prices, so unrelated edits still work for
-- legacy rows. This also covers direct Admin catalog writes through PostgREST.
create function shiap_private.guard_catalog_rupiah() returns trigger
language plpgsql set search_path='' as $$
declare field text; next_row jsonb:=to_jsonb(new); old_row jsonb; amount numeric; entry jsonb;
begin
  if tg_op='UPDATE' then old_row:=to_jsonb(old); end if;
  foreach field in array tg_argv loop
    if tg_op='UPDATE' and (next_row->field) is not distinct from (old_row->field) then continue; end if;
    if field in ('addons','price_tiers') then
      for entry in select value from jsonb_array_elements(coalesce(nullif(next_row->field,'null'::jsonb),'[]'::jsonb)) as e(value) loop
        amount:=case when field='addons' then (entry->>'price')::numeric
          else coalesce(entry->>'price_per_person',entry->>'price_per_pax')::numeric end;
        if amount is null or amount<=0 or amount>999999999999 or amount<>trunc(amount) then
          raise exception 'Harga tier atau add-on wajib berupa Rupiah bulat di atas nol.' using errcode='23514';
        end if;
      end loop;
    else
      amount:=(next_row->>field)::numeric;
      if amount<0 or amount>999999999999 or amount<>trunc(amount)
        or (tg_table_name='shiap_experiences' and field='base_price' and amount=0 and next_row->>'status'='published' and next_row->>'experience_package_id' is null) then
        raise exception 'Harga wajib berupa nominal Rupiah bulat yang valid.' using errcode='23514';
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function shiap_private.guard_catalog_rupiah() from public, anon, authenticated;

create trigger trip_catalog_rupiah before insert or update on public.trip_packages
  for each row execute function shiap_private.guard_catalog_rupiah('base_price','minimum_package_price','price_tiers');
create trigger trip_departure_rupiah before insert or update on public.trip_departures
  for each row execute function shiap_private.guard_catalog_rupiah('price_per_person');
create trigger stay_catalog_rupiah before insert or update on public.stay_room_types
  for each row execute function shiap_private.guard_catalog_rupiah('weekday_price','weekend_price','extra_bed_price','extra_guest_price');
create trigger experience_catalog_rupiah before insert or update on public.shiap_experiences
  for each row execute function shiap_private.guard_catalog_rupiah('base_price','addons');
create trigger experience_package_rupiah before insert or update on public.shiap_experience_packages
  for each row execute function shiap_private.guard_catalog_rupiah('price');
create trigger experience_addon_rupiah before insert or update on public.shiap_experience_addons
  for each row execute function shiap_private.guard_catalog_rupiah('price');

commit;
