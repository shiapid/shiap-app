begin;
insert into auth.users(id,email,email_confirmed_at) values('41414141-4141-4141-8141-414141414141','partner-admin@example.invalid',now()),('42424242-4242-4242-8242-424242424242','partner-a@example.invalid',now()),('43434343-4343-4343-8343-434343434343','partner-b@example.invalid',now()),('44444444-4444-4444-8444-444444444444','partner-staff@example.invalid',now());
insert into public.admin_users(user_id) values('41414141-4141-4141-8141-414141414141');
set local role authenticated;
select set_config('request.jwt.claim.sub','42424242-4242-4242-8242-424242424242',true);
do $$declare d uuid;request_id uuid:=gen_random_uuid();claim uuid;begin
 select id into d from public.destinations_public_v where is_active and archived_at is null limit 1;
 claim:=public.partner_request_places_ownership(request_id,null,'Synthetic Partner Property A',d,'080000000000','Pemilik','Synthetic claimed authority must be independently reviewed.');
 if claim<>public.partner_request_places_ownership(request_id,null,'Synthetic Partner Property A',d,'080000000000','Pemilik','Synthetic claimed authority must be independently reviewed.') then raise exception 'claim retry duplicated';end if;
 if exists(select 1 from public.places_property_members where user_id=auth.uid()) then raise exception 'claim auto granted';end if;
 begin perform public.admin_review_places_claim(claim,'APPROVED','Forged review attempt',true,null,'OWNER');raise exception 'nonadmin approval';exception when insufficient_privilege then null;end;
 perform set_config('test.claim',claim::text,true);perform set_config('test.request',request_id::text,true);perform set_config('test.destination',d::text,true);
end $$;
select set_config('request.jwt.claim.sub','41414141-4141-4141-8141-414141414141',true);
do $$declare p uuid;begin
 begin perform public.admin_review_places_claim(current_setting('test.claim')::uuid,'APPROVED','Synthetic verified authority',false,null,'OWNER');raise exception 'approval without confirmation';exception when invalid_parameter_value then null;end;
 begin perform public.admin_review_places_claim(current_setting('test.claim')::uuid,'APPROVED','Synthetic verified authority',null,null,'OWNER');raise exception 'null confirmation accepted';exception when invalid_parameter_value then null;end;
 p:=public.admin_review_places_claim(current_setting('test.claim')::uuid,'APPROVED','Synthetic authority independently verified by local Admin.',true,null,'OWNER');
 if p<>public.admin_review_places_claim(current_setting('test.claim')::uuid,'APPROVED','Idempotent approval retry',true,null,'OWNER') then raise exception 'approval duplicated property';end if;
 if exists(select 1 from public.places_subscriptions where property_id=p) then raise exception 'claim activated subscription';end if;
 if (select stay_property_id from public.places_properties where id=p) is not null then raise exception 'claim auto linked Stay';end if;
 perform set_config('test.property',p::text,true);
end $$;
select set_config('request.jwt.claim.sub','42424242-4242-4242-8242-424242424242',true);
do $$declare p uuid:=current_setting('test.property')::uuid;v integer;begin
 if not shiap_private.places_member(p,true) then raise exception 'approved owner cannot access';end if;
 if public.partner_request_places_ownership(current_setting('test.request')::uuid,null,'Synthetic Partner Property A',current_setting('test.destination')::uuid,'080000000000','Pemilik','Synthetic claimed authority must be independently reviewed.')<>current_setting('test.claim')::uuid then raise exception 'retry after approval failed';end if;
 v:=public.partner_save_places_profile(p,0,'{"description":"Synthetic owner draft must remain private until reviewed."}',true);
 if not exists(select 1 from public.places_property_profiles where property_id=p and version=v) then raise exception 'owner draft unavailable';end if;
 begin update public.places_property_members set role='OWNER' where property_id=p;raise exception 'self role mutation';exception when insufficient_privilege then null;end;
 if (select review_note from public.places_ownership_claims where id=current_setting('test.claim')::uuid) like '%independently verified%' then raise exception 'internal verification leaked';end if;
end $$;
select set_config('request.jwt.claim.sub','43434343-4343-4343-8343-434343434343',true);
do $$begin
 if exists(select 1 from public.places_property_profiles where property_id=current_setting('test.property')::uuid) then raise exception 'cross tenant draft read';end if;
 begin perform public.partner_save_places_profile(current_setting('test.property')::uuid,1,'{}',false);raise exception 'cross tenant write';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.places_ownership_claims where id=current_setting('test.claim')::uuid) then raise exception 'cross tenant claim read';end if;
end $$;
reset role;
insert into public.places_property_members(property_id,user_id,role,verified_at,verified_by) values(current_setting('test.property')::uuid,'44444444-4444-4444-8444-444444444444','STAFF',now(),'41414141-4141-4141-8141-414141414141');
insert into public.places_contact_leads(request_id,request_fingerprint,property_id,destination_id,customer_name,customer_whatsapp,reference_code,privacy_version) values(gen_random_uuid(),repeat('a',64),current_setting('test.property')::uuid,current_setting('test.destination')::uuid,'Synthetic private customer','628000000001','SHP-ZYXWV','places-contact-v1-2026-11-19');
insert into storage.objects(bucket_id,name) values('places-premium-media','synthetic-private-rls.webp');
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$begin
 if not shiap_private.places_member(current_setting('test.property')::uuid,false) then raise exception 'staff read unavailable';end if;
 begin perform public.partner_save_places_profile(current_setting('test.property')::uuid,1,'{}',false);raise exception 'staff edited content';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.places_contact_leads where property_id=current_setting('test.property')::uuid) then raise exception 'partner customer PII read';end if;
 if exists(select 1 from storage.objects where bucket_id='places-premium-media') then raise exception 'direct private media read';end if;
 begin insert into storage.objects(bucket_id,name) values('places-premium-media','forged.webp');raise exception 'direct private media write';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.server_register_places_media(uuid,uuid,uuid,text,text,integer)','EXECUTE') then raise exception 'public media registration';end if;
end $$;
select set_config('request.jwt.claim.sub','41414141-4141-4141-8141-414141414141',true);
select public.admin_set_places_member(current_setting('test.property')::uuid,'42424242-4242-4242-8242-424242424242','OWNER',false,'Synthetic revoke decision');
select set_config('request.jwt.claim.sub','42424242-4242-4242-8242-424242424242',true);
do $$begin
 if exists(select 1 from public.places_property_profiles where property_id=current_setting('test.property')::uuid) then raise exception 'revoked owner read';end if;
 begin perform public.partner_save_places_profile(current_setting('test.property')::uuid,1,'{}',false);raise exception 'revoked owner write';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PLACES_PARTNER_RLS_PASS';
rollback;
