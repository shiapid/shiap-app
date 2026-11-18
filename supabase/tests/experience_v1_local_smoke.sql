-- Local-only functional smoke test. Run with psql against 127.0.0.1:54322.
-- All auth, booking, payment, session, and resource fixtures roll back.
begin;
do $$
declare
  test_user uuid:=gen_random_uuid(); test_email text; v_booking_id uuid; order_code text;
  record_id uuid; total numeric; enabled boolean; service_id uuid; v_product_id uuid;
  session_one uuid:=gen_random_uuid(); session_two uuid:=gen_random_uuid(); resource_id uuid:=gen_random_uuid();
  package_id uuid; product_id uuid; private_booking_id uuid; private_total numeric; private_payment_enabled boolean;
  participant_payload jsonb:='[{"full_name":"DEMO Participant","health_screening_confirmed":true,"safety_rules_accepted":true}]'::jsonb;
  private_participants jsonb:='[{"full_name":"DEMO Private Participant 1","health_screening_confirmed":true,"safety_rules_accepted":true},{"full_name":"DEMO Private Participant 2","health_screening_confirmed":true,"safety_rules_accepted":true}]'::jsonb;
begin
  if (select is_active from public.payment_settings where id=true) is distinct from false then raise exception 'DEMO payment instructions must stay disabled during Experience QA'; end if;
  if (select count(*) from public.shiap_experience_categories where slug in ('ocean-academy','beach-dining','ocean-adventure','outdoor-adventure','private-special-moments'))<>5 then raise exception 'Experience categories seed is incomplete'; end if;
  if (select count(*) from public.shiap_experience_products where is_demo)<5 then raise exception 'Experience products seed is incomplete'; end if;
  if (select count(*) from public.shiap_experience_packages where is_demo)<16 then raise exception 'Experience package seed is incomplete'; end if;
  if exists(select 1 from public.shiap_experience_packages where slug like '%hunting%' and status='published') then raise exception 'In-water spearfishing package must remain unpublished'; end if;
  if not (select relrowsecurity from pg_class where oid='public.shiap_experience_booking_records'::regclass) then raise exception 'Experience participant RLS is disabled'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='shiap_experience_booking_records' and policyname='experience_booking_owner_or_admin_read') then raise exception 'Experience owner/admin policy is missing'; end if;

  test_email:=gen_random_uuid()::text||'@example.invalid';
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(test_user,'authenticated','authenticated',test_email,'',now(),'{}'::jsonb,'{}'::jsonb,now(),now());
  insert into public.admin_users(user_id) values(test_user);
  perform set_config('request.jwt.claim.sub',test_user::text,true);

  select p.id,e.id into v_product_id,service_id from public.shiap_experience_products p
  join public.shiap_experience_packages k on k.product_id=p.id
  join public.shiap_experiences e on e.id=k.catalog_service_id
  where p.slug='freediving-class' and k.slug='discovery-freediving';
  select k.id into package_id from public.shiap_experience_packages k where k.product_id=v_product_id and k.slug='discovery-freediving';

  begin
    perform x.id from public.create_experience_booking_order(
      package_id,null,current_date+7,1,'Preview Test','0000000000',test_email,null,
      participant_payload,'[]'::jsonb,'{}'::jsonb,true
    ) x;
    raise exception 'Preview unexpectedly created an Experience order';
  exception when check_violation then
    if sqlerrm <> 'Experience demo hanya tersedia sebagai pratinjau.' then raise; end if;
  end;
  begin
    perform x.id from public.create_booking_order(
      'Preview Test','0000000000',test_email,null,
      jsonb_build_array(jsonb_build_object('service_type','activity','service_catalog_id',service_id,
        'service_name','Preview Test','date_start',current_date+7,'guests',1,'quantity',1))
    ) x;
    raise exception 'Preview unexpectedly created a universal booking';
  exception when check_violation then
    if sqlerrm <> 'Experience demo hanya tersedia sebagai pratinjau.' then raise; end if;
  end;
  if exists(select 1 from public.booking_orders where user_id=test_user) then
    raise exception 'Preview checkout left a booking or finance source behind';
  end if;

  -- Under this rollback-only transaction, exercise the same fixture as a real product.
  update public.shiap_experience_products set is_demo=false where id=v_product_id;
  update public.shiap_experience_packages set is_demo=false where id=package_id;

  select x.id,x.order_number into v_booking_id,order_code from public.create_experience_booking_order(
    package_id,null,current_date+7,1,'DEMO Smoke User','0000000000',test_email,null,
    participant_payload,jsonb_build_array('underwater-photo'),jsonb_build_object('special_requests','DEMO smoke'),true
  ) x;
  select total_amount,payment_enabled into total,enabled from public.booking_orders where id=v_booking_id;
  if total<>900000 or enabled then raise exception 'Request-to-book total/payment gate mismatch (total %, enabled %)',total,enabled; end if;
  if not exists(select 1 from public.finance_booking_cost_snapshots f where f.booking_id=v_booking_id and f.product_id=service_id) then raise exception 'Finance cost snapshot did not capture Experience package catalog id'; end if;
  select r.id into record_id from public.shiap_experience_booking_records r where r.booking_id=v_booking_id and r.request_status='pending';
  perform set_config('shiap.test_booking_id',v_booking_id::text,true);
  if record_id is null then raise exception 'Request-to-book record missing'; end if;

  begin
    insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
    values(v_booking_id,test_user,'experience-smoke/pending.jpg','pending.jpg','image/jpeg',123);
    raise exception 'SMOKE FAILED: payment proof was accepted before admin approval';
  exception when others then
    if sqlerrm like 'SMOKE FAILED:%' or position('Pembayaran belum dibuka' in sqlerrm)=0 then raise; end if;
  end;

  perform public.admin_review_experience_request(record_id,'approve','DEMO smoke approval');
  select payment_enabled into enabled from public.booking_orders where id=v_booking_id;
  if not enabled or (select request_status from public.shiap_experience_booking_records where id=record_id)<>'approved' then raise exception 'Admin approval did not unlock payment'; end if;
  begin
    perform public.submit_booking_payment_proof(v_booking_id,test_user::text||'/'||v_booking_id::text||'/demo-proof.jpg','demo-proof.jpg','image/jpeg',123);
    raise exception 'SMOKE FAILED: demo payment proof was accepted after Experience approval';
  exception when others then
    if sqlerrm like 'SMOKE FAILED:%' or sqlerrm <> 'Pembayaran transfer manual sedang dinonaktifkan.' then raise; end if;
  end;

  -- Verify session-level capacity is serialized and cannot be exceeded.
  update public.shiap_experience_packages set booking_mode='scheduled_session',requires_manual_approval=false
    where id=package_id;
  insert into public.shiap_experience_sessions(id,package_id,starts_at,ends_at,capacity,status,location_note,weather_status,safety_plan_verified)
  values(session_one,package_id,now()+interval '48 hours',now()+interval '50 hours',1,'open','DEMO smoke location','approved',true);
  select x.id into v_booking_id from public.create_experience_booking_order(
    package_id,session_one,current_date+2,1,'DEMO Smoke User','0000000000',test_email,null,
    participant_payload,'[]'::jsonb,'{}'::jsonb,true
  ) x;
  begin
    perform x.id from public.create_experience_booking_order(
      package_id,session_one,current_date+2,1,'DEMO Smoke User','0000000000',test_email,null,
      participant_payload,'[]'::jsonb,'{}'::jsonb,true
    ) x;
    raise exception 'SMOKE FAILED: session capacity was exceeded';
  exception when others then
    if sqlerrm like 'SMOKE FAILED:%' or position('Kapasitas sesi tidak mencukupi' in sqlerrm)=0 then raise; end if;
  end;

  insert into public.shiap_experience_resources(id,name,resource_type,verification_status,is_active)
  values(resource_id,'DEMO Smoke Instructor','instructor','verified',true);
  insert into public.shiap_experience_sessions(id,package_id,starts_at,ends_at,capacity,status,location_note,weather_status,safety_plan_verified)
  values(session_two,package_id,now()+interval '49 hours',now()+interval '51 hours',2,'open','DEMO overlap location','approved',true);
  insert into public.shiap_experience_session_resources(session_id,resource_id) values(session_one,resource_id);
  begin
    insert into public.shiap_experience_session_resources(session_id,resource_id) values(session_two,resource_id);
    raise exception 'SMOKE FAILED: overlapping shared resource assignment was accepted';
  exception when others then
    if sqlerrm like 'SMOKE FAILED:%' or position('bertumpang tindih' in sqlerrm)=0 then raise; end if;
  end;

  -- Private session booking uses the same RPC, server price and session capacity.
  update public.shiap_experience_packages set booking_mode='private_session',pricing_basis='per_session',requires_manual_approval=false
    where id=package_id;
  select x.id into private_booking_id from public.create_experience_booking_order(
    package_id,session_two,current_date+3,2,'DEMO Private User','0000000000',test_email,null,
    private_participants,'[]'::jsonb,'{"private_request":"DEMO local private session"}'::jsonb,true
  ) x;
  select total_amount,payment_enabled into private_total,private_payment_enabled from public.booking_orders where id=private_booking_id;
  if private_total<>750000 or not private_payment_enabled then raise exception 'Private session authoritative price or payment state mismatch.'; end if;
  if not exists(select 1 from public.shiap_experience_booking_records where booking_id=private_booking_id and booking_mode='private_session' and participant_count=2 and request_status='not_required') then raise exception 'Private session booking record was not saved correctly.'; end if;

  raise notice 'PASS: seeded catalog, RLS metadata, authoritative price/add-on, request approval/payment gate, scheduled capacity, private booking, and resource conflict';
end $$;
set local role authenticated;
do $$
begin
  if (select count(*) from public.shiap_experience_booking_records where booking_id=current_setting('shiap.test_booking_id')::uuid)<>1 then raise exception 'Experience owner RLS did not expose the owner record'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform id from public.shiap_experience_booking_records limit 1;
    raise exception 'SMOKE FAILED: anonymous role read private participant data';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous role cannot read private participant data';
  end;
end $$;
reset role;
rollback;
