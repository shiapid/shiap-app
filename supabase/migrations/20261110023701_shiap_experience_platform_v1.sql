-- SHIAP Experience V1: additive catalog + booking metadata.
-- Existing booking RPC and its inventory hold remain the source of truth.
begin;

create table public.shiap_experience_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shiap_experience_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.shiap_experience_categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  tagline text not null default '',
  description text not null default '',
  duration text not null default '',
  location_label text not null default 'Lokasi dikonfirmasi setelah permintaan diterima',
  cover_image_url text,
  gallery_urls text[] not null default '{}',
  highlights text[] not null default '{}',
  inclusions text[] not null default '{}',
  exclusions text[] not null default '{}',
  prerequisites text[] not null default '{}',
  safety_information text[] not null default '{}',
  cancellation_policy text not null default 'Ketentuan dikonfirmasi oleh admin sebelum pembayaran.',
  faq jsonb not null default '[]'::jsonb check(jsonb_typeof(faq)='array'),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  is_demo boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shiap_experience_products_category_idx on public.shiap_experience_products(category_id,status,sort_order);

create table public.shiap_experience_packages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shiap_experience_products(id) on delete cascade,
  catalog_service_id uuid not null unique references public.shiap_experiences(id) on delete restrict,
  slug text not null,
  title text not null,
  description text not null default '',
  duration text not null default '',
  price numeric(14,2) not null check(price>=0),
  pricing_basis text not null check(pricing_basis in ('per_person','per_couple','per_group','per_session','fixed_package')),
  price_label text not null default 'paket',
  booking_mode text not null default 'request_to_book' check(booking_mode in ('scheduled_session','private_session','package_booking','request_to_book')),
  min_guests integer not null default 1 check(min_guests between 1 and 100),
  max_guests integer not null default 20 check(max_guests between min_guests and 100),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  requires_manual_approval boolean not null default false,
  is_demo boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,slug)
);
create index shiap_experience_packages_product_idx on public.shiap_experience_packages(product_id,status,sort_order);

alter table public.shiap_experiences add column experience_package_id uuid unique;
alter table public.shiap_experiences add constraint shiap_experiences_package_fk
  foreign key(experience_package_id) references public.shiap_experience_packages(id) on delete set null;

create table public.shiap_experience_addons (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.shiap_experience_packages(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  price numeric(14,2) not null default 0 check(price>=0),
  pricing_basis text not null default 'package' check(pricing_basis in ('participant','package')),
  is_active boolean not null default true,
  is_demo boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(package_id,slug)
);

create table public.shiap_experience_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  resource_type text not null check(resource_type in ('instructor','crew','equipment','vehicle','venue','other')),
  verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','inactive')),
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shiap_experience_sessions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.shiap_experience_packages(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check(capacity between 1 and 100),
  status text not null default 'draft' check(status in ('draft','open','full','cancelled')),
  location_note text not null default 'Lokasi belum dikonfirmasi',
  weather_status text not null default 'pending' check(weather_status in ('not_required','pending','approved','blocked')),
  safety_plan_verified boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create index shiap_experience_sessions_package_start_idx on public.shiap_experience_sessions(package_id,starts_at) where status='open';

create table public.shiap_experience_session_resources (
  session_id uuid not null references public.shiap_experience_sessions(id) on delete cascade,
  resource_id uuid not null references public.shiap_experience_resources(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key(session_id,resource_id)
);

alter table public.booking_orders add column payment_enabled boolean not null default true;
comment on column public.booking_orders.payment_enabled is 'False while a request-to-book awaits admin approval; used to gate customer payment.';

create table public.shiap_experience_booking_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_orders(id) on delete cascade,
  booking_item_id uuid not null unique references public.booking_items(id) on delete cascade,
  product_id uuid not null references public.shiap_experience_products(id) on delete restrict,
  package_id uuid not null references public.shiap_experience_packages(id) on delete restrict,
  session_id uuid references public.shiap_experience_sessions(id) on delete restrict,
  booking_mode text not null check(booking_mode in ('scheduled_session','private_session','package_booking','request_to_book')),
  request_status text not null default 'not_required' check(request_status in ('not_required','pending','approved','rejected')),
  participant_count integer not null check(participant_count between 1 and 100),
  participant_data jsonb not null default '[]'::jsonb check(jsonb_typeof(participant_data)='array'),
  selected_addons jsonb not null default '[]'::jsonb check(jsonb_typeof(selected_addons)='array'),
  request_details jsonb not null default '{}'::jsonb check(jsonb_typeof(request_details)='object' and octet_length(request_details::text)<=12000),
  safety_consent_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now()
);
create index shiap_experience_booking_records_booking_idx on public.shiap_experience_booking_records(booking_id);
create index shiap_experience_booking_records_session_idx on public.shiap_experience_booking_records(session_id) where session_id is not null;

create or replace function public.sync_shiap_experience_package_catalog()
returns trigger language plpgsql security definer set search_path=''
as $$
declare p public.shiap_experience_products%rowtype;
begin
  select * into p from public.shiap_experience_products where id=new.product_id;
  update public.shiap_experiences e set
    experience_type='activity',catalog_category='activity',experience_package_id=new.id,
    title=p.title||' — '||new.title,slug=p.slug||'-'||new.slug,
    short_description=left(coalesce(nullif(new.description,''),p.tagline,p.description),240),
    description=coalesce(nullif(new.description,''),p.description),duration=coalesce(nullif(new.duration,''),p.duration),
    location=p.location_label,base_price=new.price,
    price_basis=case when new.pricing_basis='per_person' then 'per_person' else 'per_unit' end,
    price_unit_label=new.price_label,status=case when p.status='published' and new.status='published' then 'published' else 'draft' end,
    updated_at=now()
  where e.id=new.catalog_service_id;
  return new;
end $$;
create trigger shiap_experience_package_catalog_sync after insert or update on public.shiap_experience_packages
for each row execute function public.sync_shiap_experience_package_catalog();

create or replace function public.sync_shiap_experience_product_catalog()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  update public.shiap_experiences e set
    title=new.title||' — '||k.title,slug=new.slug||'-'||k.slug,
    short_description=left(coalesce(nullif(k.description,''),new.tagline,new.description),240),
    description=coalesce(nullif(k.description,''),new.description),duration=coalesce(nullif(k.duration,''),new.duration),
    location=new.location_label,cover_image_url=new.cover_image_url,
    status=case when new.status='published' and k.status='published' then 'published' else 'draft' end,
    updated_at=now()
  from public.shiap_experience_packages k where k.product_id=new.id and e.id=k.catalog_service_id;
  return new;
end $$;
create trigger shiap_experience_product_catalog_sync after update on public.shiap_experience_products
for each row execute function public.sync_shiap_experience_product_catalog();

create or replace function public.sync_shiap_experience_addons_catalog()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_package_id uuid; service_id uuid; addon_json jsonb;
begin
  v_package_id:=case when tg_op='DELETE' then old.package_id else new.package_id end;
  select k.catalog_service_id into service_id from public.shiap_experience_packages k where k.id=v_package_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.slug,'name',a.name,'price',a.price) order by a.sort_order,a.name),'[]'::jsonb)
    into addon_json from public.shiap_experience_addons a where a.package_id=v_package_id and a.is_active;
  update public.shiap_experiences set addons=addon_json where id=service_id;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger shiap_experience_addon_catalog_sync after insert or update or delete on public.shiap_experience_addons
for each row execute function public.sync_shiap_experience_addons_catalog();
revoke all on function public.sync_shiap_experience_package_catalog() from public,anon,authenticated;
revoke all on function public.sync_shiap_experience_product_catalog() from public,anon,authenticated;
revoke all on function public.sync_shiap_experience_addons_catalog() from public,anon,authenticated;

-- All catalog entities are public-read only; writes are restricted to admins.
alter table public.shiap_experience_categories enable row level security;
alter table public.shiap_experience_products enable row level security;
alter table public.shiap_experience_packages enable row level security;
alter table public.shiap_experience_addons enable row level security;
alter table public.shiap_experience_resources enable row level security;
alter table public.shiap_experience_sessions enable row level security;
alter table public.shiap_experience_session_resources enable row level security;
alter table public.shiap_experience_booking_records enable row level security;

create policy experience_categories_public_read on public.shiap_experience_categories for select to anon,authenticated
using(is_active);
create policy experience_categories_admin_manage on public.shiap_experience_categories for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_products_public_read on public.shiap_experience_products for select to anon,authenticated
using(status='published' and exists(select 1 from public.shiap_experience_categories c where c.id=category_id and c.is_active));
create policy experience_products_admin_manage on public.shiap_experience_products for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_packages_public_read on public.shiap_experience_packages for select to anon,authenticated
using(status='published' and exists(select 1 from public.shiap_experience_products p join public.shiap_experience_categories c on c.id=p.category_id where p.id=product_id and p.status='published' and c.is_active));
create policy experience_packages_admin_manage on public.shiap_experience_packages for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_addons_public_read on public.shiap_experience_addons for select to anon,authenticated
using(is_active and exists(select 1 from public.shiap_experience_packages k join public.shiap_experience_products p on p.id=k.product_id join public.shiap_experience_categories c on c.id=p.category_id where k.id=package_id and k.status='published' and p.status='published' and c.is_active));
create policy experience_addons_admin_manage on public.shiap_experience_addons for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_sessions_public_read on public.shiap_experience_sessions for select to anon,authenticated
using(status='open' and starts_at>now() and exists(select 1 from public.shiap_experience_packages k join public.shiap_experience_products p on p.id=k.product_id join public.shiap_experience_categories c on c.id=p.category_id where k.id=package_id and k.status='published' and p.status='published' and c.is_active));
create policy experience_sessions_admin_manage on public.shiap_experience_sessions for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_resources_admin_manage on public.shiap_experience_resources for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_session_resources_admin_manage on public.shiap_experience_session_resources for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy experience_booking_owner_or_admin_read on public.shiap_experience_booking_records for select to authenticated
using(public.is_shiap_admin() or exists(select 1 from public.booking_orders b where b.id=booking_id and b.user_id=(select auth.uid())));

grant select on public.shiap_experience_categories,public.shiap_experience_products,public.shiap_experience_packages,public.shiap_experience_addons,public.shiap_experience_sessions to anon,authenticated;
grant select,insert,update,delete on public.shiap_experience_categories,public.shiap_experience_products,public.shiap_experience_packages,public.shiap_experience_addons,public.shiap_experience_sessions,public.shiap_experience_resources,public.shiap_experience_session_resources to authenticated;
grant select on public.shiap_experience_resources,public.shiap_experience_session_resources to authenticated;
grant select on public.shiap_experience_booking_records to authenticated;
revoke all on public.shiap_experience_booking_records from anon;

commit;

begin;
create or replace function public.guard_experience_booking_item()
returns trigger language plpgsql set search_path=''
as $$
begin
  if exists(select 1 from public.shiap_experiences e where e.id=new.service_catalog_id and e.experience_package_id is not null)
     and current_setting('shiap.experience_booking_rpc',true) is distinct from 'on' then
    raise exception 'Paket Experience harus dipesan melalui alur Experience.';
  end if;
  return new;
end $$;
create trigger guard_experience_booking_item before insert on public.booking_items
for each row execute function public.guard_experience_booking_item();
revoke all on function public.guard_experience_booking_item() from public,anon,authenticated;

create or replace function public.prepare_experience_booking_item_addons()
returns trigger language plpgsql set search_path=''
as $$
begin
  if exists(select 1 from public.shiap_experiences e where e.id=new.service_catalog_id and e.experience_package_id is not null) then
    if current_setting('shiap.experience_booking_rpc',true) is distinct from 'on' then raise exception 'Paket Experience harus dipesan melalui alur Experience.'; end if;
    new.selected_addons:=coalesce(nullif(current_setting('shiap.experience_selected_addons',true),'')::jsonb,'[]'::jsonb);
  end if;
  return new;
end $$;
create trigger aaa_experience_booking_item_addons before insert on public.booking_items
for each row execute function public.prepare_experience_booking_item_addons();
revoke all on function public.prepare_experience_booking_item_addons() from public,anon,authenticated;

create or replace function public.guard_experience_payment()
returns trigger language plpgsql set search_path=''
as $$
begin
  if not exists(select 1 from public.booking_orders b where b.id=new.booking_id and b.payment_enabled) then
    raise exception 'Pembayaran belum dibuka; permintaan Experience menunggu persetujuan admin.';
  end if;
  return new;
end $$;
create trigger guard_experience_payment_record before insert on public.booking_payment_records
for each row execute function public.guard_experience_payment();
revoke all on function public.guard_experience_payment() from public,anon,authenticated;

create or replace function public.create_experience_booking_order(
  p_package_id uuid,p_session_id uuid,p_date date,p_guests integer,
  p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,
  p_participants jsonb,p_addon_slugs jsonb,p_request_details jsonb,p_safety_consent boolean
)
returns table(id uuid,order_number text)
language plpgsql security definer set search_path=''
as $$
declare
  uid uuid:=(select auth.uid()); k public.shiap_experience_packages%rowtype;
  p public.shiap_experience_products%rowtype; s public.shiap_experience_sessions%rowtype;
  order_id uuid; order_code text; item_id uuid; quantity integer; held integer;
  manual boolean; selected_ids jsonb; item_date date;
begin
  if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if p_guests not between 1 and 100 or p_safety_consent is distinct from true then raise exception 'Jumlah peserta atau persetujuan keselamatan tidak valid.'; end if;
  if jsonb_typeof(p_participants)<>'array' or jsonb_array_length(p_participants)<>p_guests then raise exception 'Data peserta harus diisi untuk setiap peserta.'; end if;
  if exists(select 1 from jsonb_array_elements(p_participants) participant where jsonb_typeof(participant)<>'object') then raise exception 'Format peserta tidak valid.'; end if;
  if exists(select 1 from jsonb_array_elements(p_participants) participant cross join lateral jsonb_object_keys(participant) as key(name) where key.name not in ('full_name','equipment_size','experience_level','health_screening_confirmed','safety_rules_accepted','emergency_contact_name','emergency_contact_phone')) then raise exception 'Data peserta berisi kolom yang tidak didukung.'; end if;
  if jsonb_typeof(coalesce(p_addon_slugs,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_request_details,'{}'::jsonb))<>'object' or octet_length(coalesce(p_request_details,'{}'::jsonb)::text)>12000 then raise exception 'Data permintaan tidak valid.'; end if;
  if exists(select 1 from jsonb_array_elements(p_participants) x where nullif(btrim(x->>'full_name'),'') is null or length(btrim(x->>'full_name'))>120 or coalesce((x->>'health_screening_confirmed')::boolean,false) is not true or coalesce((x->>'safety_rules_accepted')::boolean,false) is not true) then
    raise exception 'Nama peserta, konfirmasi skrining kesehatan, dan persetujuan aturan keselamatan wajib diisi.';
  end if;

  select * into k from public.shiap_experience_packages where shiap_experience_packages.id=p_package_id and status='published' for share;
  if not found then raise exception 'Paket Experience tidak tersedia.'; end if;
  select * into p from public.shiap_experience_products where shiap_experience_products.id=k.product_id and status='published' for share;
  if not found or not exists(select 1 from public.shiap_experience_categories c where c.id=p.category_id and c.is_active) then raise exception 'Experience tidak tersedia.'; end if;
  if p_guests<k.min_guests or p_guests>k.max_guests then raise exception 'Jumlah peserta berada di luar batas paket.'; end if;
  if k.pricing_basis='per_couple' and (p_guests%2<>0 or p_guests>40) then raise exception 'Paket per pasangan membutuhkan jumlah genap dan maksimal 40 peserta.'; end if;
  if k.pricing_basis in ('per_group','per_session','fixed_package') and p_guests>k.max_guests then raise exception 'Jumlah peserta melebihi kapasitas paket.'; end if;
  if p_date is null or p_date<current_date then raise exception 'Tanggal pengalaman harus hari ini atau setelahnya.'; end if;
  if p_addon_slugs is not null and exists(select 1 from jsonb_array_elements_text(p_addon_slugs) a(value) where not exists(select 1 from public.shiap_experience_addons x where x.package_id=k.id and x.slug=a.value and x.is_active)) then raise exception 'Add-on tidak tersedia untuk paket ini.'; end if;

  manual:=k.booking_mode='request_to_book' or k.requires_manual_approval;
  item_date:=p_date;
  if k.booking_mode in ('scheduled_session','private_session') then
    if p_session_id is null then raise exception 'Pilih jadwal sesi.'; end if;
    select * into s from public.shiap_experience_sessions where shiap_experience_sessions.id=p_session_id and package_id=k.id and status='open' and starts_at>now() for update;
    if not found then raise exception 'Sesi tidak tersedia.'; end if;
    if s.weather_status='blocked' or (s.weather_status='pending' and s.starts_at<now()+interval '24 hours') then raise exception 'Sesi menunggu pemeriksaan cuaca dan belum dapat dipesan.'; end if;
    if p.slug='spearfishing-experience' and (not s.safety_plan_verified or s.weather_status<>'approved') then raise exception 'Sesi ini belum memenuhi verifikasi keselamatan dan kondisi laut.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(s.id::text,0));
    select coalesce(sum(r.participant_count),0)::integer into held from public.shiap_experience_booking_records r join public.booking_orders b on b.id=r.booking_id
      where r.session_id=s.id and (b.order_status in ('confirmed','completed') or (b.order_status='pending_confirmation' and (b.inventory_hold_expires_at is null or b.inventory_hold_expires_at>clock_timestamp() or b.payment_status<>'unpaid' or exists(select 1 from public.booking_payment_records pm where pm.booking_id=b.id and pm.status='pending'))));
    if held+p_guests>s.capacity then raise exception 'Kapasitas sesi tidak mencukupi.'; end if;
    item_date:=(s.starts_at at time zone 'Asia/Makassar')::date;
  elsif p_session_id is not null then raise exception 'Paket ini tidak menerima pilihan sesi.';
  end if;

  quantity:=case when k.pricing_basis='per_couple' then p_guests/2 when k.pricing_basis in ('per_group','per_session','fixed_package') then 1 else 1 end;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.value)),'[]'::jsonb) into selected_ids
    from jsonb_array_elements_text(coalesce(p_addon_slugs,'[]'::jsonb)) a(value);
  perform set_config('shiap.experience_booking_rpc','on',true);
  perform set_config('shiap.experience_selected_addons',selected_ids::text,true);
  select x.id,x.order_number into order_id,order_code from public.create_booking_order(
    p_customer_name,p_customer_whatsapp,p_customer_email,p_customer_notes,
    jsonb_build_array(jsonb_build_object('service_type','activity','service_catalog_id',k.catalog_service_id,'service_name',p.title,'variant',k.title,'date_start',item_date,'quantity',quantity,'guests',p_guests,'notes',left(coalesce(p_customer_notes,''),1000),'selected_addons',selected_ids))
  ) x;
  select public.booking_items.id into item_id from public.booking_items where booking_id=order_id order by created_at desc limit 1;
  insert into public.shiap_experience_booking_records(booking_id,booking_item_id,product_id,package_id,session_id,booking_mode,request_status,participant_count,participant_data,selected_addons,request_details,safety_consent_at)
  values(order_id,item_id,p.id,k.id,p_session_id,k.booking_mode,case when manual then 'pending' else 'not_required' end,p_guests,p_participants,selected_ids,coalesce(p_request_details,'{}'::jsonb),now());
  if manual then update public.booking_orders set payment_enabled=false,inventory_hold_expires_at=clock_timestamp()+interval '24 hours' where booking_orders.id=order_id; end if;
  return query select order_id,order_code;
end $$;
revoke all on function public.create_experience_booking_order(uuid,uuid,date,integer,text,text,text,text,jsonb,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.create_experience_booking_order(uuid,uuid,date,integer,text,text,text,text,jsonb,jsonb,jsonb,boolean) to authenticated;

create or replace function public.admin_review_experience_request(p_record_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare r public.shiap_experience_booking_records%rowtype; b public.booking_orders%rowtype;
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Keputusan tidak valid.'; end if;
  select * into r from public.shiap_experience_booking_records where id=p_record_id for update;
  if not found or r.request_status<>'pending' then raise exception 'Permintaan tidak ditemukan atau sudah diproses.'; end if;
  select * into b from public.booking_orders where id=r.booking_id for update;
  if b.order_status not in ('pending_confirmation','confirmed') then raise exception 'Status booking tidak dapat ditinjau.'; end if;
  update public.shiap_experience_booking_records set request_status=case when p_decision='approve' then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid(),review_note=nullif(left(coalesce(p_note,''),1000),'') where id=r.id;
  if p_decision='approve' then
    update public.booking_orders set payment_enabled=true,inventory_hold_expires_at=clock_timestamp()+interval '15 minutes' where id=b.id;
  else
    update public.booking_orders set order_status='rejected',payment_enabled=false,inventory_hold_expires_at=null where id=b.id;
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
    values(b.id,auth.uid(),'admin','experience_request_'||p_decision,b.order_status,case when p_decision='reject' then 'rejected' else b.order_status end,left(coalesce(p_note,'Permintaan Experience ditinjau admin.'),1000));
end $$;
revoke all on function public.admin_review_experience_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_experience_request(uuid,text,text) to authenticated;

create or replace function public.guard_experience_resource_conflict()
returns trigger language plpgsql set search_path=''
as $$
declare s public.shiap_experience_sessions%rowtype; r public.shiap_experience_resources%rowtype;
begin
  select * into s from public.shiap_experience_sessions where id=new.session_id;
  select * into r from public.shiap_experience_resources where id=new.resource_id;
  if not found or not r.is_active then raise exception 'Resource tidak aktif atau tidak ditemukan.'; end if;
  if r.resource_type in ('instructor','crew') and r.verification_status<>'verified' then raise exception 'Instruktur/crew harus diverifikasi sebelum ditugaskan.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
  if exists(
    select 1 from public.shiap_experience_session_resources assigned
    join public.shiap_experience_sessions other_session on other_session.id=assigned.session_id
    where assigned.resource_id=r.id and assigned.session_id<>s.id
      and other_session.status in ('open','full')
      and other_session.starts_at<s.ends_at and other_session.ends_at>s.starts_at
  ) then raise exception 'Resource sudah ditugaskan pada sesi yang waktunya bertumpang tindih.'; end if;
  return new;
end $$;
create trigger guard_experience_resource_assignment before insert or update on public.shiap_experience_session_resources
for each row execute function public.guard_experience_resource_conflict();
revoke all on function public.guard_experience_resource_conflict() from public,anon,authenticated;
commit;
