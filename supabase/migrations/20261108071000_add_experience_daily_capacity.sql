-- Optional per-day inventory for fixed-price activities and documentation.
-- Capacity is held by pending/confirmed booking rows and released by existing
-- booking status transitions; Trip/Stay inventory logic remains untouched.
begin;

alter table public.shiap_experiences
  add column daily_capacity integer check (daily_capacity is null or daily_capacity > 0);

create or replace function public.apply_booking_item_price()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare night date; rate numeric; total numeric:=0; service_row public.shiap_experiences%rowtype; used_capacity integer;
begin
 if new.service_type='trip' and new.trip_id is not null then
  if new.departure_id is not null then
   select d.price_per_person into rate from public.trip_departures d where d.id=new.departure_id and d.trip_id=new.trip_id and d.status in('open','full') for share;
   if rate is not null and rate>0 then new.unit_price:=rate; new.price_status:='quoted'; new.price_basis:='per_person'; end if;
  elsif coalesce(new.variant,'') ilike '%private%' then
   select q.effective_price_per_person into rate from public.calculate_private_trip_quote(new.trip_id,new.guests) q;
   if rate is not null and rate>0 then new.unit_price:=rate; new.price_status:='quoted'; new.price_basis:='per_person'; end if;
  end if;
 elsif new.service_type='stay' and new.room_type_id is not null and new.date_end>new.date_start then
  for night in select d::date from generate_series(new.date_start::timestamp,(new.date_end-1)::timestamp,interval '1 day') d loop
   select case when extract(isodow from night) in(6,7) then r.weekend_price else r.weekday_price end into rate from public.stay_room_types r where r.id=new.room_type_id and r.status='active' for share;
   if rate is null or rate<=0 then total:=0; exit; end if;
   total:=total+rate;
  end loop;
  if total>0 then new.unit_price:=ceil(total/(new.date_end-new.date_start)); new.price_status:='quoted'; new.price_basis:='per_unit'; end if;
 elsif new.service_type in ('activity','documentation') then
  if new.service_catalog_id is null then raise exception 'Pilih layanan yang tersedia di katalog SHIAP.'; end if;
  select * into service_row from public.shiap_experiences where id=new.service_catalog_id and experience_type=new.service_type and status='published' for share;
  if not found then raise exception 'Layanan ini tidak tersedia atau belum dipublikasikan.'; end if;
  if new.quantity < service_row.min_quantity or new.quantity > service_row.max_quantity then raise exception 'Jumlah layanan di luar batas yang tersedia.'; end if;
  if service_row.daily_capacity is not null then
   perform pg_advisory_xact_lock(hashtextextended(new.service_catalog_id::text || ':' || new.date_start::text,0));
   select coalesce(sum(case when i.price_basis='per_person' then i.guests*i.quantity else i.quantity end),0)::integer into used_capacity
   from public.booking_items i join public.booking_orders b on b.id=i.booking_id
   where i.service_catalog_id=new.service_catalog_id and i.date_start=new.date_start and b.order_status in('pending_confirmation','confirmed');
   if used_capacity + (case when service_row.price_basis='per_person' then new.guests*new.quantity else new.quantity end) > service_row.daily_capacity then
    raise exception 'Kapasitas harian layanan tidak mencukupi untuk tanggal yang dipilih.';
   end if;
  end if;
  new.service_name:=service_row.title;
  new.variant:=coalesce(new.variant,nullif(service_row.duration,''));
  new.unit_price:=service_row.base_price;
  new.price_basis:=service_row.price_basis;
  new.price_status:='quoted';
 end if;
 return new;
end $$;

commit;
