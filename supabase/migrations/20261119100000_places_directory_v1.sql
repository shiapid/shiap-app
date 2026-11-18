-- SHIAP Places V1: directory and partner-plan foundation.
-- This migration is additive and intentionally independent of Stay booking tables/RPCs.
begin;

create table public.places_destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  canonical_name text not null check (length(btrim(canonical_name)) between 2 and 120),
  city text,
  province text,
  country_code text not null default 'ID' check (country_code = 'ID'),
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index places_destinations_canonical_location_uidx
  on public.places_destinations(lower(canonical_name), lower(coalesce(city,'')), lower(coalesce(province,'')));

create table public.places_properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  destination_id uuid not null references public.places_destinations(id) on delete restrict,
  accommodation_type text not null check (accommodation_type in ('villa','hotel','homestay','guesthouse','resort','other')),
  whatsapp_phone text not null check (whatsapp_phone ~ '^62[0-9]{8,13}$'),
  status text not null default 'draft' check (status in ('draft','pending_verification','published','suspended','archived')),
  is_demo boolean not null default false,
  contact_verified_at timestamptz,
  contact_verification_expires_at timestamptz,
  stay_property_id uuid references public.stay_properties(id) on delete set null,
  stay_mapping_verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_verification_expires_at is null or contact_verified_at is not null),
  check (contact_verification_expires_at is null or contact_verification_expires_at > contact_verified_at),
  check ((stay_property_id is null) = (stay_mapping_verified_at is null)),
  check (status <> 'published' or (contact_verified_at is not null and not is_demo))
);
create index places_properties_destination_status_idx
  on public.places_properties(destination_id,status,name);
create index places_properties_public_contact_idx
  on public.places_properties(destination_id,name)
  where status='published' and is_demo=false and contact_verified_at is not null;

create table public.places_property_profiles (
  property_id uuid primary key references public.places_properties(id) on delete cascade,
  description text check (description is null or length(description) <= 5000),
  cover_image_url text check (cover_image_url is null or (length(cover_image_url)<=2048 and cover_image_url ~* '^https://')),
  gallery_urls text[] not null default '{}' check (array_length(gallery_urls,1) is null or cardinality(gallery_urls)<=20),
  capacity integer check (capacity is null or capacity > 0),
  facilities text[] not null default '{}',
  room_summaries jsonb not null default '[]'::jsonb check (jsonb_typeof(room_summaries)='array' and jsonb_array_length(room_summaries)<=20),
  starting_price_idr bigint check (starting_price_idr is null or starting_price_idr >= 0),
  policies text check (policies is null or length(policies) <= 4000),
  map_url text check (map_url is null or (length(map_url)<=2048 and map_url ~* '^https://')),
  updated_at timestamptz not null default now()
);

create table public.places_property_verifications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.places_properties(id) on delete restrict,
  verified_by uuid not null references auth.users(id) on delete restrict,
  channel text not null check (channel in ('whatsapp','phone','email','in_person','business_documents','other')),
  evidence_note text not null check (length(btrim(evidence_note)) between 3 and 2000),
  evidence_private_path text,
  verified_at timestamptz not null default now(),
  valid_until timestamptz not null check (valid_until > verified_at),
  created_at timestamptz not null default now()
);
create index places_verification_property_date_idx
  on public.places_property_verifications(property_id,verified_at desc);

create table public.places_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('destination','property','profile','plan')),
  entity_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('INSERT','UPDATE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index places_admin_audit_created_idx on public.places_admin_audit_logs(created_at desc);

create table public.places_plan_settings (
  id boolean primary key default true check (id),
  premium_monthly_price_idr bigint not null default 99000 check (premium_monthly_price_idr >= 0),
  price_status text not null default 'proposed' check (price_status in ('proposed','actual')),
  max_units integer not null default 5 check (max_units > 0),
  premium_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.places_plan_settings(id) values (true) on conflict (id) do nothing;

create table public.places_wa_click_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.places_properties(id) on delete restrict,
  ref_code text not null check (ref_code ~ '^SHP-[A-HJ-NP-Z2-9]{5}$'),
  created_at timestamptz not null default now()
);
create unique index places_wa_click_ref_uidx on public.places_wa_click_events(property_id,ref_code);
create index places_wa_click_property_date_idx on public.places_wa_click_events(property_id,created_at desc);

create or replace function public.places_set_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
revoke all on function public.places_set_updated_at() from public,anon,authenticated;
create trigger places_destinations_updated_at before update on public.places_destinations
for each row execute function public.places_set_updated_at();
create trigger places_properties_updated_at before update on public.places_properties
for each row execute function public.places_set_updated_at();
create trigger places_plan_settings_updated_at before update on public.places_plan_settings
for each row execute function public.places_set_updated_at();
create trigger places_property_profiles_updated_at before update on public.places_property_profiles
for each row execute function public.places_set_updated_at();

create or replace function public.places_audit_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if tg_argv[0]='profile' then
    v_id:=coalesce((to_jsonb(new)->>'property_id')::uuid,(to_jsonb(old)->>'property_id')::uuid);
  elsif tg_argv[0]='plan' then
    v_id:='00000000-0000-0000-0000-000000000001'::uuid;
  else
    v_id:=coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid);
  end if;
  insert into public.places_admin_audit_logs(entity_type,entity_id,actor_user_id,action,old_data,new_data)
  values(tg_argv[0],v_id,auth.uid(),tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.places_audit_change() from public,anon,authenticated;
create trigger places_properties_audit after insert or update on public.places_properties
for each row execute function public.places_audit_change('property');
create trigger places_destinations_audit after insert or update on public.places_destinations
for each row execute function public.places_audit_change('destination');
create trigger places_profiles_audit after insert or update on public.places_property_profiles
for each row execute function public.places_audit_change('profile');
create trigger places_plan_settings_audit after insert or update on public.places_plan_settings
for each row execute function public.places_audit_change('plan');

create or replace function public.admin_record_places_contact_verification(
  p_property_id uuid,p_channel text,p_evidence_note text,p_evidence_private_path text,p_valid_until timestamptz
) returns timestamptz language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_verified_at timestamptz:=clock_timestamp();
begin
  if v_actor is null or not exists(select 1 from public.admin_users a where a.user_id=v_actor) then
    raise exception 'Akses Admin diperlukan.' using errcode='42501';
  end if;
  if p_property_id is null or p_channel not in ('whatsapp','phone','email','in_person','business_documents','other')
     or length(btrim(coalesce(p_evidence_note,'')))<3 or length(p_evidence_note)>2000
     or p_valid_until is null or p_valid_until<=v_verified_at or p_valid_until>v_verified_at+interval '2 years'
     or (p_evidence_private_path is not null and length(p_evidence_private_path)>500) then
    raise exception 'Data verifikasi kontak tidak valid.' using errcode='22023';
  end if;
  update public.places_properties set contact_verified_at=v_verified_at,contact_verification_expires_at=p_valid_until
    where id=p_property_id;
  if not found then raise exception 'Properti tidak ditemukan.' using errcode='P0002'; end if;
  insert into public.places_property_verifications(property_id,verified_by,channel,evidence_note,evidence_private_path,verified_at,valid_until)
    values(p_property_id,v_actor,p_channel,btrim(p_evidence_note),nullif(btrim(p_evidence_private_path),''),v_verified_at,p_valid_until);
  return v_verified_at;
end $$;
revoke all on function public.admin_record_places_contact_verification(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.admin_record_places_contact_verification(uuid,text,text,text,timestamptz) to authenticated;

alter table public.places_destinations enable row level security;
alter table public.places_properties enable row level security;
alter table public.places_property_profiles enable row level security;
alter table public.places_property_verifications enable row level security;
alter table public.places_admin_audit_logs enable row level security;
alter table public.places_plan_settings enable row level security;
alter table public.places_wa_click_events enable row level security;

create policy places_destinations_admin_all on public.places_destinations for all to authenticated
  using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy places_properties_admin_select on public.places_properties for select to authenticated using(public.is_shiap_admin());
create policy places_properties_admin_insert on public.places_properties for insert to authenticated
  with check(public.is_shiap_admin() and (status<>'published' or (contact_verified_at is not null and not is_demo)));
create policy places_properties_admin_update on public.places_properties for update to authenticated
  using(public.is_shiap_admin()) with check(public.is_shiap_admin() and (status<>'published' or (contact_verified_at is not null and not is_demo)));
create policy places_profiles_admin_all on public.places_property_profiles for all to authenticated
  using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy places_verifications_admin_select on public.places_property_verifications for select to authenticated using(public.is_shiap_admin());
create policy places_verifications_admin_insert on public.places_property_verifications for insert to authenticated with check(public.is_shiap_admin());
create policy places_audit_admin_select on public.places_admin_audit_logs for select to authenticated using(public.is_shiap_admin());
create policy places_plans_admin_select on public.places_plan_settings for select to authenticated using(public.is_shiap_admin());
create policy places_plans_admin_update on public.places_plan_settings for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());

revoke all on public.places_destinations,public.places_properties,public.places_property_profiles,
  public.places_property_verifications,public.places_admin_audit_logs,public.places_plan_settings,
  public.places_wa_click_events from public,anon,authenticated;
grant select,insert,update on public.places_destinations to authenticated;
grant select on public.places_properties to authenticated;
grant insert(slug,name,destination_id,accommodation_type,whatsapp_phone,status,is_demo,stay_property_id,stay_mapping_verified_at,created_by)
  on public.places_properties to authenticated;
grant update(slug,name,destination_id,accommodation_type,whatsapp_phone,status,is_demo,stay_property_id,stay_mapping_verified_at)
  on public.places_properties to authenticated;
grant select,insert,update on public.places_property_profiles to authenticated;
grant select,insert on public.places_property_verifications to authenticated;
grant select on public.places_admin_audit_logs to authenticated;
grant select,update(premium_monthly_price_idr,price_status,max_units,premium_enabled,updated_by)
  on public.places_plan_settings to authenticated;
grant all on public.places_destinations,public.places_properties,public.places_property_profiles,
  public.places_property_verifications,public.places_admin_audit_logs,public.places_plan_settings,
  public.places_wa_click_events to service_role;

create or replace view public.places_public_destinations_v with (security_barrier=true) as
select d.id,d.slug,d.name,d.canonical_name,d.city,d.province,d.aliases,d.sort_order,
  (select count(*)::integer from public.places_properties p
   where p.destination_id=d.id and p.status='published' and not p.is_demo and p.contact_verified_at is not null
     and (p.contact_verification_expires_at is null or p.contact_verification_expires_at>now())) as listing_count
from public.places_destinations d where d.is_active;

create or replace view public.places_public_directory_v with (security_barrier=true) as
select p.id,p.slug,p.name,p.accommodation_type,p.whatsapp_phone,p.contact_verified_at,
  d.id as destination_id,d.slug as destination_slug,d.name as destination_name,d.city,d.province,d.aliases as destination_aliases,
  pr.description,pr.cover_image_url,pr.gallery_urls,pr.capacity,pr.facilities,pr.room_summaries,
  pr.starting_price_idr,pr.policies,pr.map_url,
  case when p.stay_property_id is not null and p.stay_mapping_verified_at is not null then sp.slug else null end as stay_slug,
  lower(concat_ws(' ',p.name,d.name,d.canonical_name,d.city,d.province,array_to_string(d.aliases,' '),p.accommodation_type)) as search_document
from public.places_properties p
join public.places_destinations d on d.id=p.destination_id and d.is_active
left join public.places_property_profiles pr on pr.property_id=p.id
left join public.stay_properties sp on sp.id=p.stay_property_id and sp.status='published'
where p.status='published' and not p.is_demo and p.contact_verified_at is not null
  and (p.contact_verification_expires_at is null or p.contact_verification_expires_at>now());

create or replace view public.places_public_plan_v with (security_barrier=true) as
select id,premium_monthly_price_idr,price_status,max_units,premium_enabled
from public.places_plan_settings where id=true;

revoke all on public.places_public_destinations_v,public.places_public_directory_v,public.places_public_plan_v from public;
grant select on public.places_public_destinations_v,public.places_public_directory_v,public.places_public_plan_v to anon,authenticated,service_role;

insert into public.places_destinations(slug,name,canonical_name,city,province,sort_order)
values
  ('teluk-tamiang','Teluk Tamiang','Teluk Tamiang','Kotabaru','Kalimantan Selatan',10),
  ('pulau-kerayaan','Pulau Kerayaan','Pulau Kerayaan','Kotabaru','Kalimantan Selatan',20),
  ('pantai-gedambaan','Pantai Gedambaan','Pantai Gedambaan','Kotabaru','Kalimantan Selatan',30)
on conflict(slug) do update set name=excluded.name,canonical_name=excluded.canonical_name,
  city=excluded.city,province=excluded.province,updated_at=now();

commit;
