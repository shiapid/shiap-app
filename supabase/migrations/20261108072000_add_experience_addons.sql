-- Structured, server-priced addons for activities and documentation catalog.
begin;

alter table public.shiap_experiences
  add column addons jsonb not null default '[]'::jsonb check (jsonb_typeof(addons)='array');
alter table public.booking_items
  add column selected_addons jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_addons)='array');

create or replace function public.apply_booking_item_price()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare
 night date; rate numeric; total numeric:=0; service_row public.shiap_experiences%rowtype;
 used_capacity integer; addon_input jsonb; addon_record jsonb; addon_id text; addon_total numeric:=0;
 addon_seen text[]:='{}'; sanitized_addons jsonb:='[]'::jsonb;
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
  if jsonb_typeof(coalesce(new.selected_addons,'[]'::jsonb))<>'array' then raise exception 'Pilihan add-on tidak valid.'; end if;
  for addon_input in select value from jsonb_array_elements(coalesce(new.selected_addons,'[]'::jsonb)) as e(value) loop
   addon_id:=nullif(addon_input->>'id','');
   if addon_id is null or addon_id=any(addon_seen) then raise exception 'Pilihan add-on tidak valid atau terduplikasi.'; end if;
   select value into addon_record from jsonb_array_elements(service_row.addons) as e(value) where value->>'id'=addon_id limit 1;
   if addon_record is null then raise exception 'Add-on tidak tersedia pada layanan ini.'; end if;
   if coalesce((addon_record->>'price')::numeric,0)<=0 then raise exception 'Harga add-on belum valid.'; end if;
   addon_seen:=array_append(addon_seen,addon_id);
   addon_total:=addon_total+(addon_record->>'price')::numeric;
   sanitized_addons:=sanitized_addons||jsonb_build_array(jsonb_build_object('id',addon_id,'name',addon_record->>'name','price',(addon_record->>'price')::numeric));
  end loop;
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
  new.selected_addons:=sanitized_addons;
  new.unit_price:=service_row.base_price+addon_total;
  new.price_basis:=service_row.price_basis;
  new.price_status:='quoted';
 end if;
 return new;
end $$;

commit;
