-- Run after 20261119100000_places_directory_v1.sql in local/staging only.
-- Checks public projection grants and denies direct access to internal records.
begin;
do $$
declare t text;
begin
  foreach t in array array[
    'places_destinations','places_properties','places_property_profiles',
    'places_property_verifications','places_admin_audit_logs','places_plan_settings','places_wa_click_events'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid=('public.'||t)::regclass) then
      raise exception 'RLS is not enabled on %',t;
    end if;
  end loop;
  if has_table_privilege('anon','public.places_properties','select') then raise exception 'anon can select property base rows'; end if;
  if has_table_privilege('anon','public.places_property_verifications','select') then raise exception 'anon can read verification evidence'; end if;
  if has_table_privilege('anon','public.places_admin_audit_logs','select') then raise exception 'anon can read admin audit logs'; end if;
  if has_table_privilege('anon','public.places_wa_click_events','select') then raise exception 'anon can read click analytics'; end if;
  if not has_table_privilege('anon','public.places_public_directory_v','select') then raise exception 'anon cannot read the public allowlist view'; end if;
  if not has_table_privilege('anon','public.places_public_destinations_v','select') then raise exception 'anon cannot read public destinations'; end if;
  if not has_table_privilege('anon','public.places_public_plan_v','select') then raise exception 'anon cannot read public plan settings'; end if;
  if has_function_privilege('anon','public.admin_record_places_contact_verification(uuid,text,text,text,timestamp with time zone)','execute') then
    raise exception 'anon can execute contact verification';
  end if;
  if not has_function_privilege('authenticated','public.admin_record_places_contact_verification(uuid,text,text,text,timestamp with time zone)','execute') then
    raise exception 'authenticated role cannot call admin verification RPC';
  end if;
end $$;
do $$
declare v_property uuid;
begin
  insert into public.places_properties(slug,name,destination_id,accommodation_type,whatsapp_phone,status)
    values('places-smoke-only','Local smoke property',(select id from public.places_destinations where slug='teluk-tamiang'),'villa','6281234567890','draft')
    returning id into v_property;
  insert into public.places_property_profiles(property_id,description) values(v_property,'Temporary RLS smoke profile');
  update public.places_plan_settings set premium_monthly_price_idr=premium_monthly_price_idr where id=true;
  if exists(select 1 from public.places_public_directory_v where id=v_property) then
    raise exception 'Draft smoke property leaked into public directory';
  end if;
  if (select count(*) from public.places_admin_audit_logs where entity_type in ('property','profile','plan')) < 3 then
    raise exception 'Places write audit trigger did not record property/profile/plan changes';
  end if;
end $$;
rollback;
