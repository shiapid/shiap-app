-- M2: explicit ownership approval and tenant-scoped content access. No billing activation.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
create table public.places_property_members(
 property_id uuid not null references public.places_properties(id) on delete restrict,user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in('OWNER','MANAGER','STAFF')),status text not null default 'ACTIVE' check(status in('ACTIVE','REVOKED')),
 verified_at timestamptz not null,verified_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(property_id,user_id)
);
create index places_members_user_idx on public.places_property_members(user_id,status);
create table public.places_ownership_claims(
 id uuid primary key default gen_random_uuid(),request_id uuid not null,user_id uuid references auth.users(id) on delete set null,
 property_id uuid references public.places_properties(id) on delete restrict,requested_property_id uuid references public.places_properties(id) on delete restrict,property_name text not null,destination_id uuid not null references public.places_destinations(id) on delete restrict,
 official_whatsapp text,relationship text not null default '',evidence_note text not null default '',
 status text not null default 'PENDING' check(status in('PENDING','NEEDS_INFO','APPROVED','REJECTED','WITHDRAWN','ERASED')),
 review_note text not null default '',reviewed_by uuid references auth.users(id) on delete set null,reviewed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,request_id),
 check(status in('WITHDRAWN','ERASED') or length(btrim(property_name)) between 2 and 160 and official_whatsapp ~ '^62[0-9]{8,13}$' and official_whatsapp is not null),
 check(length(evidence_note)<=2000 and length(review_note)<=2000 and length(relationship)<=100)
);
create index places_claims_user_date_idx on public.places_ownership_claims(user_id,created_at desc);
create index places_claims_status_date_idx on public.places_ownership_claims(status,created_at desc);
create unique index places_one_open_claim on public.places_ownership_claims(user_id,property_id) where property_id is not null and status in('PENDING','NEEDS_INFO');
create table public.places_partner_audit_logs(
 id uuid primary key default gen_random_uuid(),property_id uuid references public.places_properties(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null,subject_user_id uuid references auth.users(id) on delete set null,
 event text not null,old_state jsonb,new_state jsonb,created_at timestamptz not null default now()
);
alter table public.places_property_members enable row level security;
alter table public.places_ownership_claims enable row level security;
alter table public.places_partner_audit_logs enable row level security;
revoke all on public.places_property_members,public.places_ownership_claims,public.places_partner_audit_logs from public,anon,authenticated;
grant select(property_id,user_id,role,status,verified_at,created_at,updated_at) on public.places_property_members to authenticated;
grant select on public.places_ownership_claims,public.places_partner_audit_logs to authenticated;
grant all on public.places_property_members,public.places_ownership_claims,public.places_partner_audit_logs to service_role;
create policy places_members_own_read on public.places_property_members for select to authenticated using(user_id=(select auth.uid()) or public.is_shiap_admin());
create policy places_claims_own_read on public.places_ownership_claims for select to authenticated using(user_id=(select auth.uid()) or public.is_shiap_admin());
create policy places_partner_audit_admin on public.places_partner_audit_logs for select to authenticated using(public.is_shiap_admin());
create function shiap_private.places_member(p_property_id uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.places_property_members m where m.property_id=p_property_id and m.user_id=auth.uid() and m.status='ACTIVE' and m.verified_at is not null and (not p_write or m.role in('OWNER','MANAGER')));
$$;
revoke all on function shiap_private.places_member(uuid,boolean) from public,anon;
grant execute on function shiap_private.places_member(uuid,boolean) to authenticated,service_role;
create policy places_draft_member_read on public.places_property_profiles for select to authenticated using(shiap_private.places_member(property_id,false));
create policy places_subscription_member_read on public.places_subscriptions for select to authenticated using(shiap_private.places_member(property_id,false));
create function shiap_private.places_partner_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb; b jsonb;begin
 if tg_op<>'INSERT' then a:=to_jsonb(old);end if;if tg_op<>'DELETE' then b:=to_jsonb(new);end if;
 insert into public.places_partner_audit_logs(property_id,actor_id,subject_user_id,event,old_state,new_state)
 values(coalesce((b->>'property_id')::uuid,(a->>'property_id')::uuid),auth.uid(),coalesce((b->>'user_id')::uuid,(a->>'user_id')::uuid),tg_table_name||':'||tg_op,
 case when a is null then null else jsonb_build_object('status',a->>'status','role',a->>'role','id',a->>'id') end,
 case when b is null then null else jsonb_build_object('status',b->>'status','role',b->>'role','id',b->>'id') end);
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function shiap_private.places_partner_audit() from public,anon,authenticated;
create trigger places_members_audit after insert or update or delete on public.places_property_members for each row execute function shiap_private.places_partner_audit();
create trigger places_claims_audit after insert or update or delete on public.places_ownership_claims for each row execute function shiap_private.places_partner_audit();
create function public.partner_request_places_ownership(p_request_id uuid,p_property_id uuid,p_name text,p_destination_id uuid,p_whatsapp text,p_relationship text,p_evidence text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();existing public.places_ownership_claims%rowtype;prop public.places_properties%rowtype;phone text;result uuid;begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Akun dengan email terverifikasi diperlukan.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,8102));
 if p_request_id is null or p_name is null or length(btrim(p_name)) not between 2 and 160 or p_relationship is null or length(btrim(p_relationship)) not between 3 and 100 or p_evidence is null or length(btrim(p_evidence)) not between 10 and 2000 or p_whatsapp is null or length(p_whatsapp)>40 or p_whatsapp !~ '^[+0-9 ().-]+$' then raise exception 'Data pengajuan tidak valid.' using errcode='22023';end if;
 phone:=regexp_replace(p_whatsapp,'[^0-9]','','g');if left(phone,2)='00' then phone:=substr(phone,3);end if;if left(phone,1)='0' then phone:='62'||substr(phone,2);elsif left(phone,1)='8' then phone:='62'||phone;end if;
 if phone !~ '^62[0-9]{8,13}$' then raise exception 'WhatsApp tidak valid.' using errcode='22023';end if;
 select * into existing from public.places_ownership_claims where user_id=actor and request_id=p_request_id;
 if found then if existing.status in('WITHDRAWN','ERASED') or existing.requested_property_id is distinct from p_property_id or existing.property_name<>btrim(p_name) or existing.destination_id is distinct from p_destination_id or existing.official_whatsapp<>phone or existing.relationship<>btrim(p_relationship) or existing.evidence_note<>btrim(p_evidence) then raise exception 'Request berubah. Gunakan pengajuan baru.' using errcode='PT409';end if;return existing.id;end if;
 if (select count(*) from public.places_ownership_claims where user_id=actor and created_at>now()-interval '1 day')>=5 then raise exception 'Batas pengajuan harian tercapai.' using errcode='22023';end if;
 if p_property_id is not null then
  select * into prop from public.places_properties where id=p_property_id and status='published' and not is_demo and contact_verified_at is not null and(contact_verification_expires_at is null or contact_verification_expires_at>now());
  if not found or prop.destination_id is distinct from p_destination_id then raise exception 'Listing tidak tersedia.' using errcode='P0002';end if;
 else
  if not exists(select 1 from public.places_destinations where id=p_destination_id and is_active and archived_at is null) then raise exception 'Destinasi tidak aktif.' using errcode='22023';end if;
 end if;
 insert into public.places_ownership_claims(request_id,user_id,property_id,requested_property_id,property_name,destination_id,official_whatsapp,relationship,evidence_note)
 values(p_request_id,actor,p_property_id,p_property_id,btrim(p_name),p_destination_id,phone,btrim(p_relationship),btrim(p_evidence)) returning id into result;return result;
end $$;
revoke all on function public.partner_request_places_ownership(uuid,uuid,text,uuid,text,text,text) from public,anon;
grant execute on function public.partner_request_places_ownership(uuid,uuid,text,uuid,text,text,text) to authenticated;
create function public.admin_review_places_claim(p_claim_id uuid,p_decision text,p_note text,p_confirm_verified boolean default false,p_property_id uuid default null,p_role text default 'OWNER') returns uuid language plpgsql security definer set search_path='' as $$
declare claim public.places_ownership_claims%rowtype;prop public.places_properties%rowtype;target uuid;matches integer;begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 if p_decision not in('APPROVED','REJECTED','NEEDS_INFO') or p_note is null or length(btrim(p_note)) not between 10 and 2000 or p_role not in('OWNER','MANAGER','STAFF') then raise exception 'Catatan hasil verifikasi dan keputusan wajib valid.' using errcode='22023';end if;
 select * into claim from public.places_ownership_claims where id=p_claim_id for update;
 if not found then raise exception 'Pengajuan tidak ditemukan.' using errcode='P0002';end if;
 if claim.status='APPROVED' and p_decision='APPROVED' then return claim.property_id;end if;
 if claim.status not in('PENDING','NEEDS_INFO') then raise exception 'Pengajuan sudah diselesaikan.' using errcode='PT409';end if;
 target:=coalesce(p_property_id,claim.property_id);
 if p_decision='APPROVED' then
  if p_confirm_verified is distinct from true or claim.user_id is null or not exists(select 1 from auth.users where id=claim.user_id and email_confirmed_at is not null) then raise exception 'Verifikasi kewenangan dan akun diperlukan.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(claim.destination_id::text||lower(claim.property_name)||claim.official_whatsapp,8103));
  if target is null then
   select count(*),min(id::text)::uuid into matches,target from public.places_properties where lower(btrim(name))=lower(btrim(claim.property_name)) and destination_id=claim.destination_id and whatsapp_phone=claim.official_whatsapp and status<>'archived';
   if matches>1 then raise exception 'Terdapat beberapa listing. Pilih properti yang diverifikasi.' using errcode='22023';end if;
   if target is null then target:=public.admin_create_free_places_listing(claim.property_name,claim.destination_id,claim.official_whatsapp);end if;
  end if;
  select * into prop from public.places_properties where id=target for update;
  if not found or prop.is_demo or prop.status<>'published' or prop.contact_verified_at is null or (prop.contact_verification_expires_at is not null and prop.contact_verification_expires_at<=now()) or prop.whatsapp_phone<>claim.official_whatsapp or prop.destination_id<>claim.destination_id then raise exception 'Verifikasi listing dan perubahan kontak melalui Admin Places terlebih dahulu.' using errcode='22023';end if;
  insert into public.places_property_members(property_id,user_id,role,status,verified_at,verified_by) values(target,claim.user_id,p_role,'ACTIVE',now(),auth.uid()) on conflict(property_id,user_id) do update set role=excluded.role,status='ACTIVE',verified_at=now(),verified_by=auth.uid(),updated_at=now();
 end if;
 insert into public.places_partner_audit_logs(property_id,actor_id,subject_user_id,event,new_state) values(target,auth.uid(),claim.user_id,'CLAIM_REVIEW_NOTE',jsonb_build_object('claim_id',p_claim_id,'decision',p_decision,'note',btrim(p_note)));
 update public.places_ownership_claims set property_id=target,status=p_decision,review_note=case p_decision when 'APPROVED' then 'Kewenangan disetujui. Akses properti tersedia di Portal Mitra.' when 'REJECTED' then 'Pengajuan belum dapat disetujui. Hubungi SHIAP untuk penjelasan.' else 'Informasi tambahan diperlukan. Hubungi SHIAP atau tarik dan ajukan kembali informasi yang lengkap.' end,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_claim_id;
 return target;
end $$;
revoke all on function public.admin_review_places_claim(uuid,text,text,boolean,uuid,text) from public,anon;
grant execute on function public.admin_review_places_claim(uuid,text,text,boolean,uuid,text) to authenticated;
create function public.admin_set_places_member(p_property_id uuid,p_user_id uuid,p_role text,p_active boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 if p_role not in('OWNER','MANAGER','STAFF') or p_active is null or p_note is null or length(btrim(p_note)) not between 10 and 2000 then raise exception 'Peran dan catatan verifikasi wajib diisi.' using errcode='22023';end if;
 if p_active and not exists(select 1 from public.places_ownership_claims where property_id=p_property_id and user_id=p_user_id and status='APPROVED') then raise exception 'Pengajuan kewenangan harus disetujui lebih dahulu.' using errcode='22023';end if;
 update public.places_property_members set role=p_role,status=case when p_active then 'ACTIVE' else 'REVOKED' end,verified_by=auth.uid(),verified_at=case when p_active then now() else verified_at end,updated_at=now() where property_id=p_property_id and user_id=p_user_id;
 if not found then raise exception 'Membership tidak ditemukan.' using errcode='P0002';end if;
 insert into public.places_partner_audit_logs(property_id,actor_id,subject_user_id,event,new_state) values(p_property_id,auth.uid(),p_user_id,'MEMBER_DECISION',jsonb_build_object('role',p_role,'active',p_active,'note',btrim(p_note)));
end $$;
revoke all on function public.admin_set_places_member(uuid,uuid,text,boolean,text) from public,anon;
grant execute on function public.admin_set_places_member(uuid,uuid,text,boolean,text) to authenticated;
create function public.partner_withdraw_places_claim(p_claim_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login diperlukan.' using errcode='42501';end if;
 update public.places_ownership_claims set status='WITHDRAWN',property_name='',official_whatsapp=null,relationship='',evidence_note='',updated_at=now() where id=p_claim_id and user_id=auth.uid() and status in('PENDING','NEEDS_INFO');
 if not found then raise exception 'Pengajuan tidak dapat ditarik.' using errcode='22023';end if;
end $$;
revoke all on function public.partner_withdraw_places_claim(uuid) from public,anon;
grant execute on function public.partner_withdraw_places_claim(uuid) to authenticated;


-- Private normalized media. Clients cannot read/write this bucket directly, even if unrelated permissive policies exist.
create table public.places_property_media(
 id uuid primary key,property_id uuid not null references public.places_properties(id) on delete restrict,
 object_path text not null unique,source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),byte_size integer not null check(byte_size between 1 and 5242880),
 content_type text not null default 'image/webp' check(content_type='image/webp'),created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),deleted_at timestamptz
);
create index places_property_media_property_idx on public.places_property_media(property_id,created_at desc) where deleted_at is null;
alter table public.places_property_media enable row level security;
revoke all on public.places_property_media from public,anon,authenticated;
grant select(id,property_id,byte_size,content_type,created_at,deleted_at) on public.places_property_media to authenticated;
grant all on public.places_property_media to service_role;
create policy places_media_member_metadata on public.places_property_media for select to authenticated using(public.is_shiap_admin() or shiap_private.places_member(property_id,false));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('places-premium-media','places-premium-media',false,5242880,array['image/webp']) on conflict(id) do nothing;
do $$begin if exists(select 1 from storage.buckets where id='places-premium-media' and public) then raise exception 'Existing media bucket must not be public.';end if;end $$;
create policy places_media_client_isolation on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'places-premium-media') with check(bucket_id<>'places-premium-media');
create function public.server_register_places_media(p_id uuid,p_property_id uuid,p_actor uuid,p_path text,p_sha256 text,p_bytes integer) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.places_property_media%rowtype;begin
 perform 1 from public.places_properties where id=p_property_id and status<>'archived' for update;
 if not found or not(exists(select 1 from public.admin_users where user_id=p_actor) or exists(select 1 from public.places_property_members where property_id=p_property_id and user_id=p_actor and status='ACTIVE' and role in('OWNER','MANAGER'))) then raise exception 'Akses properti tidak tersedia.' using errcode='42501';end if;
 if p_id is null or p_path is distinct from p_property_id::text||'/'||p_actor::text||'/'||p_id::text||'.webp' or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'Media tidak valid.' using errcode='22023';end if;
 select * into existing from public.places_property_media where id=p_id;
 if found then if existing.property_id<>p_property_id or existing.source_sha256<>p_sha256 or existing.deleted_at is not null then raise exception 'Request media bertentangan.' using errcode='PT409';end if;return existing.id;end if;
 if (select count(*) from public.places_property_media where property_id=p_property_id and deleted_at is null)>=50 then raise exception 'Maksimum 50 aset aktif per properti. Hapus aset yang tidak digunakan.' using errcode='22023';end if;
 insert into public.places_property_media(id,property_id,object_path,source_sha256,byte_size,created_by) values(p_id,p_property_id,p_path,p_sha256,p_bytes,p_actor);
 insert into public.places_partner_audit_logs(property_id,actor_id,event,new_state) values(p_property_id,p_actor,'MEDIA_UPLOAD',jsonb_build_object('id',p_id,'bytes',p_bytes));return p_id;
end $$;
revoke all on function public.server_register_places_media(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.server_register_places_media(uuid,uuid,uuid,text,text,integer) to service_role;
create function public.server_remove_places_media(p_id uuid,p_property_id uuid,p_actor uuid) returns text language plpgsql security definer set search_path='' as $$
declare media public.places_property_media%rowtype;begin
 perform 1 from public.places_properties where id=p_property_id for update;
 if not found or not(exists(select 1 from public.admin_users where user_id=p_actor) or exists(select 1 from public.places_property_members where property_id=p_property_id and user_id=p_actor and status='ACTIVE' and role in('OWNER','MANAGER'))) then raise exception 'Akses properti tidak tersedia.' using errcode='42501';end if;
 select * into media from public.places_property_media where id=p_id and property_id=p_property_id for update;
 if not found then raise exception 'Media tidak tersedia.' using errcode='P0002';end if;
 if exists(select 1 from public.places_property_profiles where property_id=p_property_id and (coalesce(cover_image_url,'') like '%'||p_id::text||'%' or exists(select 1 from unnest(gallery_urls)u where u like '%'||p_id::text||'%'))) or exists(select 1 from public.places_profile_publications where property_id=p_property_id and profile::text like '%'||p_id::text||'%') then raise exception 'Lepaskan aset dari draft dan publikasi yang disetujui sebelum menghapus.' using errcode='PT409';end if;
 update public.places_property_media set deleted_at=coalesce(deleted_at,now()) where id=p_id;
 insert into public.places_partner_audit_logs(property_id,actor_id,event,new_state) values(p_property_id,p_actor,'MEDIA_REMOVE',jsonb_build_object('id',p_id));return media.object_path;
end $$;
revoke all on function public.server_remove_places_media(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_remove_places_media(uuid,uuid,uuid) to service_role;


create function shiap_private.save_places_profile(p_property_id uuid,p_version integer,p_profile jsonb,p_submit boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare old_row public.places_property_profiles%rowtype;next_version integer;media_url text;media_id uuid;begin
 if auth.uid() is null or not (exists(select 1 from public.admin_users where user_id=auth.uid()) or shiap_private.places_member(p_property_id,true)) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;
 if not shiap_private.places_valid_profile(p_profile) then raise exception 'Konten profil tidak valid.' using errcode='22023';end if;
 perform 1 from public.places_properties where id=p_property_id and status<>'archived' for update;
 if not found then raise exception 'Properti tidak tersedia.' using errcode='P0002';end if;
 if not exists(select 1 from public.admin_users where user_id=auth.uid()) then perform 1 from public.places_property_members where property_id=p_property_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','MANAGER') for share;if not found then raise exception 'Akses properti telah dicabut.' using errcode='42501';end if;end if;
 for media_url in select p_profile->>'cover_image_url' union all select jsonb_array_elements_text(coalesce(p_profile->'gallery_urls','[]')) loop
  if media_url ~ '^https://app[.]shiap[.]id/api/places/media/' then
   media_id:=substring(media_url from '^https://app[.]shiap[.]id/api/places/media/([0-9a-f-]{36})$')::uuid;
   if media_id is null or not exists(select 1 from public.places_property_media where id=media_id and property_id=p_property_id and deleted_at is null) then raise exception 'Media harus milik properti ini dan masih aktif.' using errcode='22023';end if;
  end if;
 end loop;
 select * into old_row from public.places_property_profiles where property_id=p_property_id for update;
 if coalesce(old_row.version,0) is distinct from p_version then raise exception 'Profil berubah. Muat ulang.' using errcode='PT409';end if;
 next_version:=coalesce(old_row.version,0)+1;
 insert into public.places_property_profiles(property_id,description,cover_image_url,gallery_urls,capacity,facilities,room_summaries,starting_price_idr,policies,map_url,video_urls,check_in_time,check_out_time,cancellation_information,social_links,version,review_status,submitted_at)
 values(p_property_id,coalesce(p_profile->>'description',''),nullif(p_profile->>'cover_image_url',''),array(select jsonb_array_elements_text(coalesce(p_profile->'gallery_urls','[]'))),nullif(p_profile->>'capacity','')::integer,array(select jsonb_array_elements_text(coalesce(p_profile->'facilities','[]'))),coalesce(p_profile->'room_summaries','[]'),nullif(p_profile->>'starting_price_idr','')::bigint,coalesce(p_profile->>'policies',''),nullif(p_profile->>'map_url',''),array(select jsonb_array_elements_text(coalesce(p_profile->'video_urls','[]'))),coalesce(p_profile->>'check_in_time',''),coalesce(p_profile->>'check_out_time',''),coalesce(p_profile->>'cancellation_information',''),coalesce(p_profile->'social_links','{}'),next_version,case when p_submit then 'IN_REVIEW' else 'DRAFT' end,case when p_submit then now() else null end)
 on conflict(property_id) do update set description=excluded.description,cover_image_url=excluded.cover_image_url,gallery_urls=excluded.gallery_urls,capacity=excluded.capacity,facilities=excluded.facilities,room_summaries=excluded.room_summaries,starting_price_idr=excluded.starting_price_idr,policies=excluded.policies,map_url=excluded.map_url,video_urls=excluded.video_urls,check_in_time=excluded.check_in_time,check_out_time=excluded.check_out_time,cancellation_information=excluded.cancellation_information,social_links=excluded.social_links,version=excluded.version,review_status=excluded.review_status,submitted_at=excluded.submitted_at,reviewed_at=null,reviewed_by=null;
 return next_version;
end $$;

revoke all on function shiap_private.save_places_profile(uuid,integer,jsonb,boolean) from public,anon,authenticated;

create or replace function public.admin_save_places_premium_profile(p_property_id uuid,p_version integer,p_profile jsonb,p_submit boolean default false) returns integer language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501';end if;return shiap_private.save_places_profile(p_property_id,p_version,p_profile,p_submit);end $$;
create function public.partner_save_places_profile(p_property_id uuid,p_version integer,p_profile jsonb,p_submit boolean default false) returns integer language plpgsql security definer set search_path='' as $$
begin if not(public.is_shiap_admin() or shiap_private.places_member(p_property_id,true)) then raise exception 'Akses pengelola properti diperlukan.' using errcode='42501';end if;return shiap_private.save_places_profile(p_property_id,p_version,p_profile,p_submit);end $$;
revoke all on function public.partner_save_places_profile(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.partner_save_places_profile(uuid,integer,jsonb,boolean) to authenticated;


create index places_claims_property_idx on public.places_ownership_claims(property_id);
create index places_claims_requested_property_idx on public.places_ownership_claims(requested_property_id);
create index places_claims_destination_idx on public.places_ownership_claims(destination_id);
create index places_partner_audit_property_idx on public.places_partner_audit_logs(property_id,created_at desc);
create index places_partner_audit_event_idx on public.places_partner_audit_logs(event,created_at desc);

commit;
