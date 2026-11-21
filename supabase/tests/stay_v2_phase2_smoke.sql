-- Synthetic Phase 2 regression. The transaction leaves no persistent fixtures.
begin;
create temp table fixture (
  admin_id uuid default gen_random_uuid(),
  owner_id uuid default gen_random_uuid(),
  other_id uuid default gen_random_uuid(),
  places_id uuid default gen_random_uuid(),
  other_places_id uuid default gen_random_uuid(),
  stay_id uuid default gen_random_uuid(),
  old_stay_id uuid default gen_random_uuid(),
  agreement_id uuid default gen_random_uuid(),
  trial_id uuid,
  destination_id uuid
);
grant all on fixture to authenticated, anon;
insert into fixture(destination_id)
  select id from public.places_destinations where is_active order by slug limit 1;
insert into auth.users(id,email,email_confirmed_at)
  select admin_id,admin_id::text||'@example.invalid',now() from fixture union all
  select owner_id,owner_id::text||'@example.invalid',now() from fixture union all
  select other_id,other_id::text||'@example.invalid',now() from fixture;
insert into public.admin_users(user_id) select admin_id from fixture;
insert into public.stay_properties(id,name,slug,location,destination_id,status)
  select stay_id,'Synthetic linked Stay',stay_id::text,'Synthetic',destination_id,'published' from fixture union all
  select old_stay_id,'Synthetic legacy Stay',old_stay_id::text,'Synthetic',destination_id,'published' from fixture;
insert into public.places_properties(id,name,slug,destination_id,whatsapp_phone,accommodation_type,status,contact_verified_at)
  select places_id,'Synthetic verified Places',places_id::text,destination_id,'6280000000000','villa','published',now() from fixture union all
  select other_places_id,'Synthetic unverified Places',other_places_id::text,destination_id,'6280000000001','other','draft',null from fixture;
insert into public.places_property_members(property_id,user_id,role,verified_at,verified_by)
  select places_id,owner_id,'OWNER',now(),admin_id from fixture;
insert into public.places_trial_eligibility(property_id,eligible,updated_by) select places_id,true,admin_id from fixture;
update public.places_plan_settings set trial_enabled = true, billing_enabled = true where id;
update public.payment_settings set bank_name='SYNTHETIC BANK',account_name='TEST ONLY',account_number='00000000',is_active=true where id;
update public.places_premium_plans set available = true, effective_at = now() where code = 'monthly';

set local role anon;
do $$
begin
  if has_function_privilege('anon','public.stay_v2_property_access(uuid[])','execute')
    or has_function_privilege('anon','public.partner_update_stay_v2_basics(uuid,uuid,text)','execute')
    or has_function_privilege('anon','public.admin_reconcile_stay_v2_property(uuid,uuid,text)','execute')
    or exists (select 1 from public.places_public_directory_v where id=(select other_places_id from fixture)) then
    raise exception 'Anonymous entitlement/mutation or unverified listing exposed';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
do $$
declare f fixture%rowtype;
begin
  select * into f from fixture;
  if not exists (select 1 from public.stay_v2_property_access(array[f.places_id])
    where commercial_plan='FREE' and not premium_content and owner_verified and contact_verified) then
    raise exception 'Verified owner/listing must begin at Free';
  end if;
  if exists (select 1 from public.stay_v2_property_access(array[f.other_places_id])) then
    raise exception 'Cross-property access exposed';
  end if;
  begin
    perform public.admin_reconcile_stay_v2_property(f.places_id,f.stay_id,'Forged mapping review');
    raise exception 'Owner mapped operational inventory';
  exception when insufficient_privilege then null; end;
  begin
    perform public.partner_save_places_profile(f.places_id,0,'{}',false);
    raise exception 'Free owner can save Premium content';
  exception when insufficient_privilege then null; end;
  begin
    perform public.partner_places_analytics(f.places_id,30);
    raise exception 'Free owner can see Premium analytics';
  exception when insufficient_privilege then null; end;
  perform public.partner_update_stay_v2_basics(f.places_id,f.destination_id,'homestay');
  begin
    perform public.partner_update_stay_v2_basics(f.other_places_id,f.destination_id,'homestay');
    raise exception 'Cross-tenant basic write accepted';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub',(select admin_id::text from fixture),true);
select public.admin_reconcile_stay_v2_property(places_id,stay_id,'Admin verified the same synthetic property.') from fixture;
do $$
declare f fixture%rowtype;
begin
  select * into f from fixture;
  begin
    perform public.admin_reconcile_stay_v2_property(f.other_places_id,f.stay_id,'Attempt a second Places identity');
    raise exception 'A Stay property was mapped twice';
  exception when sqlstate 'PT409' then null; end;
  begin
    update public.places_properties set stay_mapping_verified_at=now() where id=f.places_id;
    raise exception 'Direct mapping write accepted';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.places_public_directory_v where id=f.places_id and stay_slug=f.stay_id::text)
    or not exists(select 1 from public.stay_properties where id=f.old_stay_id and status='published') then
    raise exception 'Legacy route identity or approved link unavailable';
  end if;
  if exists (select 1 from public.stay_v2_property_access(array[f.other_places_id]) where contact_verified or owner_verified) then
    raise exception 'An unverified property acquired a verified flag';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
update fixture set trial_id=public.partner_start_places_trial(places_id);
do $$
declare f fixture%rowtype;
begin
  select * into f from fixture;
  if public.partner_start_places_trial(f.places_id) <> f.trial_id or not exists (
    select 1 from public.places_subscriptions where id=f.trial_id and ends_at-starts_at=interval '14 days'
  ) or not exists (
    select 1 from public.stay_v2_property_access(array[f.places_id]) where commercial_plan='PREMIUM' and premium_content
  ) then raise exception 'Trial duration, idempotency or plan is incorrect'; end if;
  perform public.partner_save_places_profile(f.places_id,0,'{"description":"A synthetic draft stays private when the trial expires."}',false);
end;
$$;

reset role;
update public.places_subscriptions set starts_at=now()-interval '15 days',ends_at=now()-interval '1 day'
  where id=(select trial_id from fixture);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
do $$
declare f fixture%rowtype;
begin
  select * into f from fixture;
  if not exists(select 1 from public.stay_v2_property_access(array[f.places_id]) where commercial_plan='FREE')
    or exists(select 1 from public.places_property_profiles where property_id=f.places_id)
    or public.partner_start_places_trial(f.places_id) <> f.trial_id then
    raise exception 'Expired trial failed to downgrade or allowed a second trial';
  end if;
end;
$$;

reset role;
insert into public.stay_service_applications(property_id,user_id,request_id,model,message,status)
  select places_id,owner_id,gen_random_uuid(),'BOOKING_PARTNER','Application reviewed by synthetic Admin','CONTACTED' from fixture;
insert into public.stay_service_agreements(
 id,stay_property_id,places_property_id,model,status, scope,responsibilities,contract_reference,
 starts_at,ends_at,fee_type,fee_bps,billing_basis,payment_route,settlement_party,
 account_manager_id,last_request_id,last_payload,updated_by
)
select agreement_id,stay_id,places_id,'BOOKING_PARTNER','ACTIVE','Synthetic approved scope','Synthetic operational responsibilities','CONTRACT-SYNTHETIC',
 now()-interval '1 day',now()+interval '1 year','COMMISSION',1500,'EMBEDDED_BOOKING_MARGIN','EXISTING_SHIAP_BANK_TRANSFER','SHIAP',
 admin_id,gen_random_uuid(),'{}',admin_id from fixture;
insert into public.stay_agreement_members(agreement_id,user_id,role,status,verified_by)
  select agreement_id,owner_id,'OWNER','ACTIVE',admin_id from fixture;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
do $$
begin
  if exists(select 1 from public.stay_v2_property_access(array[(select places_id from fixture)]) where commercial_plan='PARTNER') then
    raise exception 'Legacy active agreement implicitly activated Partner';
  end if;
  begin
    perform public.admin_approve_stay_v2_marketing((select agreement_id from fixture),true,'Forged Partner approval');
    raise exception 'Owner activated Partner';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub',(select admin_id::text from fixture),true);
select public.admin_approve_stay_v2_marketing(agreement_id,true,'Verified signed synthetic agreement and ownership.') from fixture;
select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
do $$
declare f fixture%rowtype;
begin
  select * into f from fixture;
  if not exists(select 1 from public.stay_v2_property_access(array[f.places_id])
    where commercial_plan='PARTNER' and premium_content and partner_status='MARKETING_ACTIVE')
    or not exists(select 1 from public.places_property_profiles where property_id=f.places_id) then
    raise exception 'Partner marketing or preserved draft unavailable';
  end if;
  begin
    perform public.partner_create_places_invoice(f.places_id,plan.id,plan.version,plan.price_idr,gen_random_uuid())
      from public.places_premium_plans plan where plan.code='monthly';
    raise exception 'Partner can create a paid subscription invoice';
  exception when invalid_parameter_value then
    if sqlerrm not like '%Partner tidak memerlukan invoice%' then raise; end if;
  end;
  begin
    perform public.partner_places_analytics(f.other_places_id,30);
    raise exception 'Partner analytics cross-tenant access';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
update public.stay_agreement_members set status='REVOKED' where agreement_id=(select agreement_id from fixture);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
do $$
begin
  if exists(select 1 from public.stay_v2_property_access(array[(select places_id from fixture)]) where premium_content) then
    raise exception 'Revoked agreement membership retained access';
  end if;
end;
$$;
reset role;

select 'STAY_V2_PHASE2_RLS_PASS';
rollback;
