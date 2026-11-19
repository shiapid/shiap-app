-- M1: reviewed property website foundation. No subscriptions issued, trials started or invoices created.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
alter table public.places_property_profiles
 add column video_urls text[] not null default '{}',
 add column check_in_time text not null default '' check(check_in_time='' or check_in_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 add column check_out_time text not null default '' check(check_out_time='' or check_out_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 add column cancellation_information text not null default '' check(length(cancellation_information)<=4000),
 add column social_links jsonb not null default '{}' check(jsonb_typeof(social_links)='object'),
 add column version integer not null default 1 check(version>0),
 add column review_status text not null default 'DRAFT' check(review_status in('DRAFT','IN_REVIEW','APPROVED','REJECTED')),
 add column submitted_at timestamptz,
 add column reviewed_at timestamptz,
 add column reviewed_by uuid references auth.users(id) on delete set null;
alter table public.places_plan_settings
 add column premium_yearly_price_idr bigint not null default 990000 check(premium_yearly_price_idr>=0),
 add column trial_enabled boolean not null default false,
 add column trial_days integer not null default 30 check(trial_days between 1 and 30);
grant update(premium_yearly_price_idr,trial_enabled,trial_days) on public.places_plan_settings to authenticated;
create or replace view public.places_public_plan_v with(security_barrier=true) as
select id,premium_monthly_price_idr,price_status,max_units,premium_enabled,premium_yearly_price_idr,trial_enabled,trial_days from public.places_plan_settings where id=true;

-- Entitlement foundation: no client writes and no automatic migration/backfill grants.
create table public.places_subscriptions(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.places_properties(id) on delete restrict,
 origin text not null check(origin in('TRIAL','PAID')),status text not null check(status in('TRIALING','PENDING_PAYMENT','PENDING_VERIFICATION','ACTIVE','EXPIRED','CANCELLED','SUSPENDED')),
 starts_at timestamptz,ends_at timestamptz,verified_at timestamptz,verified_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at is null or starts_at is not null and ends_at>starts_at),
 check(status not in('TRIALING','ACTIVE') or starts_at is not null and ends_at is not null),
 check(status<>'TRIALING' or origin='TRIAL'),check(status<>'ACTIVE' or origin='PAID' and verified_at is not null and verified_by is not null)
);
create unique index places_one_current_subscription on public.places_subscriptions(property_id) where status in('TRIALING','ACTIVE');
create unique index places_one_intro_trial on public.places_subscriptions(property_id) where origin='TRIAL';
create index places_subscriptions_expiry_idx on public.places_subscriptions(status,ends_at);
alter table public.places_subscriptions enable row level security;
revoke all on public.places_subscriptions from public,anon,authenticated;
grant select on public.places_subscriptions to authenticated;
grant all on public.places_subscriptions to service_role;
create policy places_subscriptions_admin_read on public.places_subscriptions for select to authenticated using(public.is_shiap_admin());
create function shiap_private.places_premium_visible(p_property_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.places_properties p join public.places_subscriptions s on s.property_id=p.id where p.id=p_property_id and p.status='published' and not p.is_demo and p.contact_verified_at is not null and (p.contact_verification_expires_at is null or p.contact_verification_expires_at>now()) and s.status in('TRIALING','ACTIVE') and s.starts_at<=now() and s.ends_at>now());
$$;
revoke all on function shiap_private.places_premium_visible(uuid) from public;
grant usage on schema shiap_private to anon,authenticated;
grant execute on function shiap_private.places_premium_visible(uuid) to anon,authenticated,service_role;
create table public.places_profile_publications(
 property_id uuid primary key references public.places_properties(id) on delete restrict,
 profile jsonb not null check(jsonb_typeof(profile)='object'),version integer not null check(version>0),
 published_at timestamptz not null default now(),reviewed_by uuid not null references auth.users(id) on delete restrict
);
alter table public.places_profile_publications enable row level security;
revoke all on public.places_profile_publications from public,anon,authenticated;
grant select(property_id,profile,version,published_at) on public.places_profile_publications to anon,authenticated;
grant all on public.places_profile_publications to service_role;
create policy places_publication_visible on public.places_profile_publications for select to anon,authenticated using(shiap_private.places_premium_visible(property_id));
create policy places_publication_admin_read on public.places_profile_publications for select to authenticated using(public.is_shiap_admin());
create view public.places_public_premium_v with(security_invoker=true,security_barrier=true) as
select property_id,profile,version,published_at from public.places_profile_publications where shiap_private.places_premium_visible(property_id);
grant select on public.places_public_premium_v to anon,authenticated,service_role;

create function shiap_private.places_valid_profile(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;r jsonb;begin
 if p is null or jsonb_typeof(p)<>'object' then return false;end if;
 for k,v in select * from jsonb_each(p) loop
 if k not in('description','cover_image_url','gallery_urls','video_urls','capacity','facilities','room_summaries','starting_price_idr','policies','map_url','check_in_time','check_out_time','cancellation_information','social_links') then return false;end if;
 end loop;
 foreach k in array array['description','policies','cancellation_information','check_in_time','check_out_time'] loop
  if p?k and jsonb_typeof(p->k)<>'string' then return false;end if;
 end loop;
 if length(coalesce(p->>'description',''))>5000 or length(coalesce(p->>'policies',''))>4000 or length(coalesce(p->>'cancellation_information',''))>4000 then return false;end if;
 foreach k in array array['cover_image_url','map_url'] loop
  if coalesce(p->>k,'')<>'' and (jsonb_typeof(p->k)<>'string' or length(p->>k)>2048 or p->>k !~ '^https://[^/@[:space:]]+([/:?].*)?$' or p->>k ~ '^https://[^/]*@') then return false;end if;
 end loop;
 foreach k in array array['check_in_time','check_out_time'] loop
  if coalesce(p->>k,'')<>'' and p->>k !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false;end if;
 end loop;
 foreach k in array array['capacity','starting_price_idr'] loop
  if p->>k is not null and (jsonb_typeof(p->k)<>'number' or p->>k !~ '^[0-9]+$' or (p->>k)::numeric>999999999999 or k='capacity' and ((p->>k)::numeric<1 or (p->>k)::numeric>100000)) then return false;end if;
 end loop;
 foreach k in array array['gallery_urls','video_urls','facilities','room_summaries'] loop
  if p?k then
   if jsonb_typeof(p->k)<>'array' then return false;end if;
   if jsonb_array_length(p->k)>(case when k='facilities' then 50 when k='video_urls' then 5 else 20 end) then return false;end if;
   for r in select * from jsonb_array_elements(p->k) loop
    if k in('gallery_urls','video_urls') then
     if jsonb_typeof(r)<>'string' or length(r#>>'{}')>2048 or r#>>'{}' !~ '^https://[^/@[:space:]]+([/:?].*)?$' or r#>>'{}' ~ '^https://[^/]*@' then return false;end if;
    elsif k='facilities' then
     if jsonb_typeof(r)<>'string' or length(btrim(r#>>'{}')) not between 1 and 100 then return false;end if;
    else
     if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'name')<>'string' or length(btrim(r->>'name')) not between 1 and 120 or (r?'description' and jsonb_typeof(r->'description')<>'string') or length(coalesce(r->>'description',''))>1000 then return false;end if;
     if exists(select 1 from jsonb_object_keys(r)x where x not in('name','description','capacity','starting_price_idr')) then return false;end if;
     if r->>'capacity' is not null and (r->>'capacity' !~ '^[0-9]+$' or (r->>'capacity')::numeric not between 1 and 100000) then return false;end if;
     if r->>'starting_price_idr' is not null and (r->>'starting_price_idr' !~ '^[0-9]+$' or (r->>'starting_price_idr')::numeric>999999999999) then return false;end if;
    end if;
   end loop;
  end if;
 end loop;
 if p?'social_links' then
  if jsonb_typeof(p->'social_links')<>'object' then return false;end if;
  for k,v in select * from jsonb_each(p->'social_links') loop
   if k not in('instagram','tiktok','facebook','youtube','website') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2048 or v#>>'{}' !~ '^https://[^/@[:space:]]+([/:?].*)?$' or v#>>'{}' ~ '^https://[^/]*@' then return false;end if;
  end loop;
 end if;
 return true;
exception when others then return false;
end $$;
revoke all on function shiap_private.places_valid_profile(jsonb) from public,anon,authenticated;

-- Draft writes and review happen only through independently authorized RPCs.
revoke insert,update on public.places_property_profiles from authenticated;
create function public.admin_save_places_premium_profile(p_property_id uuid,p_version integer,p_profile jsonb,p_submit boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare old_row public.places_property_profiles%rowtype;next_version integer;begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 if not shiap_private.places_valid_profile(p_profile) then raise exception 'Konten profil tidak valid.' using errcode='22023';end if;
 perform 1 from public.places_properties where id=p_property_id and status<>'archived' for update;
 if not found then raise exception 'Properti tidak tersedia.' using errcode='P0002';end if;
 select * into old_row from public.places_property_profiles where property_id=p_property_id for update;
 if coalesce(old_row.version,0) is distinct from p_version then raise exception 'Profil berubah. Muat ulang.' using errcode='PT409';end if;
 next_version:=coalesce(old_row.version,0)+1;
 insert into public.places_property_profiles(property_id,description,cover_image_url,gallery_urls,capacity,facilities,room_summaries,starting_price_idr,policies,map_url,video_urls,check_in_time,check_out_time,cancellation_information,social_links,version,review_status,submitted_at)
 values(p_property_id,coalesce(p_profile->>'description',''),nullif(p_profile->>'cover_image_url',''),array(select jsonb_array_elements_text(coalesce(p_profile->'gallery_urls','[]'))),nullif(p_profile->>'capacity','')::integer,array(select jsonb_array_elements_text(coalesce(p_profile->'facilities','[]'))),coalesce(p_profile->'room_summaries','[]'),nullif(p_profile->>'starting_price_idr','')::bigint,coalesce(p_profile->>'policies',''),nullif(p_profile->>'map_url',''),array(select jsonb_array_elements_text(coalesce(p_profile->'video_urls','[]'))),coalesce(p_profile->>'check_in_time',''),coalesce(p_profile->>'check_out_time',''),coalesce(p_profile->>'cancellation_information',''),coalesce(p_profile->'social_links','{}'),next_version,case when p_submit then 'IN_REVIEW' else 'DRAFT' end,case when p_submit then now() else null end)
 on conflict(property_id) do update set description=excluded.description,cover_image_url=excluded.cover_image_url,gallery_urls=excluded.gallery_urls,capacity=excluded.capacity,facilities=excluded.facilities,room_summaries=excluded.room_summaries,starting_price_idr=excluded.starting_price_idr,policies=excluded.policies,map_url=excluded.map_url,video_urls=excluded.video_urls,check_in_time=excluded.check_in_time,check_out_time=excluded.check_out_time,cancellation_information=excluded.cancellation_information,social_links=excluded.social_links,version=excluded.version,review_status=excluded.review_status,submitted_at=excluded.submitted_at,reviewed_at=null,reviewed_by=null;
 return next_version;
end $$;
revoke all on function public.admin_save_places_premium_profile(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.admin_save_places_premium_profile(uuid,integer,jsonb,boolean) to authenticated;
create function public.admin_review_places_premium_profile(p_property_id uuid,p_version integer,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare row_profile public.places_property_profiles%rowtype;body jsonb;begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 perform 1 from public.places_properties where id=p_property_id and status<>'archived' for update;
 if not found then raise exception 'Properti tidak tersedia.' using errcode='P0002';end if;
 select * into row_profile from public.places_property_profiles where property_id=p_property_id for update;
 if not found then raise exception 'Profil belum tersedia.' using errcode='P0002';end if;
 if row_profile.version is distinct from p_version then raise exception 'Profil berubah. Muat ulang.' using errcode='PT409';end if;
 if row_profile.review_status<>'IN_REVIEW' then raise exception 'Ajukan profil untuk review terlebih dahulu.' using errcode='22023';end if;
 body:=to_jsonb(row_profile)-array['property_id','updated_at','version','review_status','submitted_at','reviewed_at','reviewed_by'];
 if p_approve and (not shiap_private.places_valid_profile(body) or length(btrim(coalesce(row_profile.description,'')))<20) then raise exception 'Lengkapi profil sebelum persetujuan.' using errcode='22023';end if;
 update public.places_property_profiles set review_status=case when p_approve then 'APPROVED' else 'REJECTED' end,reviewed_at=now(),reviewed_by=auth.uid(),version=version+1 where property_id=p_property_id;
 if p_approve then insert into public.places_profile_publications(property_id,profile,version,reviewed_by) values(p_property_id,body,p_version,auth.uid()) on conflict(property_id) do update set profile=excluded.profile,version=excluded.version,published_at=now(),reviewed_by=excluded.reviewed_by;end if;
end $$;
revoke all on function public.admin_review_places_premium_profile(uuid,integer,boolean) from public,anon;
grant execute on function public.admin_review_places_premium_profile(uuid,integer,boolean) to authenticated;

-- Public directory preserves column signatures; private drafts never leak through the legacy view.
create or replace view public.places_public_directory_v with(security_barrier=true) as
select p.id,p.slug,p.name,p.accommodation_type,p.whatsapp_phone,p.contact_verified_at,d.id as destination_id,d.slug as destination_slug,d.name as destination_name,d.city,d.province,d.aliases as destination_aliases,
 pr.profile->>'description' as description,pr.profile->>'cover_image_url' as cover_image_url,
 array(select jsonb_array_elements_text(pr.profile->'gallery_urls')) as gallery_urls,
 (pr.profile->>'capacity')::integer as capacity,array(select jsonb_array_elements_text(pr.profile->'facilities')) as facilities,pr.profile->'room_summaries' as room_summaries,
 (pr.profile->>'starting_price_idr')::bigint as starting_price_idr,pr.profile->>'policies' as policies,pr.profile->>'map_url' as map_url,
 case when p.stay_property_id is not null and p.stay_mapping_verified_at is not null then sp.slug else null end as stay_slug,
 lower(concat_ws(' ',p.name,d.name,d.canonical_name,d.city,d.province,array_to_string(d.aliases,' '),p.accommodation_type)) as search_document
from public.places_properties p join public.places_destinations d on d.id=p.destination_id
left join public.places_profile_publications pr on pr.property_id=p.id and shiap_private.places_premium_visible(p.id)
left join public.stay_properties sp on sp.id=p.stay_property_id and sp.status='published'
where p.status='published' and not p.is_demo and p.contact_verified_at is not null and(p.contact_verification_expires_at is null or p.contact_verification_expires_at>now());
commit;
