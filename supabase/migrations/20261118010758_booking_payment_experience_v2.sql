begin;

create schema if not exists shiap_private;
revoke all on schema shiap_private from public, anon;
grant usage on schema shiap_private to authenticated, service_role;

create table public.booking_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique check (secret_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz
);
alter table public.booking_guest_sessions enable row level security;
revoke all on public.booking_guest_sessions from public, anon, authenticated;
grant all on public.booking_guest_sessions to service_role;

create function shiap_private.booking_guest_id() returns uuid
language sql stable security definer set search_path='' as $$
  select id from public.booking_guest_sessions
  where current_setting('role',true)='service_role'
    and secret_hash=nullif(current_setting('shiap.guest_hash',true),'')
    and expires_at>now() and revoked_at is null
$$;
revoke all on function shiap_private.booking_guest_id() from public, anon;
grant execute on function shiap_private.booking_guest_id() to authenticated, service_role;

alter table public.booking_orders
  alter column user_id drop not null,
  add column guest_session_id uuid references public.booking_guest_sessions(id)
    default shiap_private.booking_guest_id(),
  add constraint booking_owner_required check ((user_id is null) <> (guest_session_id is null));
create index booking_orders_guest_idx on public.booking_orders(guest_session_id,created_at desc)
  where guest_session_id is not null;
alter table public.booking_payment_records alter column user_id drop not null;
alter table public.booking_payment_records
  add column review_due_at timestamptz not null default now() + interval '24 hours';
create index booking_payment_review_due_idx on public.booking_payment_records(review_due_at) where status='pending';

create table shiap_private.checkout_requests (
  request_id uuid primary key,
  user_id uuid references auth.users(id),
  guest_session_id uuid references public.booking_guest_sessions(id),
  payload_hash text not null,
  booking_id uuid not null references public.booking_orders(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table shiap_private.checkout_requests enable row level security;
revoke all on shiap_private.checkout_requests from public,anon,authenticated;

create table shiap_private.booking_rate_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
alter table shiap_private.booking_rate_limits enable row level security;
create index booking_rate_expiry_idx on shiap_private.booking_rate_limits(expires_at);
revoke all on shiap_private.booking_rate_limits from public,anon,authenticated;

create function public.booking_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
  if length(p_key)>180 or p_limit<1 or p_seconds<1 then raise exception 'Invalid limit'; end if;
  delete from shiap_private.booking_rate_limits where expires_at < now()-interval '1 day';
  insert into shiap_private.booking_rate_limits as limits(key,attempts,expires_at)
  values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set
    attempts=case when limits.expires_at<=now() then 1 else limits.attempts+1 end,
    expires_at=case when limits.expires_at<=now() then excluded.expires_at else limits.expires_at end
  returning attempts<=p_limit into allowed;
  return allowed;
end $$;
revoke all on function public.booking_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.booking_rate_limit(text,integer,integer) to service_role;

-- Preserve server pricing and the current 15-minute hold. Only the service-only
-- adapter below can supply a validated guest context. Existing RLS is unchanged.
do $$
declare name text; definition text;
begin
  foreach name in array array[
    'public.create_booking_order(text,text,text,text,jsonb)',
    'public.create_experience_booking_order(uuid,uuid,date,integer,text,text,text,text,jsonb,jsonb,jsonb,boolean)',
    'public.submit_booking_payment_proof(uuid,text,text,text,bigint)',
    'public.customer_cancel_booking(uuid)'
  ] loop
    definition:=pg_get_functiondef(name::regprocedure);
    if position('if uid is null then' in definition)=0 then
      raise exception 'Review guest compatibility for %',name;
    end if;
    definition:=replace(definition,'if uid is null then',
      'if uid is null and shiap_private.booking_guest_id() is null then');
    if name like '%submit_booking_payment_proof%' or name like '%customer_cancel_booking%' then
      if position('user_id=uid' in definition)=0 then raise exception 'Missing ownership guard %',name; end if;
      definition:=replace(definition,'user_id=uid',
        '(user_id=uid or (user_id is null and guest_session_id=shiap_private.booking_guest_id()))');
    end if;
    if name like '%submit_booking_payment_proof%' then
      definition:=replace(definition,'<>uid::text',
        '<>coalesce(uid::text,shiap_private.booking_guest_id()::text)');
      definition:=replace(definition,
        '  insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)',
        '  if exists(select 1 from public.booking_payment_records where booking_id=p_booking_id and status=''pending'') then raise exception ''Bukti transfer sedang menunggu verifikasi.''; end if;
  insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)');
    end if;
    execute definition;
  end loop;
end $$;

create function public.checkout_booking(p_actor uuid,p_guest_hash text,p_request_id uuid,p_payload jsonb,p_kind text)
returns table(id uuid,order_number text)
language plpgsql security definer set search_path='' as $$
declare guest uuid; previous shiap_private.checkout_requests%rowtype; payload_hash text;
  created_id uuid; created_code text;
begin
  perform set_config('shiap.guest_hash',coalesce(p_guest_hash,''),true);
  guest:=shiap_private.booking_guest_id();
  if p_actor is null and guest is null then raise exception 'Akses booking tidak tersedia.'; end if;
  if p_actor is not null and not exists(select 1 from auth.users where auth.users.id=p_actor) then raise exception 'Akses booking tidak tersedia.'; end if;
  if p_request_id is null or p_kind not in ('booking','experience') or jsonb_typeof(p_payload)<>'object' then raise exception 'Permintaan booking tidak valid.'; end if;
  payload_hash:=encode(extensions.digest(p_kind||p_payload::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into previous from shiap_private.checkout_requests where request_id=p_request_id;
  if found then
    if (previous.user_id=p_actor and p_actor is not null or previous.guest_session_id=guest and guest is not null)
       and previous.payload_hash=payload_hash then
      return query select b.id,b.order_number from public.booking_orders b where b.id=previous.booking_id;
      return;
    end if;
    raise exception 'Kunci checkout sudah digunakan. Periksa Pesanan Saya sebelum mencoba lagi.';
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
  if p_actor is not null then perform set_config('shiap.guest_hash','',true); end if;
  if p_kind='booking' then
    select x.id,x.order_number into created_id,created_code from public.create_booking_order(
      p_payload->>'p_customer_name',p_payload->>'p_customer_whatsapp',p_payload->>'p_customer_email',
      p_payload->>'p_customer_notes',p_payload->'p_items') x;
  else
    select x.id,x.order_number into created_id,created_code from public.create_experience_booking_order(
      (p_payload->>'p_package_id')::uuid,nullif(p_payload->>'p_session_id','')::uuid,
      (p_payload->>'p_date')::date,(p_payload->>'p_guests')::integer,
      p_payload->>'p_customer_name',p_payload->>'p_customer_whatsapp',p_payload->>'p_customer_email',
      p_payload->>'p_customer_notes',p_payload->'p_participants',p_payload->'p_addon_slugs',
      p_payload->'p_request_details',(p_payload->>'p_safety_consent')::boolean) x;
  end if;
  insert into shiap_private.checkout_requests(request_id,user_id,guest_session_id,payload_hash,booking_id)
  values(p_request_id,p_actor,case when p_actor is null then guest end,payload_hash,created_id);
  return query select created_id,created_code;
end $$;
revoke all on function public.checkout_booking(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.checkout_booking(uuid,text,uuid,jsonb,text) to service_role;

create function public.customer_booking_action(p_actor uuid,p_guest_hash text,p_booking_id uuid,p_action text,p_proof jsonb default null)
returns text language plpgsql security definer set search_path='' as $$
declare guest uuid; booking public.booking_orders%rowtype; result text;
begin
  perform set_config('shiap.guest_hash',coalesce(p_guest_hash,''),true);
  guest:=shiap_private.booking_guest_id();
  select * into booking from public.booking_orders b where b.id=p_booking_id
    and (p_actor is not null and b.user_id=p_actor or guest is not null and b.user_id is null and b.guest_session_id=guest)
    for update;
  if not found then raise exception 'Pesanan tidak ditemukan.'; end if;
  perform set_config('request.jwt.claim.sub',coalesce(booking.user_id::text,''),true);
  if p_action='proof' then
    select r.id::text into result from public.booking_payment_records r
      where r.booking_id=p_booking_id and r.storage_path=p_proof->>'path';
    if found then return result; end if;
    result:=public.submit_booking_payment_proof(p_booking_id,p_proof->>'path',p_proof->>'name',
      p_proof->>'mime',(p_proof->>'size')::bigint)::text;
  elsif p_action='cancel' then
    result:=public.customer_cancel_booking(p_booking_id);
  elsif p_action='claim' then
    if p_actor is null or guest is null or booking.user_id is not null
      or not exists(select 1 from auth.users where auth.users.id=p_actor and (email_confirmed_at is not null or phone_confirmed_at is not null)) then
      raise exception 'Masuk ke akun terverifikasi dari perangkat yang memiliki akses pesanan ini.';
    end if;
    update public.booking_orders set user_id=p_actor,guest_session_id=null where public.booking_orders.id=p_booking_id;
    update public.booking_payment_records set user_id=p_actor where booking_id=p_booking_id and user_id is null;
    insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
    values(p_booking_id,p_actor,'customer','guest_booking_claimed','Kepemilikan diverifikasi melalui akses tamu aktif dan akun terverifikasi.');
    result:='claimed';
  else raise exception 'Aksi tidak didukung.';
  end if;
  return result;
end $$;
revoke all on function public.customer_booking_action(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.customer_booking_action(uuid,text,uuid,text,jsonb) to service_role;

-- Even direct legacy proof RPC calls cannot create multiple pending records.
create function public.guard_single_pending_proof() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.booking_orders where id=new.booking_id for update;
  if new.status='pending' and exists(select 1 from public.booking_payment_records r
    where r.booking_id=new.booking_id and r.status='pending' and r.id<>new.id) then
    raise exception 'Bukti transfer sedang menunggu verifikasi.';
  end if;
  if new.user_id is null and not exists(select 1 from public.booking_orders b
    where b.id=new.booking_id and b.user_id is null and b.guest_session_id=shiap_private.booking_guest_id()) then
    raise exception 'Akses bukti pembayaran ditolak.';
  end if;
  return new;
end $$;
revoke all on function public.guard_single_pending_proof() from public,anon,authenticated;
create trigger guard_single_pending_proof before insert on public.booking_payment_records
for each row execute function public.guard_single_pending_proof();

-- New customer uploads go through server-side content validation.
drop policy if exists booking_proofs_owner_insert on storage.objects;

commit;
