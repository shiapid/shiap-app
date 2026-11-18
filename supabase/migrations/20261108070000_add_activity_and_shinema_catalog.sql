-- Add priced activities and documentation services to the local SHIAP catalog.
-- Booking creation remains the existing atomic RPC; trip and stay inventory
-- triggers and locking behavior are intentionally preserved.
begin;

create table public.shiap_experiences (
  id uuid primary key default gen_random_uuid(),
  experience_type text not null check (experience_type in ('activity','documentation')),
  title text not null,
  slug text not null unique,
  short_description text,
  description text,
  duration text,
  location text not null default 'Kotabaru, Kalimantan Selatan',
  base_price numeric(14,2) not null default 0 check (base_price >= 0),
  price_basis text not null default 'per_unit' check (price_basis in ('per_person','per_unit')),
  price_unit_label text not null default 'paket',
  min_quantity integer not null default 1 check (min_quantity > 0),
  max_quantity integer not null default 20 check (max_quantity >= min_quantity),
  highlights text[] not null default '{}',
  inclusions text[] not null default '{}',
  cover_image_url text,
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or base_price > 0)
);
create index shiap_experiences_type_status_idx on public.shiap_experiences(experience_type,status,featured desc);

alter table public.booking_items
  add column service_catalog_id uuid references public.shiap_experiences(id) on delete restrict,
  add column price_basis text not null default 'per_unit' check(price_basis in ('per_person','per_unit'));

alter table public.shiap_experiences enable row level security;
revoke all on public.shiap_experiences from anon, authenticated;
grant select on public.shiap_experiences to anon, authenticated;
grant insert, update, delete on public.shiap_experiences to authenticated;
create policy shiap_experiences_public_read on public.shiap_experiences
  for select to anon, authenticated using (status='published' or public.is_shiap_admin());
create policy shiap_experiences_admin_write on public.shiap_experiences
  for all to authenticated using (public.is_shiap_admin()) with check (public.is_shiap_admin());
grant all on public.shiap_experiences to service_role;

create or replace function public.apply_booking_item_price()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare night date; rate numeric; total numeric:=0; service_row public.shiap_experiences%rowtype;
begin
 if new.service_type='trip' and new.trip_id is not null then
  if new.departure_id is not null then
   select d.price_per_person into rate from public.trip_departures d where d.id=new.departure_id and d.trip_id=new.trip_id and d.status='open' for share;
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
  new.service_name:=service_row.title;
  new.variant:=coalesce(new.variant,nullif(service_row.duration,''));
  new.unit_price:=service_row.base_price;
  new.price_basis:=service_row.price_basis;
  new.price_status:='quoted';
 end if;
 return new;
end $$;

-- Keep the established create_booking_order signature and inventory checks.
create or replace function public.create_booking_order(p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,p_items jsonb)
returns table(id uuid,order_number text)
language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); oid uuid; onum text; item jsonb; typ text; tid uuid; did uuid; pid uuid; rid uuid; service_id uuid;
 start_on date; end_on date; qty integer; pax integer; seats integer; max_seats integer; units integer; used_units integer;
 price numeric; basis text; amount numeric:=0;
begin
 if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if nullif(trim(p_customer_name),'') is null or nullif(trim(p_customer_whatsapp),'') is null then raise exception 'Nama dan nomor WhatsApp wajib diisi.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Daftar layanan tidak valid.'; end if;
 onum:='SH-'||to_char(clock_timestamp() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.booking_orders(order_number,user_id,customer_name,customer_whatsapp,customer_email,customer_notes)
 values(onum,uid,trim(p_customer_name),trim(p_customer_whatsapp),nullif(trim(p_customer_email),''),nullif(trim(p_customer_notes),'')) returning booking_orders.id into oid;
 for item in select value from jsonb_array_elements(p_items) as e(value) loop
  typ:=item->>'service_type';
  if typ not in('trip','stay','activity','documentation','other') then raise exception 'Jenis layanan tidak valid.'; end if;
  start_on:=nullif(item->>'date_start','')::date; end_on:=nullif(item->>'date_end','')::date;
  qty:=coalesce(nullif(item->>'quantity','')::integer,1); pax:=coalesce(nullif(item->>'guests','')::integer,1);
  if start_on is null or start_on<current_date or qty<1 or qty>20 or pax<1 or pax>100 then raise exception 'Tanggal atau jumlah layanan tidak valid.'; end if;
  if typ='stay' and (end_on is null or end_on<=start_on) then raise exception 'Tanggal check-out harus setelah check-in.'; end if;
  tid:=nullif(item->>'trip_id','')::uuid; did:=nullif(item->>'departure_id','')::uuid; pid:=nullif(item->>'property_id','')::uuid; rid:=nullif(item->>'room_type_id','')::uuid;
  service_id:=nullif(item->>'service_catalog_id','')::uuid;
  if typ='trip' and tid is not null then
   if did is not null then
    select d.booked_seats,d.max_participants into seats,max_seats from public.trip_departures d join public.trip_packages p on p.id=d.trip_id and p.status='published'
    where d.id=did and d.trip_id=tid and d.status='open' for update of d;
    if not found then raise exception 'Jadwal trip tidak tersedia.'; end if;
    if seats+pax>max_seats then raise exception 'Kapasitas jadwal tidak mencukupi.'; end if;
    update public.trip_departures set booked_seats=booked_seats+pax where trip_departures.id=did;
   elsif not exists(select 1 from public.trip_packages p where p.id=tid and p.status='published') then raise exception 'Paket trip tidak tersedia.';
   end if;
  elsif typ='stay' and rid is not null then
   perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
   select r.total_units into units from public.stay_room_types r join public.stay_properties p on p.id=r.property_id where r.id=rid and r.property_id=pid and r.status='active' and p.status='published';
   if not found then raise exception 'Tipe kamar tidak tersedia.'; end if;
   if pax>qty*(select capacity from public.stay_room_types where stay_room_types.id=rid) then raise exception 'Jumlah tamu melebihi kapasitas kamar.'; end if;
   select coalesce(sum(i.quantity),0)::integer into used_units from public.booking_items i join public.booking_orders b on b.id=i.booking_id
   where i.room_type_id=rid and i.date_start<end_on and i.date_end>start_on and b.order_status in('pending_confirmation','confirmed');
   if used_units+qty>units then raise exception 'Ketersediaan kamar tidak mencukupi.'; end if;
  elsif typ in ('activity','documentation') then
   if service_id is null then raise exception 'Pilih layanan yang tersedia di katalog SHIAP.'; end if;
  end if;
  insert into public.booking_items(booking_id,service_type,service_name,variant,date_start,date_end,quantity,guests,notes,trip_id,departure_id,property_id,room_type_id,service_catalog_id)
  values(oid,typ,coalesce(nullif(trim(item->>'service_name'),''),'Layanan SHIAP'),nullif(trim(item->>'variant'),''),start_on,end_on,qty,pax,nullif(trim(item->>'notes'),''),tid,did,pid,rid,service_id)
  returning unit_price,price_basis into price,basis;
  if price is null or price<=0 then raise exception 'Harga layanan belum tersedia. Silakan hubungi SHIAP.'; end if;
  if typ='trip' and did is not null then update public.trip_departures set status='full' where trip_departures.id=did and booked_seats>=max_participants; end if;
  if typ='trip' or basis='per_person' then amount:=amount+price*pax*qty;
  elsif typ='stay' then amount:=amount+price*(end_on-start_on)*qty;
  else amount:=amount+price*qty; end if;
 end loop;
 update public.booking_orders set total_amount=amount where booking_orders.id=oid;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,to_status,note) values(oid,uid,'customer','booking_created','pending_confirmation','Permintaan booking dibuat.');
 return query select oid,onum;
end $$;
revoke all on function public.create_booking_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_booking_order(text,text,text,text,jsonb) to authenticated;

commit;
