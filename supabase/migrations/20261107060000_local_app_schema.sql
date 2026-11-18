-- Fresh SHIAP local application schema based on current app query/RPC contracts.
-- Does not modify the existing legacy bookings RPC or inventory tables.
begin;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, full_name text, whatsapp text, avatar_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table public.trip_packages (
 id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, location text not null,
 categories text[] not null default '{}', trip_modes text[] not null default '{open,private}', duration text,
 short_description text, description text, pricing_model text not null default 'quote', base_price numeric(14,2),
 min_pax integer, max_pax integer, price_tiers jsonb not null default '[]',
 minimum_package_price numeric(14,2) not null default 0 check (minimum_package_price >= 0), youtube_tour_url text,
 status text not null default 'draft' check (status in ('draft','published','archived')), featured boolean not null default false,
 cover_image_url text, gallery_urls text[] not null default '{}', highlights text[] not null default '{}', itinerary jsonb not null default '[]',
 included text[] not null default '{}', excluded text[] not null default '{}', meeting_point text, preparation text[] not null default '{}', notes text[] not null default '{}',
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (min_pax is null or min_pax > 0), check (max_pax is null or max_pax >= coalesce(min_pax,1))
);
create table public.trip_departures (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trip_packages(id) on delete cascade,
 departure_date date not null, end_date date, price_per_person numeric(14,2), min_participants integer not null default 2 check(min_participants>0),
 max_participants integer not null default 10 check(max_participants>0), booked_seats integer not null default 0 check(booked_seats>=0),
 status text not null default 'open' check(status in ('draft','open','full','cancelled')), notes text, created_at timestamptz not null default now(),
 check(end_date is null or end_date>=departure_date), check(max_participants>=min_participants), check(booked_seats<=max_participants)
);
create table public.stay_properties (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, property_type text not null default 'villa', location text not null,
 address text, short_description text, description text, cover_image_url text, gallery_urls text[] not null default '{}', facilities text[] not null default '{}',
 check_in_time time not null default '14:00', check_out_time time not null default '12:00', youtube_tour_url text, featured boolean not null default false,
 status text not null default 'draft' check(status in ('draft','published','archived')), created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.stay_room_types (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stay_properties(id) on delete cascade,
 name text not null, description text, capacity integer not null default 2 check(capacity>0), total_units integer not null default 1 check(total_units>0),
 weekday_price numeric(14,2) not null default 0 check(weekday_price>=0), weekend_price numeric(14,2) not null default 0 check(weekend_price>=0),
 extra_bed_price numeric(14,2) not null default 0 check(extra_bed_price>=0), extra_guest_price numeric(14,2) not null default 0 check(extra_guest_price>=0),
 facilities text[] not null default '{}', gallery_urls text[] not null default '{}', youtube_tour_url text,
 status text not null default 'active' check(status in ('active','inactive')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.booking_orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique, user_id uuid not null references auth.users(id) on delete restrict,
 customer_name text not null, customer_whatsapp text not null, customer_email text, customer_notes text,
 order_status text not null default 'pending_confirmation' check(order_status in ('pending_confirmation','confirmed','rejected','cancelled','completed')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending','paid')),
 total_amount numeric(14,2) not null default 0 check(total_amount>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.booking_items (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.booking_orders(id) on delete cascade,
 service_type text not null, service_name text not null, variant text, date_start date not null, date_end date,
 quantity integer not null default 1 check(quantity>0), guests integer not null default 1 check(guests>0),
 unit_price numeric(14,2) not null default 0 check(unit_price>=0), price_status text not null default 'quote' check(price_status in ('quote','quoted','manual')), notes text,
 trip_id uuid references public.trip_packages(id) on delete set null, departure_id uuid references public.trip_departures(id) on delete set null,
 property_id uuid references public.stay_properties(id) on delete set null, room_type_id uuid references public.stay_room_types(id) on delete set null,
 created_at timestamptz not null default now(), check(date_end is null or date_end>=date_start)
);
create table public.booking_order_events (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.booking_orders(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null, actor_role text not null check(actor_role in ('customer','admin','system')),
 event_type text not null, from_status text, to_status text, note text, created_at timestamptz not null default now()
);
create table public.payment_settings (
 id boolean primary key default true check(id), bank_name text not null default 'Mandiri', account_name text not null default '',
 account_number text not null default '', instructions text not null default '', is_active boolean not null default true,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null
);
insert into public.payment_settings(id) values(true);
create table public.booking_payment_records (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.booking_orders(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete restrict, storage_path text not null unique, original_file_name text not null,
 mime_type text not null, file_size bigint not null check(file_size>0 and file_size<=8388608),
 status text not null default 'pending' check(status in ('pending','approved','rejected')), rejection_reason text,
 submitted_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id) on delete set null
);
create index trip_departures_trip_date_idx on public.trip_departures(trip_id,departure_date);
create index stay_room_types_property_idx on public.stay_room_types(property_id);
create index booking_orders_user_created_idx on public.booking_orders(user_id,created_at desc);
create index booking_items_booking_idx on public.booking_items(booking_id);
create index booking_items_departure_idx on public.booking_items(departure_id) where departure_id is not null;
create index booking_items_room_dates_idx on public.booking_items(room_type_id,date_start,date_end) where room_type_id is not null;
create index booking_events_booking_created_idx on public.booking_order_events(booking_id,created_at desc);
create index booking_payments_booking_submitted_idx on public.booking_payment_records(booking_id,submitted_at desc);

create or replace function public.is_shiap_admin() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.admin_users a where a.user_id=(select auth.uid())) $$;
revoke all on function public.is_shiap_admin() from public;
grant execute on function public.is_shiap_admin() to authenticated;
create or replace function public.handle_new_shiap_user() returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.profiles(id,full_name) values(new.id,nullif(new.raw_user_meta_data->>'full_name','')) on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created_shiap_profile after insert on auth.users for each row execute function public.handle_new_shiap_user();
create or replace function public.set_shiap_updated_at() returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at:=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','trip_packages','stay_properties','stay_room_types','booking_orders','payment_settings'] loop
 execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_shiap_updated_at()',t); end loop; end $$;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.trip_packages enable row level security;
alter table public.trip_departures enable row level security;
alter table public.stay_properties enable row level security;
alter table public.stay_room_types enable row level security;
alter table public.booking_orders enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_order_events enable row level security;
alter table public.payment_settings enable row level security;
alter table public.booking_payment_records enable row level security;
create policy profiles_read_self on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_shiap_admin());
create policy profiles_insert_self on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy admin_users_read_admin on public.admin_users for select to authenticated using(public.is_shiap_admin());
create policy trip_packages_public_read on public.trip_packages for select to anon,authenticated using(status='published' or public.is_shiap_admin());
create policy trip_packages_admin_write on public.trip_packages for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy trip_departures_public_read on public.trip_departures for select to anon,authenticated using((status='open' and exists(select 1 from public.trip_packages p where p.id=trip_id and p.status='published')) or public.is_shiap_admin());
create policy trip_departures_admin_write on public.trip_departures for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy stay_properties_public_read on public.stay_properties for select to anon,authenticated using(status='published' or public.is_shiap_admin());
create policy stay_properties_admin_write on public.stay_properties for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy stay_rooms_public_read on public.stay_room_types for select to anon,authenticated using((status='active' and exists(select 1 from public.stay_properties p where p.id=property_id and p.status='published')) or public.is_shiap_admin());
create policy stay_rooms_admin_write on public.stay_room_types for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy booking_orders_owner_read on public.booking_orders for select to authenticated using(user_id=(select auth.uid()) or public.is_shiap_admin());
create policy booking_orders_admin_all on public.booking_orders for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy booking_items_owner_read on public.booking_items for select to authenticated using(exists(select 1 from public.booking_orders b where b.id=booking_id and (b.user_id=(select auth.uid()) or public.is_shiap_admin())));
create policy booking_items_admin_all on public.booking_items for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy booking_events_owner_read on public.booking_order_events for select to authenticated using(exists(select 1 from public.booking_orders b where b.id=booking_id and (b.user_id=(select auth.uid()) or public.is_shiap_admin())));
create policy booking_events_admin_all on public.booking_order_events for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy payment_settings_read_active on public.payment_settings for select to anon,authenticated using(is_active or public.is_shiap_admin());
create policy payment_settings_admin_write on public.payment_settings for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy payment_records_owner_read on public.booking_payment_records for select to authenticated using(user_id=(select auth.uid()) or public.is_shiap_admin());
create policy payment_records_admin_all on public.booking_payment_records for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
revoke all on public.profiles,public.admin_users,public.trip_packages,public.trip_departures,public.stay_properties,public.stay_room_types,public.booking_orders,public.booking_items,public.booking_order_events,public.payment_settings,public.booking_payment_records from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select on public.admin_users to authenticated;
grant select on public.trip_packages,public.trip_departures,public.stay_properties,public.stay_room_types to anon,authenticated;
grant insert,update,delete on public.trip_packages,public.trip_departures,public.stay_properties,public.stay_room_types to authenticated;
grant select on public.booking_orders,public.booking_items,public.booking_order_events,public.booking_payment_records to authenticated;
grant select on public.payment_settings to anon,authenticated;
grant update on public.payment_settings to authenticated;
grant all on public.profiles,public.admin_users,public.trip_packages,public.trip_departures,public.stay_properties,public.stay_room_types,public.booking_orders,public.booking_items,public.booking_order_events,public.payment_settings,public.booking_payment_records to service_role;

create or replace function public.calculate_private_trip_quote(p_trip_id uuid,p_pax integer)
returns table(trip_id uuid,pax integer,tier_min_pax integer,tier_max_pax integer,tier_price_per_person numeric,minimum_package_price numeric,total_price numeric,effective_price_per_person numeric)
language plpgsql stable security invoker set search_path=public
as $$
declare t public.trip_packages%rowtype; tier jsonb; lo integer; hi integer; rate numeric; total numeric;
begin
 if p_pax is null or p_pax<1 then raise exception 'Jumlah peserta tidak valid'; end if;
 select * into t from public.trip_packages where id=p_trip_id and status='published';
 if not found then raise exception 'Paket trip tidak ditemukan atau belum dipublikasikan'; end if;
 if p_pax<coalesce(t.min_pax,1) or (t.max_pax is not null and p_pax>t.max_pax) then raise exception 'Jumlah peserta di luar batas paket'; end if;
 select e.value into tier from jsonb_array_elements(coalesce(t.price_tiers,'[]')) e(value)
 where p_pax between coalesce((e.value->>'min_pax')::integer,(e.value->>'minPax')::integer,1) and coalesce((e.value->>'max_pax')::integer,(e.value->>'maxPax')::integer,999999)
 order by coalesce((e.value->>'min_pax')::integer,(e.value->>'minPax')::integer,1) desc limit 1;
 if tier is null then raise exception 'Tier harga tidak tersedia untuk jumlah peserta ini'; end if;
 lo:=coalesce((tier->>'min_pax')::integer,(tier->>'minPax')::integer,1); hi:=coalesce((tier->>'max_pax')::integer,(tier->>'maxPax')::integer,999999);
 rate:=coalesce((tier->>'price_per_person')::numeric,(tier->>'price_per_pax')::numeric,(tier->>'price')::numeric,0);
 if rate<=0 then raise exception 'Harga tier tidak valid'; end if;
 total:=greatest(coalesce(t.minimum_package_price,0),p_pax*rate);
 return query select t.id,p_pax,lo,hi,rate,coalesce(t.minimum_package_price,0),total,ceil(total/p_pax);
end $$;
grant execute on function public.calculate_private_trip_quote(uuid,integer) to anon,authenticated;

-- Same additive pricing trigger as V1.4; booking creation remains its own RPC.
create or replace function public.apply_booking_item_price()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare night date; rate numeric; total numeric:=0;
begin
 if new.service_type='trip' and new.trip_id is not null then
  if new.departure_id is not null then
   select d.price_per_person into rate from public.trip_departures d where d.id=new.departure_id and d.trip_id=new.trip_id and d.status='open' for share;
   if rate is not null and rate>0 then new.unit_price:=rate; new.price_status:='quoted'; end if;
  elsif coalesce(new.variant,'') ilike '%private%' then
   select q.effective_price_per_person into rate from public.calculate_private_trip_quote(new.trip_id,new.guests) q;
   if rate is not null and rate>0 then new.unit_price:=rate; new.price_status:='quoted'; end if;
  end if;
 elsif new.service_type='stay' and new.room_type_id is not null and new.date_end>new.date_start then
  for night in select d::date from generate_series(new.date_start::timestamp,(new.date_end-1)::timestamp,interval '1 day') d loop
   select case when extract(isodow from night) in(6,7) then r.weekend_price else r.weekday_price end into rate
   from public.stay_room_types r where r.id=new.room_type_id and r.status='active' for share;
   if rate is null or rate<=0 then total:=0; exit; end if;
   total:=total+rate;
  end loop;
  if total>0 then new.unit_price:=ceil(total/(new.date_end-new.date_start)); new.price_status:='quoted'; end if;
 end if;
 return new;
end $$;
create trigger booking_items_apply_automatic_price before insert on public.booking_items for each row execute function public.apply_booking_item_price();

-- Atomic booking submission: serialize departure capacity via row lock and stay capacity by room advisory lock.
create or replace function public.create_booking_order(p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,p_items jsonb)
returns table(id uuid,order_number text)
language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); oid uuid; onum text; item jsonb; typ text; tid uuid; did uuid; pid uuid; rid uuid;
 start_on date; end_on date; qty integer; pax integer; seats integer; max_seats integer; units integer; used_units integer;
 price numeric; amount numeric:=0;
begin
 if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if nullif(trim(p_customer_name),'') is null or nullif(trim(p_customer_whatsapp),'') is null then raise exception 'Nama dan nomor WhatsApp wajib diisi.'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Daftar layanan tidak valid.'; end if;
 onum:='SH-'||to_char(clock_timestamp() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.booking_orders(order_number,user_id,customer_name,customer_whatsapp,customer_email,customer_notes)
 values(onum,uid,trim(p_customer_name),trim(p_customer_whatsapp),nullif(trim(p_customer_email),''),nullif(trim(p_customer_notes),'')) returning booking_orders.id into oid;
 for item in select value from jsonb_array_elements(p_items) as e(value) loop
  typ:=item->>'service_type';
  if typ not in('trip','stay','activity','documentation','other') then raise exception 'Jenis layanan tidak valid.'; end if;
  start_on:=nullif(item->>'date_start','')::date; end_on:=nullif(item->>'date_end','')::date;
  qty:=coalesce(nullif(item->>'quantity','')::integer,1); pax:=coalesce(nullif(item->>'guests','')::integer,1);
  if start_on is null or qty<1 or qty>20 or pax<1 or pax>100 then raise exception 'Tanggal atau jumlah layanan tidak valid.'; end if;
  if typ='stay' and (end_on is null or end_on<=start_on) then raise exception 'Tanggal check-out harus setelah check-in.'; end if;
  tid:=nullif(item->>'trip_id','')::uuid; did:=nullif(item->>'departure_id','')::uuid; pid:=nullif(item->>'property_id','')::uuid; rid:=nullif(item->>'room_type_id','')::uuid;
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
   select r.total_units into units from public.stay_room_types r join public.stay_properties p on p.id=r.property_id
   where r.id=rid and r.property_id=pid and r.status='active' and p.status='published';
   if not found then raise exception 'Tipe kamar tidak tersedia.'; end if;
   if pax>qty*(select capacity from public.stay_room_types where stay_room_types.id=rid) then raise exception 'Jumlah tamu melebihi kapasitas kamar.'; end if;
   select coalesce(sum(i.quantity),0)::integer into used_units from public.booking_items i join public.booking_orders b on b.id=i.booking_id
   where i.room_type_id=rid and i.date_start<end_on and i.date_end>start_on and b.order_status in('pending_confirmation','confirmed');
   if used_units+qty>units then raise exception 'Ketersediaan kamar tidak mencukupi.'; end if;
  end if;
  insert into public.booking_items(booking_id,service_type,service_name,variant,date_start,date_end,quantity,guests,notes,trip_id,departure_id,property_id,room_type_id)
  values(oid,typ,coalesce(nullif(trim(item->>'service_name'),''),'Layanan SHIAP'),nullif(trim(item->>'variant'),''),start_on,end_on,qty,pax,nullif(trim(item->>'notes'),''),tid,did,pid,rid)
  returning unit_price into price;
  if typ='trip' and did is not null then update public.trip_departures set status='full' where trip_departures.id=did and booked_seats>=max_participants; end if;
  if typ='trip' then amount:=amount+price*pax*qty; elsif typ='stay' then amount:=amount+price*(end_on-start_on)*qty; else amount:=amount+price*qty; end if;
 end loop;
 update public.booking_orders set total_amount=amount where booking_orders.id=oid;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,to_status,note) values(oid,uid,'customer','booking_created','pending_confirmation','Permintaan booking dibuat.');
 return query select oid,onum;
end $$;
revoke all on function public.create_booking_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_booking_order(text,text,text,text,jsonb) to authenticated;

create or replace function public.admin_update_booking_status(p_booking_id uuid,p_new_status text,p_note text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); old_status text; pay_status text; x record;
begin
 if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
 if p_new_status not in('confirmed','rejected','cancelled','completed') then raise exception 'Status booking tidak valid.'; end if;
 select order_status,payment_status into old_status,pay_status from public.booking_orders where id=p_booking_id for update;
 if not found then raise exception 'Booking tidak ditemukan.'; end if;
 if not ((old_status='pending_confirmation' and p_new_status in('confirmed','rejected','cancelled')) or (old_status='confirmed' and p_new_status in('completed','cancelled'))) then raise exception 'Perubahan status dari % ke % tidak diizinkan.',old_status,p_new_status; end if;
 if p_new_status='completed' and pay_status<>'paid' then raise exception 'Booking hanya dapat diselesaikan setelah pembayaran diverifikasi.'; end if;
 if p_new_status in('rejected','cancelled') then
  for x in select departure_id,guests from public.booking_items where booking_id=p_booking_id and departure_id is not null loop
   update public.trip_departures set booked_seats=greatest(0,booked_seats-x.guests),status=case when status='full' then 'open' else status end where id=x.departure_id;
  end loop;
 end if;
 update public.booking_orders set order_status=p_new_status where id=p_booking_id;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
 values(p_booking_id,admin_id,'admin','booking_status_changed',old_status,p_new_status,nullif(trim(coalesce(p_note,'')),''));
end $$;
revoke all on function public.admin_update_booking_status(uuid,text,text) from public,anon;
grant execute on function public.admin_update_booking_status(uuid,text,text) to authenticated;

create or replace function public.submit_booking_payment_proof(p_booking_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint)
returns uuid language plpgsql security definer set search_path=public,auth,storage
as $$
declare uid uuid:=auth.uid(); rec uuid; status_now text; payment_now text;
begin
 if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if p_mime_type not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Format bukti pembayaran tidak didukung.'; end if;
 if p_file_size is null or p_file_size<=0 or p_file_size>8388608 then raise exception 'Ukuran file maksimal 8 MB.'; end if;
 if split_part(coalesce(p_storage_path,''),'/',1)<>uid::text or split_part(p_storage_path,'/',2)<>p_booking_id::text or split_part(p_storage_path,'/',3)='' then raise exception 'Lokasi file bukti pembayaran tidak valid.'; end if;
 select order_status,payment_status into status_now,payment_now from public.booking_orders where id=p_booking_id and user_id=uid for update;
 if not found then raise exception 'Booking tidak ditemukan atau bukan milik Anda.'; end if;
 if status_now<>'confirmed' then raise exception 'Bukti pembayaran hanya dapat dikirim setelah booking dikonfirmasi.'; end if;
 if payment_now='paid' then raise exception 'Pembayaran booking ini sudah diverifikasi.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='booking-payment-proofs' and name=p_storage_path) then raise exception 'File bukti pembayaran belum ditemukan di penyimpanan.'; end if;
 insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
 values(p_booking_id,uid,p_storage_path,left(coalesce(p_file_name,'bukti-pembayaran'),255),p_mime_type,p_file_size) returning id into rec;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note) values(p_booking_id,uid,'customer','payment_proof_submitted','Customer mengirim bukti pembayaran.');
 update public.booking_orders set payment_status='pending' where id=p_booking_id;
 return rec;
end $$;
revoke all on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) to authenticated;

create or replace function public.admin_review_booking_payment(p_payment_record_id uuid,p_decision text,p_rejection_reason text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); booking uuid; old_state text;
begin
 if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
 if p_decision not in('approved','rejected') then raise exception 'Keputusan pembayaran tidak valid.'; end if;
 if p_decision='rejected' and length(trim(coalesce(p_rejection_reason,'')))<3 then raise exception 'Alasan penolakan minimal 3 karakter.'; end if;
 select booking_id,status into booking,old_state from public.booking_payment_records where id=p_payment_record_id for update;
 if not found then raise exception 'Bukti pembayaran tidak ditemukan.'; end if;
 if old_state<>'pending' then raise exception 'Bukti pembayaran sudah ditinjau.'; end if;
 update public.booking_payment_records set status=p_decision,rejection_reason=case when p_decision='rejected' then trim(p_rejection_reason) else null end,reviewed_at=now(),reviewed_by=admin_id where id=p_payment_record_id;
 if p_decision='approved' then update public.booking_orders set payment_status='paid' where id=booking;
 elsif not exists(select 1 from public.booking_payment_records where booking_id=booking and id<>p_payment_record_id and status='pending') then update public.booking_orders set payment_status='unpaid' where id=booking and payment_status='pending'; end if;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
 values(booking,admin_id,'admin','payment_'||p_decision,case when p_decision='rejected' then trim(p_rejection_reason) else 'Bukti pembayaran disetujui.' end);
end $$;
revoke all on function public.admin_review_booking_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_booking_payment(uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shiap-catalog-images','shiap-catalog-images',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('booking-payment-proofs','booking-payment-proofs',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy shiap_catalog_images_public_read on storage.objects for select to anon,authenticated using(bucket_id='shiap-catalog-images');
create policy shiap_catalog_images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='shiap-catalog-images' and public.is_shiap_admin());
create policy shiap_catalog_images_admin_update on storage.objects for update to authenticated using(bucket_id='shiap-catalog-images' and public.is_shiap_admin()) with check(bucket_id='shiap-catalog-images' and public.is_shiap_admin());
create policy shiap_catalog_images_admin_delete on storage.objects for delete to authenticated using(bucket_id='shiap-catalog-images' and public.is_shiap_admin());
create policy booking_proofs_owner_insert on storage.objects for insert to authenticated with check(
 bucket_id='booking-payment-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.booking_orders b where b.id=((storage.foldername(name))[2])::uuid and b.user_id=(select auth.uid()) and b.order_status='confirmed' and b.payment_status<>'paid')
);
create policy booking_proofs_owner_read on storage.objects for select to authenticated using(bucket_id='booking-payment-proofs' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_shiap_admin()));
create policy booking_proofs_owner_delete on storage.objects for delete to authenticated using(bucket_id='booking-payment-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);

comment on function public.create_booking_order(text,text,text,text,jsonb) is 'Creates a booking with serialized trip-seat holds and date-range stay availability checks.';
comment on table public.booking_items is 'Local SHIAP V1.4 pricing input. Customer booking inserts are restricted to create_booking_order.';
commit;
