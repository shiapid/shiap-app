-- Local synthetic regression only. Caller must target local Docker Supabase.
begin;
insert into public.places_properties(id,slug,name,destination_id,accommodation_type,whatsapp_phone,status,contact_verified_at)
values('77777777-7777-4777-8777-777777777777','qa-lead-smoke','Synthetic Lead Smoke',(select id from public.places_destinations limit 1),'other','6280000000000','published',now());
select public.create_places_contact_lead('88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','Synthetic Visitor','6280000000001',repeat('a',64),'SHP-2ABCD','places-contact-v1-2026-11-19');
select public.create_places_contact_lead('88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','Synthetic Visitor','6280000000001',repeat('a',64),'SHP-3ABCD','places-contact-v1-2026-11-19');
do $$ begin
 if (select count(*) from public.places_contact_leads where request_id='88888888-8888-4888-8888-888888888888')<>1 then raise exception 'retry duplicated lead';end if;
 if not exists(select 1 from public.places_contact_leads where reference_code='SHP-2ABCD' and status='HANDOFF_INITIATED' and privacy_notified_at is not null and destination_id=(select destination_id from public.places_properties where id='77777777-7777-4777-8777-777777777777')) then raise exception 'lead snapshot incorrect';end if;
 begin perform public.create_places_contact_lead('88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','Other','6280000000002',repeat('b',64),'SHP-4ABCD','places-contact-v1-2026-11-19');raise exception 'changed request accepted';exception when invalid_parameter_value then null;end;
 if has_table_privilege('anon','public.places_contact_leads','SELECT') or has_function_privilege('authenticated','public.create_places_contact_lead(uuid,uuid,text,text,text,text,text)','EXECUTE') then raise exception 'public access';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
do $$begin if exists(select 1 from public.places_contact_leads) then raise exception 'nonadmin saw lead';end if;end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.places_properties set status='suspended' where id='77777777-7777-4777-8777-777777777777';
do $$begin begin perform public.create_places_contact_lead(gen_random_uuid(),'77777777-7777-4777-8777-777777777777','Synthetic Visitor','6280000000001',repeat('a',64),'SHP-5ABCD','places-contact-v1-2026-11-19');raise exception 'unpublished accepted';exception when no_data_found then null;end;end $$;
select 'PLACES_LEAD_SQL_RLS_PASS';
rollback;
