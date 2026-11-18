-- Local-only RLS regression test. All fixtures are rolled back.
begin;
do $$
declare
  customer_a uuid := gen_random_uuid();
  customer_b uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  booking_a uuid := gen_random_uuid();
  booking_b uuid := gen_random_uuid();
  proof_a text;
  proof_b text;
  visible_count integer;
  changed_count integer;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (customer_a,'authenticated','authenticated',customer_a::text||'@local.test','',now(),'{}','{}',now(),now()),
    (customer_b,'authenticated','authenticated',customer_b::text||'@local.test','',now(),'{}','{}',now(),now()),
    (admin_id,'authenticated','authenticated',admin_id::text||'@local.test','',now(),'{}','{}',now(),now());

  insert into public.admin_users(user_id) values(admin_id);
  insert into public.site_icon_settings(icon_key,label,image_path,alt_text)
  values('home','Beranda','site-icons/rls-test/home.png','Ikon Beranda')
  on conflict(icon_key) do nothing;

  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp)
  values
    (booking_a,'RLS-A-'||replace(customer_a::text,'-',''),customer_a,'RLS customer A','+620000000001'),
    (booking_b,'RLS-B-'||replace(customer_b::text,'-',''),customer_b,'RLS customer B','+620000000002');

  proof_a := customer_a::text||'/'||booking_a::text||'/rls-a.pdf';
  proof_b := customer_b::text||'/'||booking_b::text||'/rls-b.pdf';
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  values
    ('booking-payment-proofs',proof_a,customer_a,customer_a::text,jsonb_build_object('mimetype','application/pdf','size',12)),
    ('booking-payment-proofs',proof_b,customer_b,customer_b::text,jsonb_build_object('mimetype','application/pdf','size',12));

  perform set_config('request.jwt.claim.sub',customer_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;

  select count(*) into visible_count from public.booking_orders where id in (booking_a,booking_b);
  if visible_count <> 1 then raise exception 'Customer booking isolation failed: visible % rows.',visible_count; end if;

  select count(*) into visible_count from storage.objects where bucket_id='booking-payment-proofs' and name in (proof_a,proof_b);
  if visible_count <> 1 then raise exception 'Payment proof isolation failed: visible % objects.',visible_count; end if;

  select count(*) into visible_count from public.site_icon_settings where icon_key='home' and is_active;
  if visible_count <> 1 then raise exception 'Active public icon setting is not readable.'; end if;

  select count(*) into visible_count from public.home_hero_settings where id=true;
  if visible_count <> 1 then raise exception 'Public homepage hero settings are not readable.'; end if;

  begin
    update public.home_hero_settings set title_line_one='Unauthorized edit' where id=true;
    get diagnostics changed_count = row_count;
    if changed_count <> 0 then raise exception 'Customer changed public homepage hero settings.'; end if;
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.booking_orders set customer_notes='unauthorized' where id=booking_b;
    get diagnostics changed_count = row_count;
    if changed_count <> 0 then raise exception 'Customer changed another customer booking.'; end if;
  exception when insufficient_privilege then
    null; -- Direct customer writes are also blocked by table grants.
  end;

  reset role;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  update public.site_icon_settings set label='RLS admin test' where icon_key='home';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then raise exception 'Admin icon setting update was not authorized.'; end if;
  update public.home_hero_settings set title_line_one='RLS admin test' where id=true;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then raise exception 'Admin homepage hero update was not authorized.'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','anon',true);
  set local role anon;
  begin
    select count(*) into visible_count from public.booking_orders;
    if visible_count <> 0 then raise exception 'Anonymous booking read exposed % rows.',visible_count; end if;
  exception when insufficient_privilege then
    null; -- No table grant to anon also satisfies the access boundary.
  end;
  reset role;

  raise notice 'Local RLS smoke test passed: owner-only bookings/proofs, cross-customer write blocked, anonymous access blocked.';
end $$;
rollback;
