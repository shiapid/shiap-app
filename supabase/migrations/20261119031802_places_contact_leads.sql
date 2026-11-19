begin;
create table public.places_contact_leads(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 property_id uuid not null references public.places_properties(id) on delete restrict,destination_id uuid not null references public.places_destinations(id) on delete restrict,
 customer_name text not null check(length(btrim(customer_name)) between 2 and 100),customer_whatsapp text check(customer_whatsapp ~ '^62[0-9]{8,13}$'),
 reference_code text not null unique check(reference_code ~ '^SHP-[A-HJ-NP-Z2-9]{5}$'),status text not null default 'HANDOFF_INITIATED' check(status='HANDOFF_INITIATED'),
 followup_status text not null default 'NEW' check(followup_status in('NEW','CONTACTED','CLOSED')),
 privacy_version text not null check(privacy_version='places-contact-v1-2026-11-19'),privacy_notified_at timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null,deleted_at timestamptz);
create index places_contact_leads_created_idx on public.places_contact_leads(created_at desc);
alter table public.places_contact_leads enable row level security;
revoke all on public.places_contact_leads from public,anon,authenticated;
grant select on public.places_contact_leads to authenticated;
create policy places_contact_leads_admin_read on public.places_contact_leads for select to authenticated using(public.is_shiap_admin());
grant all on public.places_contact_leads to service_role;
create function public.create_places_contact_lead(p_request_id uuid,p_property_id uuid,p_name text,p_phone text,p_fingerprint text,p_reference text,p_privacy_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prop public.places_properties%rowtype; existing public.places_contact_leads%rowtype;
begin
 if p_request_id is null or p_name is null or length(btrim(p_name)) not between 2 and 100 or p_phone is null or p_phone !~ '^62[0-9]{8,13}$' or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_privacy_version is distinct from 'places-contact-v1-2026-11-19' then raise exception 'Invalid lead' using errcode='22023';end if;
 select * into prop from public.places_properties where id=p_property_id for share;
 if not found or prop.status<>'published' or prop.is_demo or prop.contact_verified_at is null or (prop.contact_verification_expires_at is not null and prop.contact_verification_expires_at<=now()) or not exists(select 1 from public.places_destinations where id=prop.destination_id and is_active) then raise exception 'Property unavailable' using errcode='P0002';end if;
 insert into public.places_contact_leads(request_id,request_fingerprint,property_id,destination_id,customer_name,customer_whatsapp,reference_code,privacy_version)
 values(p_request_id,p_fingerprint,prop.id,prop.destination_id,btrim(p_name),p_phone,p_reference,p_privacy_version)
 on conflict(request_id) do nothing;
 select * into existing from public.places_contact_leads where request_id=p_request_id;
 if existing.request_fingerprint<>p_fingerprint or existing.property_id<>p_property_id or existing.deleted_at is not null then raise exception 'Request conflict' using errcode='22023';end if;
 return jsonb_build_object('phone',prop.whatsapp_phone,'name',prop.name,'reference',existing.reference_code);
end $$;
revoke all on function public.create_places_contact_lead(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_places_contact_lead(uuid,uuid,text,text,text,text,text) to service_role;
commit;
