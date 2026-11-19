begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
alter table public.places_destinations drop constraint if exists places_destinations_country_code_check;
alter table public.places_destinations add constraint destinations_country_code_check check(country_code ~ '^[A-Z]{2}$');
alter table public.places_destinations
 add column destination_type text not null default 'other_attraction' check(destination_type in('city','tourism_area','beach','island','archipelago','mountain','lake','waterfall','other_attraction')),
 add column parent_id uuid references public.places_destinations(id) on delete restrict,
 add column description text check(description is null or length(description)<=2000),
 add column cover_image_url text check(cover_image_url is null or (length(cover_image_url)<=2048 and cover_image_url ~ '^https://')),
 add column latitude numeric check(latitude between -90 and 90),
 add column longitude numeric check(longitude between -180 and 180),
 add column archived_at timestamptz,
 add column updated_by uuid references auth.users(id) on delete set null,
 add column version integer not null default 1 check(version>0),
 add constraint destinations_coordinates_pair check((latitude is null)=(longitude is null)),
 add constraint destinations_alias_limit check(cardinality(aliases)<=20);
create index destinations_parent_idx on public.places_destinations(parent_id);
drop index public.places_destinations_canonical_location_uidx;
create unique index destinations_canonical_geography_uidx on public.places_destinations(lower(btrim(canonical_name)),lower(btrim(coalesce(city,''))),lower(btrim(coalesce(province,''))),country_code,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid));
create function shiap_private.guard_destination_tree() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.places_destinations%rowtype; previous_parent uuid;
begin
 perform pg_advisory_xact_lock(91320451);
 if tg_op='UPDATE' then previous_parent:=old.parent_id;end if;
 if new.parent_id is not null then
  select * into p from public.places_destinations where id=new.parent_id;
  if not found or p.country_code<>new.country_code then raise exception 'Parent destinasi/negara tidak valid.' using errcode='22023';end if;
  if new.parent_id is distinct from previous_parent and (not p.is_active or p.archived_at is not null) then raise exception 'Parent destinasi tidak aktif.' using errcode='22023';end if;
  if new.id=new.parent_id or exists(with recursive ancestors as(select id,parent_id from public.places_destinations where id=new.parent_id union select d.id,d.parent_id from public.places_destinations d join ancestors a on d.id=a.parent_id) select 1 from ancestors where id=new.id) then raise exception 'Hierarki destinasi membentuk siklus.' using errcode='22023';end if;
 end if;
 if exists(select 1 from public.places_destinations c where c.parent_id=new.id and c.country_code<>new.country_code) then raise exception 'Negara parent dan anak harus konsisten.' using errcode='22023';end if;
 if tg_op='UPDATE' then
  if new.slug is distinct from old.slug then raise exception 'Slug destinasi yang sudah ada tidak boleh diubah.' using errcode='22023';end if;
  new.version:=old.version+1;
 end if;
 new.updated_by:=auth.uid();
 if new.archived_at is not null then new.is_active:=false;end if;
 return new;
end $$;
revoke all on function shiap_private.guard_destination_tree() from public,anon,authenticated;
create trigger destinations_tree_before_write before insert or update on public.places_destinations for each row execute function shiap_private.guard_destination_tree();

alter table public.trip_packages add column destination_id uuid references public.places_destinations(id) on delete restrict;
alter table public.stay_properties add column destination_id uuid references public.places_destinations(id) on delete restrict;
alter table public.shiap_experiences add column destination_id uuid references public.places_destinations(id) on delete restrict;
alter table public.shiap_experience_products add column destination_id uuid references public.places_destinations(id) on delete restrict;
alter table public.shiap_experience_sessions add column destination_id uuid references public.places_destinations(id) on delete restrict;
create index trip_packages_destination_idx on public.trip_packages(destination_id);
create index stay_properties_destination_idx on public.stay_properties(destination_id);
create index catalog_destination_idx on public.shiap_experiences(destination_id);
create index experience_products_destination_idx on public.shiap_experience_products(destination_id);
create index experience_sessions_destination_idx on public.shiap_experience_sessions(destination_id);
create table public.trip_destination_links(trip_id uuid not null references public.trip_packages(id) on delete restrict,destination_id uuid not null references public.places_destinations(id) on delete restrict,position integer not null check(position>=0),primary key(trip_id,destination_id),unique(trip_id,position));
create table public.catalog_destination_links(service_id uuid not null references public.shiap_experiences(id) on delete restrict,destination_id uuid not null references public.places_destinations(id) on delete restrict,position integer not null check(position>=0),primary key(service_id,destination_id),unique(service_id,position));
create index trip_destination_links_destination_idx on public.trip_destination_links(destination_id);
create index catalog_destination_links_destination_idx on public.catalog_destination_links(destination_id);
alter table public.trip_destination_links enable row level security;
alter table public.catalog_destination_links enable row level security;
revoke all on public.trip_destination_links,public.catalog_destination_links from public,anon,authenticated;
grant select on public.trip_destination_links,public.catalog_destination_links to anon,authenticated;
grant all on public.trip_destination_links,public.catalog_destination_links to service_role;
create policy trip_destinations_public_read on public.trip_destination_links for select to anon,authenticated using(exists(select 1 from public.trip_packages t where t.id=trip_id and t.status='published'));
create policy trip_destinations_admin_read on public.trip_destination_links for select to authenticated using(public.is_shiap_admin());
create policy catalog_destinations_public_read on public.catalog_destination_links for select to anon,authenticated using(exists(select 1 from public.shiap_experiences s where s.id=service_id and s.status='published'));
create policy catalog_destinations_admin_read on public.catalog_destination_links for select to authenticated using(public.is_shiap_admin());
create table public.destination_service_audit(id uuid primary key default gen_random_uuid(),domain text not null,service_id uuid not null,actor_id uuid references auth.users(id) on delete set null,old_destination_id uuid,new_destination_id uuid,old_destination_ids uuid[],new_destination_ids uuid[],created_at timestamptz not null default now());
alter table public.destination_service_audit enable row level security;
revoke all on public.destination_service_audit from public,anon,authenticated;
grant select on public.destination_service_audit to authenticated;
grant all on public.destination_service_audit to service_role;
create policy destination_service_audit_admin on public.destination_service_audit for select to authenticated using(public.is_shiap_admin());
create function shiap_private.guard_service_destination() returns trigger language plpgsql security definer set search_path='' as $$
declare previous uuid;
begin
 if tg_op='UPDATE' then previous:=old.destination_id;end if;
 if new.destination_id is distinct from previous and new.destination_id is not null then perform 1 from public.places_destinations where id=new.destination_id for share;end if;
 if new.destination_id is distinct from previous and new.destination_id is not null and not exists(select 1 from public.places_destinations where id=new.destination_id and is_active and archived_at is null) then raise exception 'Destinasi tidak aktif tidak dapat dipilih untuk penugasan baru.' using errcode='22023';end if;
 return new;
end $$;
revoke all on function shiap_private.guard_service_destination() from public,anon,authenticated;
create function shiap_private.sync_primary_destination() returns trigger language plpgsql security definer set search_path='' as $$
declare previous uuid;
begin
 if tg_op='UPDATE' then previous:=old.destination_id;end if;
 if new.destination_id is not distinct from previous then return new;end if;
 if tg_table_name='trip_packages' then
  delete from public.trip_destination_links where trip_id=new.id and (position=0 or destination_id=new.destination_id);
  if new.destination_id is not null then insert into public.trip_destination_links values(new.id,new.destination_id,0);end if;
 elsif tg_table_name='shiap_experiences' then
  delete from public.catalog_destination_links where service_id=new.id and (position=0 or destination_id=new.destination_id);
  if new.destination_id is not null then insert into public.catalog_destination_links values(new.id,new.destination_id,0);end if;
 end if;
 insert into public.destination_service_audit(domain,service_id,actor_id,old_destination_id,new_destination_id) values(tg_table_name,new.id,auth.uid(),previous,new.destination_id);
 return new;
end $$;
revoke all on function shiap_private.sync_primary_destination() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['trip_packages','stay_properties','shiap_experiences','shiap_experience_products','shiap_experience_sessions','places_properties'] loop
 execute format('create trigger guard_service_destination before insert or update of destination_id on public.%I for each row execute function shiap_private.guard_service_destination()',t);
 if t<>'places_properties' then execute format('create trigger sync_primary_destination after insert or update of destination_id on public.%I for each row execute function shiap_private.sync_primary_destination()',t);end if;
end loop;end $$;

create or replace view public.destinations_public_v with(security_barrier=true) as
select d.id,d.slug,d.name,d.canonical_name,d.destination_type,d.parent_id,p.name as parent_name,d.country_code,d.province,d.city,d.aliases,d.sort_order,d.is_active,d.archived_at,d.description,d.cover_image_url,d.latitude,d.longitude
from public.places_destinations d left join public.places_destinations p on p.id=d.parent_id;
revoke all on public.destinations_public_v from public;
grant select on public.destinations_public_v to anon,authenticated,service_role;

-- Inactive/archived destinations stop new assignments; existing public properties remain accessible.
create or replace view public.places_public_destinations_v with(security_barrier=true) as
select d.id,d.slug,d.name,d.canonical_name,d.city,d.province,d.aliases,d.sort_order,
 (select count(*)::integer from public.places_properties p where p.destination_id=d.id and p.status='published' and not p.is_demo and p.contact_verified_at is not null and (p.contact_verification_expires_at is null or p.contact_verification_expires_at>now())) as listing_count
from public.places_destinations d where (d.is_active and d.archived_at is null) or exists(select 1 from public.places_properties p where p.destination_id=d.id and p.status='published' and not p.is_demo and p.contact_verified_at is not null and (p.contact_verification_expires_at is null or p.contact_verification_expires_at>now()));
create or replace view public.places_public_directory_v with(security_barrier=true) as
select p.id,p.slug,p.name,p.accommodation_type,p.whatsapp_phone,p.contact_verified_at,d.id as destination_id,d.slug as destination_slug,d.name as destination_name,d.city,d.province,d.aliases as destination_aliases,
 pr.description,pr.cover_image_url,pr.gallery_urls,pr.capacity,pr.facilities,pr.room_summaries,pr.starting_price_idr,pr.policies,pr.map_url,
 case when p.stay_property_id is not null and p.stay_mapping_verified_at is not null then sp.slug else null end as stay_slug,
 lower(concat_ws(' ',p.name,d.name,d.canonical_name,d.city,d.province,array_to_string(d.aliases,' '),p.accommodation_type)) as search_document
from public.places_properties p join public.places_destinations d on d.id=p.destination_id left join public.places_property_profiles pr on pr.property_id=p.id left join public.stay_properties sp on sp.id=p.stay_property_id and sp.status='published'
where p.status='published' and not p.is_demo and p.contact_verified_at is not null and (p.contact_verification_expires_at is null or p.contact_verification_expires_at>now());

-- Expand-and-migrate: exact unique matches only. Never modify legacy text or booking snapshots.
do $$declare t text;col text;begin foreach t in array array['trip_packages','stay_properties','shiap_experiences','shiap_experience_products'] loop
 col:=case when t='shiap_experience_products' then 'location_label' else 'location' end;
 execute format('update public.%I s set destination_id=(select min(d.id::text)::uuid from public.places_destinations d where lower(btrim(s.%I)) in(lower(btrim(d.name)),lower(btrim(d.canonical_name))) and d.is_active and d.archived_at is null having count(*)=1) where s.destination_id is null and (select count(*) from public.places_destinations d where lower(btrim(s.%I)) in(lower(btrim(d.name)),lower(btrim(d.canonical_name))) and d.is_active and d.archived_at is null)=1',t,col,col);
end loop;end $$;
create function public.admin_destination_connections(p_destination_id uuid default null) returns table(destination_id uuid,domain text,service_id uuid,service_name text,status text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 return query select r.* from (
 select p.destination_id,'places'::text,p.id,p.name,p.status from public.places_properties p
 union select t.destination_id,'trip',t.id,t.title,t.status from public.trip_packages t
 union select l.destination_id,'trip',t.id,t.title,t.status from public.trip_destination_links l join public.trip_packages t on t.id=l.trip_id
 union select p.destination_id,'stay',p.id,p.name,p.status from public.stay_properties p
 union select p.destination_id,coalesce(p.catalog_category,'catalog'),p.id,p.title,p.status from public.shiap_experiences p
 union select l.destination_id,coalesce(p.catalog_category,'catalog'),p.id,p.title,p.status from public.catalog_destination_links l join public.shiap_experiences p on p.id=l.service_id
 union select p.destination_id,'experience',p.id,p.title,p.status from public.shiap_experience_products p
 union select s.destination_id,'session',s.id,'Sesi '||s.starts_at::text,s.status from public.shiap_experience_sessions s
 )r where r.destination_id is not null and (p_destination_id is null or r.destination_id=p_destination_id);
end $$;
revoke all on function public.admin_destination_connections(uuid) from public,anon;
grant execute on function public.admin_destination_connections(uuid) to authenticated;

create function public.admin_save_destination(p_id uuid,p_version integer,p_data jsonb,p_confirm boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare old_row public.places_destinations%rowtype; dest_id uuid:=coalesce(p_id,gen_random_uuid()); action text:=coalesce(p_data->>'action','save'); v_name text:=btrim(p_data->>'name'); v_slug text; refs integer;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(91320451);
 if action not in('save','archive','restore','activate','deactivate') then raise exception 'Aksi tidak valid.' using errcode='22023';end if;
 if p_id is not null then
  select * into old_row from public.places_destinations where id=p_id for update;
  if not found then raise exception 'Destinasi tidak ditemukan.' using errcode='P0002';end if;
  if p_version is distinct from old_row.version then raise exception 'Data berubah. Muat ulang sebelum menyimpan.' using errcode='PT409';end if;
  if action in('archive','deactivate') then
   select count(*) into refs from public.admin_destination_connections(p_id) c where c.status not in('archived','cancelled','expired','rejected');
   if refs>0 and not p_confirm then raise exception 'Destinasi masih terhubung. Konfirmasi diperlukan; referensi lama tetap dipertahankan.' using errcode='23514';end if;
  end if;
 end if;
 if action='save' then
  if v_name is null or length(v_name) not between 2 and 120 or length(coalesce(p_data->>'city',''))>120 or length(coalesce(p_data->>'province',''))>120 or coalesce(p_data->>'country_code','ID') !~ '^[A-Z]{2}$' then raise exception 'Nama/lokasi destinasi tidak valid.' using errcode='22023';end if;
  v_slug:=coalesce(nullif(trim(both '-' from left(regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'),60)),''),'destinasi')||'-'||replace(dest_id::text,'-','');
  if p_id is null then
   insert into public.places_destinations(id,slug,name,canonical_name,city,province,country_code,parent_id,destination_type,description,cover_image_url,latitude,longitude,sort_order,aliases)
   values(dest_id,v_slug,v_name,v_name,nullif(btrim(p_data->>'city'),''),nullif(btrim(p_data->>'province'),''),coalesce(p_data->>'country_code','ID'),nullif(p_data->>'parent_id','')::uuid,coalesce(p_data->>'destination_type','other_attraction'),nullif(p_data->>'description',''),nullif(p_data->>'cover_image_url',''),nullif(p_data->>'latitude','')::numeric,nullif(p_data->>'longitude','')::numeric,coalesce((p_data->>'sort_order')::integer,0),array(select jsonb_array_elements_text(coalesce(p_data->'aliases','[]'::jsonb))));
  else
   update public.places_destinations set name=v_name,canonical_name=v_name,city=nullif(btrim(p_data->>'city'),''),province=nullif(btrim(p_data->>'province'),''),country_code=coalesce(p_data->>'country_code','ID'),parent_id=nullif(p_data->>'parent_id','')::uuid,destination_type=coalesce(p_data->>'destination_type','other_attraction'),description=nullif(p_data->>'description',''),cover_image_url=nullif(p_data->>'cover_image_url',''),latitude=nullif(p_data->>'latitude','')::numeric,longitude=nullif(p_data->>'longitude','')::numeric,sort_order=coalesce((p_data->>'sort_order')::integer,0),aliases=array(select jsonb_array_elements_text(coalesce(p_data->'aliases','[]'::jsonb))) where id=p_id;
  end if;
 elsif p_id is null then raise exception 'Destinasi wajib dipilih.' using errcode='22023';
 else
  update public.places_destinations set archived_at=case when action='archive' then now() when action='restore' then null else archived_at end,
   is_active=case when action='activate' and archived_at is null then true else false end where id=p_id;
 end if;
 return dest_id;
end $$;
revoke all on function public.admin_save_destination(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.admin_save_destination(uuid,integer,jsonb,boolean) to authenticated;

create function public.admin_set_service_destinations(p_domain text,p_service_id uuid,p_destinations uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare target text; existing uuid[]; current_primary uuid; value uuid; counter integer:=0; exists_service boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 target:=case p_domain when 'trip' then 'trip_packages' when 'stay' then 'stay_properties' when 'catalog' then 'shiap_experiences' when 'experience' then 'shiap_experience_products' when 'session' then 'shiap_experience_sessions' end;
 if target is null or p_service_id is null or p_destinations is null or cardinality(p_destinations)>20 or (p_domain not in('trip','catalog') and cardinality(p_destinations)>1) or cardinality(p_destinations)<>(select count(distinct x) from unnest(p_destinations)x) then raise exception 'Penugasan destinasi tidak valid.' using errcode='22023';end if;
 execute format('select destination_id from public.%I where id=$1 for update',target) into current_primary using p_service_id;
 get diagnostics counter=row_count;
 if counter=0 then raise exception 'Layanan tidak ditemukan.' using errcode='P0002';end if;
 existing:=array_remove(array[current_primary],null);
 if p_domain='trip' then existing:=array(select destination_id from public.trip_destination_links where trip_id=p_service_id order by position);
 elsif p_domain='catalog' then existing:=array(select destination_id from public.catalog_destination_links where service_id=p_service_id order by position);end if;
 foreach value in array p_destinations loop
  perform 1 from public.places_destinations where id=value for share;
  if not exists(select 1 from public.places_destinations where id=value and ((is_active and archived_at is null) or value=any(existing))) then raise exception 'Destinasi tidak aktif tidak dapat ditambahkan.' using errcode='22023';end if;
 end loop;
 if existing=p_destinations then return;end if;
 insert into public.destination_service_audit(domain,service_id,actor_id,old_destination_id,new_destination_id,old_destination_ids,new_destination_ids) values(p_domain,p_service_id,auth.uid(),current_primary,p_destinations[1],existing,p_destinations);
 if p_domain='trip' then
  delete from public.trip_destination_links where trip_id=p_service_id;
  insert into public.trip_destination_links select p_service_id,dest,ord::integer-1 from unnest(p_destinations) with ordinality x(dest,ord);
 elsif p_domain='catalog' then
  delete from public.catalog_destination_links where service_id=p_service_id;
  insert into public.catalog_destination_links select p_service_id,dest,ord::integer-1 from unnest(p_destinations) with ordinality x(dest,ord);
 end if;
 execute format('update public.%I set destination_id=$1 where id=$2',target) using p_destinations[1],p_service_id;
end $$;
revoke all on function public.admin_set_service_destinations(text,uuid,uuid[]) from public,anon;
grant execute on function public.admin_set_service_destinations(text,uuid,uuid[]) to authenticated;

-- Preserve fulfillment/contact and edits for existing references after destination retirement.
create or replace function public.create_places_contact_lead(p_request_id uuid,p_property_id uuid,p_name text,p_phone text,p_fingerprint text,p_reference text,p_privacy_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prop public.places_properties%rowtype; existing public.places_contact_leads%rowtype;
begin
 if p_request_id is null or p_name is null or length(btrim(p_name)) not between 2 and 100 or p_phone is null or p_phone !~ '^62[0-9]{8,13}$' or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_privacy_version is distinct from 'places-contact-v1-2026-11-19' then raise exception 'Invalid lead' using errcode='22023';end if;
 select * into prop from public.places_properties where id=p_property_id for share;
 if not found or prop.status<>'published' or prop.is_demo or prop.contact_verified_at is null or (prop.contact_verification_expires_at is not null and prop.contact_verification_expires_at<=now()) or not exists(select 1 from public.places_destinations where id=prop.destination_id) then raise exception 'Property unavailable' using errcode='P0002';end if;
 insert into public.places_contact_leads(request_id,request_fingerprint,property_id,destination_id,customer_name,customer_whatsapp,reference_code,privacy_version)
 values(p_request_id,p_fingerprint,prop.id,prop.destination_id,btrim(p_name),p_phone,p_reference,p_privacy_version)
 on conflict(request_id) do nothing;
 select * into existing from public.places_contact_leads where request_id=p_request_id;
 if existing.request_fingerprint<>p_fingerprint or existing.property_id<>p_property_id or existing.deleted_at is not null then raise exception 'Request conflict' using errcode='22023';end if;
 return jsonb_build_object('phone',prop.whatsapp_phone,'name',prop.name,'reference',existing.reference_code);
end $$;

-- Preserve fulfillment/contact and edits for existing references after destination retirement.
create or replace function public.admin_save_free_places_listing(p_property_id uuid,p_name text,p_destination_id uuid,p_whatsapp text,p_publish boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); phone text; existing public.places_properties%rowtype; verified timestamptz:=clock_timestamp();
begin
  if actor is null or not exists(select 1 from public.admin_users where user_id=actor) then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 160 or p_whatsapp is null or length(p_whatsapp)>40 or p_whatsapp !~ '^[+0-9 ().-]+$' then raise exception 'Data properti tidak valid.' using errcode='22023'; end if;
  phone:=regexp_replace(p_whatsapp,'[^0-9]','','g');
  if left(phone,2)='00' then phone:=substr(phone,3); end if;
  if left(phone,1)='0' then phone:='62'||substr(phone,2); elsif left(phone,1)='8' then phone:='62'||phone; end if;
  if phone !~ '^62[0-9]{8,13}$' or not exists(select 1 from public.places_destinations where id=p_destination_id and ((is_active and archived_at is null) or exists(select 1 from public.places_properties p where p.id=p_property_id and p.destination_id=places_destinations.id))) then raise exception 'Destinasi atau WhatsApp tidak valid.' using errcode='22023'; end if;

 select * into existing from public.places_properties where id=p_property_id for update;
 if not found or existing.status='archived' then raise exception 'Properti tidak tersedia.' using errcode='P0002';end if;
 if p_publish and existing.is_demo then raise exception 'Demo tidak dapat diterbitkan.';end if;
 update public.places_properties set name=btrim(p_name),destination_id=p_destination_id,whatsapp_phone=phone,
   status=case when p_publish then 'published' when phone<>existing.whatsapp_phone then 'pending_verification' else existing.status end,
   contact_verified_at=case when p_publish then verified when phone<>existing.whatsapp_phone then null else existing.contact_verified_at end,
   contact_verification_expires_at=case when p_publish then verified+interval '1 year' when phone<>existing.whatsapp_phone then null else existing.contact_verification_expires_at end
 where id=p_property_id;
 if p_publish then
 insert into public.places_property_verifications(property_id,verified_by,channel,evidence_note,verified_at,valid_until)
 values(p_property_id,actor,'whatsapp','Admin memeriksa WhatsApp resmi melalui Verifikasi & Terbitkan.',verified,verified+interval '1 year');
 end if;
end $$;


revoke all on function public.create_places_contact_lead(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_places_contact_lead(uuid,uuid,text,text,text,text,text) to service_role;
revoke all on function public.admin_save_free_places_listing(uuid,text,uuid,text,boolean) from public,anon;
grant execute on function public.admin_save_free_places_listing(uuid,text,uuid,text,boolean) to authenticated;
commit;
