begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- Existing links are explicit. A collision must be resolved before rollout.
create unique index places_verified_stay_one_to_one
  on public.places_properties(stay_property_id) where stay_property_id is not null;
revoke insert(stay_property_id,stay_mapping_verified_at), update(stay_property_id,stay_mapping_verified_at)
  on public.places_properties from public, anon, authenticated;

alter table public.stay_service_agreements
  add column stay_v2_marketing_approved_by uuid references public.admin_users(user_id) on delete restrict,
  add column stay_v2_marketing_approved_at timestamptz,
  add column stay_v2_marketing_approved_version integer,
  add constraint stay_v2_marketing_approval_complete check (
    (stay_v2_marketing_approved_at is null) = (stay_v2_marketing_approved_by is null)
    and (stay_v2_marketing_approved_at is null) = (stay_v2_marketing_approved_version is null)
  );

create function shiap_private.stay_v2_partner_marketing(p_property_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.places_properties p
    join public.stay_service_agreements a
      on a.places_property_id = p.id and a.stay_property_id = p.stay_property_id
    where p.id = p_property_id and p.stay_mapping_verified_at is not null
      and p.status = 'published' and not p.is_demo and p.contact_verified_at is not null
      and (p.contact_verification_expires_at is null or p.contact_verification_expires_at > now())
      and a.model = 'BOOKING_PARTNER' and a.status = 'ACTIVE'
      and a.stay_v2_marketing_approved_version = a.version
      and a.starts_at <= now() and a.ends_at > now()
      and exists (
        select 1 from public.places_property_members m
        join public.stay_agreement_members am on am.user_id = m.user_id and am.agreement_id = a.id
        where m.property_id = p.id and m.role = 'OWNER' and m.status = 'ACTIVE' and m.verified_at is not null
          and am.role = 'OWNER' and am.status = 'ACTIVE'
      )
  );
$$;
revoke all on function shiap_private.stay_v2_partner_marketing(uuid) from public, anon, authenticated;

create or replace function shiap_private.places_premium_visible(p_property_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select shiap_private.stay_v2_partner_marketing(p_property_id) or exists (
    select 1 from public.places_properties p
    join public.places_subscriptions s on s.property_id = p.id
    where p.id = p_property_id and p.status = 'published' and not p.is_demo
      and p.contact_verified_at is not null
      and (p.contact_verification_expires_at is null or p.contact_verification_expires_at > now())
      and s.status in ('TRIALING','ACTIVE','SCHEDULED') and s.starts_at <= now() and s.ends_at > now()
  );
$$;

create function public.stay_v2_property_access(p_property_ids uuid[])
returns table(property_id uuid, commercial_plan text, premium_content boolean, partner_status text, owner_verified boolean, contact_verified boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
    case when flags.partner then 'PARTNER' when flags.premium then 'PREMIUM' else 'FREE' end,
    flags.premium,
    case when flags.partner then 'MARKETING_ACTIVE'
      when exists(select 1 from public.stay_service_agreements a where a.places_property_id = p.id
        and (a.status = 'SUSPENDED' or a.stay_v2_marketing_approved_at is not null)) then 'INACTIVE'
      when exists(select 1 from public.stay_service_applications a where a.property_id = p.id and a.model = 'BOOKING_PARTNER'
        and a.status in ('NEW','IN_REVIEW','CONTACTED'))
        or exists(select 1 from public.stay_service_agreements a where a.places_property_id = p.id and a.status in ('DRAFT','ACTIVE')) then 'IN_REVIEW'
      else 'NONE' end,
    exists(select 1 from public.places_property_members m where m.property_id = p.id and m.role = 'OWNER' and m.status = 'ACTIVE' and m.verified_at is not null),
    p.contact_verified_at is not null and (p.contact_verification_expires_at is null or p.contact_verification_expires_at > now())
  from public.places_properties p
  cross join lateral (select shiap_private.stay_v2_partner_marketing(p.id) as partner, shiap_private.places_premium_visible(p.id) as premium) flags
  where auth.uid() is not null and p.id = any(p_property_ids)
    and (public.is_shiap_admin() or shiap_private.places_member(p.id,false));
$$;
revoke all on function public.stay_v2_property_access(uuid[]) from public, anon, authenticated;
grant execute on function public.stay_v2_property_access(uuid[]) to authenticated;

create function public.admin_reconcile_stay_v2_property(p_places_id uuid,p_stay_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare listing public.places_properties%rowtype; inventory public.stay_properties%rowtype;
begin
  if auth.uid() is null or not public.is_shiap_admin() then
    raise exception 'Akses Admin diperlukan.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note,''))) not between 10 and 500 then
    raise exception 'Catatan verifikasi pemetaan diperlukan.' using errcode = '22023';
  end if;
  select * into listing from public.places_properties where id = p_places_id for update;
  if not found or listing.is_demo or listing.status = 'archived' then
    raise exception 'Listing Places tidak tersedia.' using errcode = '22023';
  end if;
  select * into inventory from public.stay_properties where id = p_stay_id for share;
  if not found or inventory.status = 'archived' then
    raise exception 'Properti Stay tidak tersedia.' using errcode = '22023';
  end if;
  if listing.stay_property_id = p_stay_id then return; end if;
  if listing.stay_property_id is not null or exists (
    select 1 from public.places_properties where stay_property_id = p_stay_id
  ) then
    raise exception 'Salah satu properti sudah dipetakan.' using errcode = 'PT409';
  end if;
  if inventory.destination_id is not null and inventory.destination_id <> listing.destination_id then
    raise exception 'Cocokkan Master Destinasi kedua properti sebelum memetakan.' using errcode = '22023';
  end if;
  update public.places_properties set stay_property_id = p_stay_id, stay_mapping_verified_at = clock_timestamp()
    where id = p_places_id;
  insert into public.places_partner_audit_logs(property_id,actor_id,event,new_state)
    values(p_places_id,auth.uid(),'STAY_MAPPING_VERIFIED',jsonb_build_object('stay_id',p_stay_id,'note',btrim(p_note)));
exception when unique_violation then
  raise exception 'Properti Stay sudah dipetakan.' using errcode = 'PT409';
end;
$$;
revoke all on function public.admin_reconcile_stay_v2_property(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_reconcile_stay_v2_property(uuid,uuid,text) to authenticated;

create function public.admin_approve_stay_v2_marketing(p_agreement_id uuid,p_approve boolean,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare agreement public.stay_service_agreements%rowtype; property_id_before_lock uuid;
begin
  if auth.uid() is null or not public.is_shiap_admin() then
    raise exception 'Akses Admin diperlukan.' using errcode = '42501';
  end if;
  if p_approve is null or length(btrim(coalesce(p_note,''))) not between 10 and 500 then
    raise exception 'Keputusan dan catatan diperlukan.' using errcode = '22023';
  end if;
  select * into agreement from public.stay_service_agreements where id = p_agreement_id;
  if not found or agreement.places_property_id is null then
    raise exception 'Tautkan perjanjian ke listing terverifikasi.' using errcode = '22023';
  end if;
  property_id_before_lock := agreement.places_property_id;
  perform 1 from public.places_properties where id = property_id_before_lock for update;
  select * into agreement from public.stay_service_agreements where id = p_agreement_id for update;
  if not found or agreement.places_property_id is distinct from property_id_before_lock then
    raise exception 'Perjanjian berubah. Muat ulang.' using errcode = 'PT409';
  end if;
  if p_approve and (
    not exists(select 1 from public.places_properties p where p.id = agreement.places_property_id
      and p.stay_property_id = agreement.stay_property_id and p.stay_mapping_verified_at is not null
      and p.status = 'published' and not p.is_demo and p.contact_verified_at is not null
      and (p.contact_verification_expires_at is null or p.contact_verification_expires_at > now()))
    or agreement.model <> 'BOOKING_PARTNER' or agreement.status <> 'ACTIVE'
    or agreement.starts_at is null or agreement.starts_at > now() or agreement.ends_at is null or agreement.ends_at <= now()
    or not exists(select 1 from public.places_property_members m
      join public.stay_agreement_members am on am.user_id = m.user_id and am.agreement_id = agreement.id
      where m.property_id = agreement.places_property_id and m.role = 'OWNER' and m.status = 'ACTIVE'
        and m.verified_at is not null and am.role = 'OWNER' and am.status = 'ACTIVE')
    or not exists(select 1 from public.stay_service_applications a where a.property_id = agreement.places_property_id
      and a.model = 'BOOKING_PARTNER' and a.status in ('CONTACTED','CLOSED'))
  ) then
    raise exception 'Pemetaan, verifikasi, pengajuan, pemilik dan perjanjian aktif diperlukan.' using errcode = '22023';
  end if;
  update public.stay_service_agreements set
    stay_v2_marketing_approved_by = case when p_approve then auth.uid() end,
    stay_v2_marketing_approved_at = case when p_approve then clock_timestamp() end,
    stay_v2_marketing_approved_version = case when p_approve then agreement.version end
  where id = agreement.id;
  insert into public.places_partner_audit_logs(property_id,actor_id,event,new_state)
    values(agreement.places_property_id,auth.uid(),case when p_approve then 'STAY_PARTNER_MARKETING_APPROVED' else 'STAY_PARTNER_MARKETING_REVOKED' end,
      jsonb_build_object('agreement_id',agreement.id,'agreement_version',agreement.version,'note',btrim(p_note)));
end;
$$;
revoke all on function public.admin_approve_stay_v2_marketing(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_approve_stay_v2_marketing(uuid,boolean,text) to authenticated;

create function public.partner_update_stay_v2_basics(p_property_id uuid,p_destination_id uuid,p_accommodation_type text) returns void
language plpgsql security definer set search_path = '' as $$
declare listing public.places_properties%rowtype;
begin
  select * into listing from public.places_properties where id = p_property_id and status <> 'archived' and not is_demo for update;
  if not found or not shiap_private.places_member(p_property_id,true) then
    raise exception 'Akses pengelola properti diperlukan.' using errcode = '42501';
  end if;
  if p_accommodation_type is null or p_accommodation_type not in ('villa','hotel','homestay','guesthouse','resort','other')
    or (p_destination_id is distinct from listing.destination_id and (
      listing.stay_property_id is not null or not exists (
        select 1 from public.places_destinations where id = p_destination_id and is_active and archived_at is null
      ))) then
    raise exception 'Jenis atau destinasi tidak valid. Hubungi Admin untuk lokasi properti Stay yang sudah terhubung.' using errcode = '22023';
  end if;
  update public.places_properties set destination_id = p_destination_id, accommodation_type = p_accommodation_type
    where id = p_property_id and (destination_id is distinct from p_destination_id or accommodation_type is distinct from p_accommodation_type);
end;
$$;
revoke all on function public.partner_update_stay_v2_basics(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.partner_update_stay_v2_basics(uuid,uuid,text) to authenticated;

-- Publish and manage media only with current marketing entitlement. Historical invoices stay readable.
alter policy places_draft_member_read on public.places_property_profiles
  using (shiap_private.places_member(property_id,false) and shiap_private.places_premium_visible(property_id));
alter policy places_media_member_metadata on public.places_property_media
  using (public.is_shiap_admin() or (shiap_private.places_member(property_id,false) and shiap_private.places_premium_visible(property_id)));

create or replace function public.partner_save_places_profile(p_property_id uuid,p_version integer,p_profile jsonb,p_submit boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_shiap_admin() or (shiap_private.places_member(p_property_id,true)
      and shiap_private.places_premium_visible(p_property_id))) then
    raise exception 'Akses pengelola dan paket pemasaran aktif diperlukan.' using errcode = '42501';
  end if;
  return shiap_private.save_places_profile(p_property_id,p_version,p_profile,p_submit);
end;
$$;

alter function public.partner_places_analytics(uuid,integer) set schema shiap_private;
revoke all on function shiap_private.partner_places_analytics(uuid,integer) from public, anon, authenticated;
create function public.partner_places_analytics(p_property_id uuid,p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_shiap_admin() or (shiap_private.places_member(p_property_id,false)
      and shiap_private.places_premium_visible(p_property_id))) then
    raise exception 'Akses analitik properti diperlukan.' using errcode = '42501';
  end if;
  return shiap_private.partner_places_analytics(p_property_id,p_days);
end;
$$;
revoke all on function public.partner_places_analytics(uuid,integer) from public, anon, authenticated;
grant execute on function public.partner_places_analytics(uuid,integer) to authenticated;

-- Update offers prospectively. Existing invoice snapshots and subscribed periods are immutable.
update public.places_plan_settings set premium_monthly_price_idr = 199000, premium_yearly_price_idr = 1950000, trial_days = 14 where id;
alter table public.places_plan_settings alter column trial_days set default 14;
alter table public.places_plan_settings add constraint stay_v2_trial_days_fixed check (trial_days = 14);
update public.places_premium_plans set price_idr = case code when 'monthly' then 199000 else 1950000 end,
  promo_price_idr = null, promo_until = null, version = version + 1, updated_at = now()
where code in ('monthly','yearly');

create or replace function public.partner_start_places_trial(p_property_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform shiap_private.places_lock_billing_owner(p_property_id);
  select id into result from public.places_subscriptions where property_id = p_property_id and origin = 'TRIAL';
  if found then return result; end if;
  if shiap_private.stay_v2_partner_marketing(p_property_id)
    or not exists(select 1 from public.places_plan_settings where id and trial_enabled)
    or not exists(select 1 from public.places_trial_eligibility where property_id = p_property_id and eligible)
    or exists(select 1 from public.places_subscriptions where property_id = p_property_id and origin = 'PAID') then
    raise exception 'Properti belum memenuhi syarat trial Premium.' using errcode = '22023';
  end if;
  insert into public.places_subscriptions(property_id,origin,status,starts_at,ends_at)
    values(p_property_id,'TRIAL','TRIALING',now(),now()+interval '14 days') returning id into result;
  insert into public.places_partner_audit_logs(property_id,actor_id,event,new_state)
    values(p_property_id,auth.uid(),'TRIAL_STARTED',jsonb_build_object('subscription_id',result,'days',14));
  return result;
end;
$$;

create function shiap_private.stay_v2_guard_partner_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if shiap_private.stay_v2_partner_marketing(new.property_id) then
    raise exception 'Properti Partner tidak memerlukan invoice langganan.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function shiap_private.stay_v2_guard_partner_invoice() from public, anon, authenticated;
create trigger stay_v2_guard_partner_invoice before insert on public.places_billing_invoices
for each row execute function shiap_private.stay_v2_guard_partner_invoice();

commit;
