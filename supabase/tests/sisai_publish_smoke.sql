-- Local-only SISAI permission, atomic publish, and existing booking-engine regression.
-- Fixtures are rolled back and do not touch production.
begin;
do $$
declare
  admin_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  import_id uuid := gen_random_uuid();
  v_trip_id uuid;
  booking_id uuid;
  departure_id uuid;
  visible_count integer;
begin
  if not (select relrowsecurity from pg_class where oid='public.sisai_imports'::regclass) then raise exception 'SISAI RLS is disabled.'; end if;
  if (select public from storage.buckets where id='shiap-sisai-sources') is distinct from false then raise exception 'SISAI source bucket must remain private.'; end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sisai_sources_admin_read') then raise exception 'SISAI private Storage read policy is missing.'; end if;

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (admin_id,'authenticated','authenticated',admin_id::text||'@sisai.local.test','',now(),'{}','{}',now(),now()),
    (customer_id,'authenticated','authenticated',customer_id::text||'@sisai.local.test','',now(),'{}','{}',now(),now());
  insert into public.admin_users(user_id) values(admin_id);
  insert into public.sisai_imports(id,created_by,status,draft_data)
  values(import_id,admin_id,'approved',jsonb_build_object(
    'title','SISAI Local Regression Trip','destination','Kotabaru Test','duration','2 hari',
    'base_price',125000,'trip_mode','open','categories',jsonb_build_array('Snorkeling'),
    'itinerary',jsonb_build_array(jsonb_build_object('day','Hari 1','title','Snorkeling','description','Jadwal uji')),
    'dates',jsonb_build_array(jsonb_build_object('departure_date',(current_date+90)::text,'end_date',(current_date+91)::text,'price_per_person',125000,'min_participants',1,'max_participants',4))
  ));

  perform set_config('request.jwt.claim.sub',customer_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  begin
    perform public.publish_sisai_trip(import_id);
    raise exception 'Non-admin unexpectedly published a SISAI trip.';
  exception when others then
    if sqlerrm not like '%Akses admin diperlukan%' then raise; end if;
  end;
  reset role;
  if (select status from public.sisai_imports where id=import_id)<>'approved' then raise exception 'Unauthorized publish changed SISAI status.'; end if;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  v_trip_id := public.publish_sisai_trip(import_id);
  reset role;
  if (select status from public.sisai_imports where id=import_id)<>'published' then raise exception 'SISAI draft did not move to published.'; end if;
  select d.id into departure_id from public.trip_departures d where d.trip_id=v_trip_id;
  if departure_id is null then raise exception 'Publishing did not create a trip departure.'; end if;

  perform set_config('request.jwt.claim.sub',customer_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  select id into booking_id from public.create_booking_order(
    'SISAI Smoke Customer','+620000000000','sisai-smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','trip','service_name','SISAI Local Regression Trip','variant','Open Trip',
      'date_start',(current_date+90)::text,'quantity',1,'guests',2,'trip_id',v_trip_id,'departure_id',departure_id))
  ) r;
  if booking_id is null then raise exception 'Existing booking RPC did not accept published SISAI Trip.'; end if;
  reset role;
  select booked_seats into visible_count from public.trip_departures where id=departure_id;
  if visible_count<>2 then raise exception 'Booking engine inventory hold was not created for SISAI departure.'; end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','anon',true);
  set local role anon;
  begin
    select count(*) into visible_count from public.sisai_imports;
    if visible_count<>0 then raise exception 'Anonymous role can read SISAI imports.'; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'SISAI local smoke passed: private source bucket, admin publish, published departure, existing booking RPC and inventory hold, anonymous isolation.';
end $$;
rollback;
