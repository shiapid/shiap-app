begin;
create table public.notification_settings (
  id boolean primary key default true check(id), email_enabled boolean not null default false,
  sender_name text not null default 'SHIAP' check(length(sender_name) between 1 and 80 and sender_name !~ E'[\r\n<>]'),
  admin_email text not null default '' check(length(admin_email)<=254),
  email_events text[] not null default array['booking_created','payment_reminder','proof_received','payment_verified','payment_rejected','booking_cancelled','booking_expired','travel_reminder'],
  payment_reminders boolean not null default true,
  reminder_minutes integer not null default 5 check(reminder_minutes between 1 and 10),
  travel_reminders boolean not null default true,
  verified_sender text, provider_verified_at timestamptz, smtp_test_confirmed_at timestamptz, verified_transport text,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
  check(not email_enabled or (provider_verified_at is not null and verified_sender is not null and smtp_test_confirmed_at is not null))
);
insert into public.notification_settings(id) values(true);
create table public.notification_events (
  id uuid primary key default gen_random_uuid(), booking_id uuid references public.booking_orders(id) on delete cascade,
  booking_item_id uuid references public.booking_items(id) on delete cascade,
  event_type text not null check(event_type in('booking_created','payment_reminder','proof_received','payment_verified','payment_rejected','booking_cancelled','booking_expired','travel_reminder','approval_required','activity_today','delivery_failed')),
  priority text not null default 'normal' check(priority in('normal','high')),
  deduplication_key text not null unique,
  scheduled_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index notification_events_recent on public.notification_events(created_at desc,id);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.notification_events(id) on delete cascade,
  channel text not null check(channel in('email','admin')), audience text not null check(audience in('customer','admin')),
  recipient text not null default '', state text not null check(state in('available','queued','processing','sent','retry','failed','skipped')),
  attempts integer not null default 0 check(attempts between 0 and 5), scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(), first_attempt_at timestamptz,
  lease_id uuid, locked_until timestamptz, dispatch_started_at timestamptz, last_error text, provider_reference text,
  message jsonb, updated_at timestamptz not null default now(), unique(event_id,channel,audience)
);
create index notification_delivery_jobs on public.notification_deliveries(scheduled_at) where channel='email' and state in('queued','retry','processing');
create table public.notification_reads (
  event_id uuid not null references public.notification_events(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade, read_at timestamptz not null default now(), primary key(event_id,admin_id)
);
create table public.notification_smtp_tests (
  id uuid primary key default gen_random_uuid(), admin_id uuid not null references auth.users(id) on delete cascade,
  recipient text not null, token_hash text not null, transport_fingerprint text not null,
  state text not null default 'created' check(state in('created','accepted','uncertain','failed','confirmed')),
  expires_at timestamptz not null default now()+interval '15 minutes', created_at timestamptz not null default now(), confirmed_at timestamptz, error_code text
);
alter table public.notification_smtp_tests enable row level security;
revoke all on public.notification_smtp_tests from public,anon,authenticated;
grant all on public.notification_smtp_tests to service_role;
create table public.notification_whatsapp_templates (
  id text primary key, label text not null, body text not null check(length(body) between 1 and 4000), enabled boolean not null default true
);
insert into public.notification_whatsapp_templates(id,label,body) values
 ('booking_created','Konfirmasi booking',E'Halo {{customer_name}}, pesanan {{booking_code}} telah dibuat.\n{{services}}\nTotal pembayaran 100%: {{total}}\nBatas pembayaran: {{deadline}}\n{{access_instructions}}\n{{booking_url}}'),
 ('payment_instructions','Instruksi pembayaran',E'Pesanan {{booking_code}} — transfer penuh 100% sebesar {{total}}.\n{{bank}}\nBatas: {{deadline}}\nUnggah bukti di Pesanan Saya. Bukti akan diverifikasi terhadap dana masuk.\n{{access_instructions}}\n{{booking_url}}'),
 ('payment_reminder','Pengingat pembayaran',E'Halo {{customer_name}}, pengingat pembayaran pesanan {{booking_code}}. Total 100% {{total}}, batas {{deadline}}.\n{{access_instructions}}\n{{booking_url}}'),
 ('proof_received','Bukti diterima',E'Bukti transfer pesanan {{booking_code}} telah diterima dan sedang menunggu verifikasi admin terhadap dana masuk. Ini belum merupakan konfirmasi pembayaran lunas.\n{{access_instructions}}'),
 ('payment_verified','Pembayaran diverifikasi',E'Halo {{customer_name}}, pembayaran penuh pesanan {{booking_code}} telah diverifikasi admin.\n{{services}}\n{{schedule}}\n{{access_instructions}}\n{{booking_url}}'),
 ('payment_rejected','Pembayaran perlu tindakan',E'Pesanan {{booking_code}} memerlukan tindak lanjut bukti transfer. Periksa alasan dan instruksi di Pesanan Saya atau hubungi SHIAP.\n{{access_instructions}}\n{{booking_url}}'),
 ('booking_cancelled','Pembatalan pesanan',E'Halo {{customer_name}}, pesanan {{booking_code}} telah dibatalkan atau kedaluwarsa. Jika sudah transfer, hubungi SHIAP untuk pemeriksaan manual. Pesan ini tidak mengonfirmasi refund.\n{{access_instructions}}'),
 ('travel_reminder','Pengingat perjalanan / check-in',E'Halo {{customer_name}}, pengingat untuk pesanan {{booking_code}}.\n{{services}}\n{{schedule}}\n{{location}}\n{{access_instructions}}'),
 ('follow_up','Tindak lanjut pelanggan',E'Halo {{customer_name}}, kami menghubungi Anda terkait pesanan {{booking_code}}. Silakan balas untuk bantuan SHIAP.');
create table public.notification_whatsapp_activity (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.booking_orders(id) on delete cascade,
  template_id text not null references public.notification_whatsapp_templates(id),
  operator_id uuid references auth.users(id) on delete set null,
  state text not null default 'selected' check(state in('selected','opened','manual_sent')),
  selected_at timestamptz not null default now(), opened_at timestamptz, manually_confirmed_at timestamptz
);

alter table public.notification_settings enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_whatsapp_templates enable row level security;
alter table public.notification_whatsapp_activity enable row level security;
revoke all on public.notification_settings,public.notification_events,public.notification_deliveries,public.notification_reads,public.notification_whatsapp_templates,public.notification_whatsapp_activity from public,anon,authenticated;
grant all on public.notification_settings,public.notification_events,public.notification_deliveries,public.notification_reads,public.notification_whatsapp_templates,public.notification_whatsapp_activity to service_role;
grant select on public.notification_settings,public.notification_events,public.notification_deliveries,public.notification_reads,public.notification_whatsapp_templates,public.notification_whatsapp_activity to authenticated;
grant insert,update on public.notification_reads to authenticated;
grant update on public.notification_whatsapp_templates to authenticated;
create policy notification_settings_admin on public.notification_settings for select to authenticated using(public.is_shiap_admin());
create policy notification_events_admin on public.notification_events for select to authenticated using(public.is_shiap_admin());
create policy notification_deliveries_admin on public.notification_deliveries for select to authenticated using(public.is_shiap_admin());
create policy notification_templates_read on public.notification_whatsapp_templates for select to authenticated using(public.is_shiap_admin());
create policy notification_templates_update on public.notification_whatsapp_templates for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy notification_whatsapp_admin on public.notification_whatsapp_activity for select to authenticated using(public.is_shiap_admin());
create policy notification_reads_own on public.notification_reads for all to authenticated using(public.is_shiap_admin() and admin_id=(select auth.uid())) with check(public.is_shiap_admin() and admin_id=(select auth.uid()));

create function shiap_private.enqueue_notification(p_booking uuid,p_type text,p_key text,p_item uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare event_id uuid; s public.notification_settings%rowtype; recipient text; audience text;
begin
  insert into public.notification_events(booking_id,booking_item_id,event_type,deduplication_key,priority)
    values(p_booking,p_item,p_type,p_key,case when p_type in('proof_received','approval_required','payment_rejected','delivery_failed') then 'high' else 'normal' end)
    on conflict(deduplication_key) do nothing returning id into event_id;
  if event_id is null then return null; end if;
  -- All writes below are part of the booking transaction. External dispatch
  -- happens in a separate request and cannot observe these rows before commit.
  if p_type not in('payment_reminder','travel_reminder') then
    insert into public.notification_deliveries(event_id,channel,audience,state) values(event_id,'admin','admin','available');
  end if;
  select * into s from public.notification_settings where id=true;
  if not s.email_enabled or p_type='delivery_failed' then return event_id; end if;
  for audience,recipient in
    select 'customer',btrim(b.customer_email) from public.booking_orders b where b.id=p_booking and p_type=any(s.email_events)
    union all select 'admin',btrim(s.admin_email) where p_type not in('payment_reminder','travel_reminder')
  loop
    if recipient is not null and length(recipient)<=254 and recipient ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then
      insert into public.notification_deliveries(event_id,channel,audience,recipient,state) values(event_id,'email',audience,recipient,'queued');
    end if;
  end loop;
  return event_id;
end $$;
revoke all on function shiap_private.enqueue_notification(uuid,text,text,uuid) from public,anon,authenticated;

create function shiap_private.booking_notification_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='booking_orders' then
    if old.total_amount=0 and new.total_amount>0 then perform shiap_private.enqueue_notification(new.id,'booking_created','booking-created:'||new.id); end if;
    if new.order_status is distinct from old.order_status and new.order_status in('cancelled','expired') then
      perform shiap_private.enqueue_notification(new.id,'booking_'||new.order_status,'booking-'||new.order_status||':'||new.id);
    end if;
    if new.payment_status='paid' and old.payment_status is distinct from 'paid'
      and exists(select 1 from public.finance_transaction_entries e where e.booking_id=new.id and e.entry_type='payment' and e.status='posted' and e.amount=new.total_amount and length(btrim(coalesce(e.external_reference,'')))>=3) then
      perform shiap_private.enqueue_notification(new.id,'payment_verified','payment-verified:'||new.id);
    end if;
  elsif tg_table_name='booking_payment_records' then
    if tg_op='INSERT' and new.status='pending' then perform shiap_private.enqueue_notification(new.booking_id,'proof_received','proof-received:'||new.id);
    elsif tg_op='UPDATE' and new.status='rejected' and old.status is distinct from 'rejected' then perform shiap_private.enqueue_notification(new.booking_id,'payment_rejected','proof-rejected:'||new.id); end if;
  elsif tg_table_name='shiap_experience_booking_records' and new.request_status='pending' then
    perform shiap_private.enqueue_notification(new.booking_id,'approval_required','approval:'||new.id);
  end if;
  return new;
end $$;
revoke all on function shiap_private.booking_notification_events() from public,anon,authenticated;
create trigger notification_booking_event after update on public.booking_orders for each row execute function shiap_private.booking_notification_events();
create trigger notification_proof_event after insert or update of status on public.booking_payment_records for each row execute function shiap_private.booking_notification_events();
create trigger notification_approval_event after insert on public.shiap_experience_booking_records for each row execute function shiap_private.booking_notification_events();

create function shiap_private.notification_eligible(p_event uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(case e.event_type
    when 'payment_reminder' then s.payment_reminders and b.order_status in('pending_confirmation','confirmed') and b.payment_status='unpaid' and b.payment_enabled
      and b.inventory_hold_expires_at>now() and b.inventory_hold_expires_at<=now()+make_interval(mins=>s.reminder_minutes)
      and not exists(select 1 from public.booking_payment_records p where p.booking_id=b.id and p.status in('pending','approved'))
    when 'travel_reminder' then s.travel_reminders and b.order_status='confirmed' and b.payment_status='paid'
      and exists(select 1 from public.booking_items i where i.id=e.booking_item_id and i.date_start>=(now() at time zone 'Asia/Makassar')::date)
    when 'activity_today' then b.order_status in('confirmed','completed')
    when 'proof_received' then exists(select 1 from public.booking_payment_records p where p.booking_id=b.id and p.status='pending') and b.order_status not in('cancelled','expired','rejected')
    when 'payment_verified' then b.payment_status='paid' and b.order_status not in('cancelled','expired','rejected')
    when 'payment_rejected' then b.payment_status<>'paid' and b.order_status not in('cancelled','expired','rejected')
    when 'booking_cancelled' then b.order_status='cancelled'
    when 'booking_expired' then b.order_status='expired'
    when 'approval_required' then exists(select 1 from public.shiap_experience_booking_records r where r.booking_id=b.id and r.request_status='pending')
    else b.order_status not in('cancelled','expired','rejected') end,false)
  from public.notification_events e join public.booking_orders b on b.id=e.booking_id cross join public.notification_settings s where e.id=p_event and s.id=true
$$;
revoke all on function shiap_private.notification_eligible(uuid) from public,anon,authenticated;
grant execute on function shiap_private.notification_eligible(uuid) to service_role;

create function public.notification_schedule() returns void language plpgsql security invoker set search_path='' as $$
declare r record; s public.notification_settings%rowtype; day date:=(now() at time zone 'Asia/Makassar')::date;
begin
  select * into s from public.notification_settings where id=true;
  if s.email_enabled and s.payment_reminders then
    for r in select id from public.booking_orders b where b.order_status in('pending_confirmation','confirmed') and b.payment_status='unpaid' and b.payment_enabled
      and b.inventory_hold_expires_at>now() and b.inventory_hold_expires_at<=now()+make_interval(mins=>s.reminder_minutes)
      and not exists(select 1 from public.booking_payment_records p where p.booking_id=b.id and p.status in('pending','approved'))
    loop perform shiap_private.enqueue_notification(r.id,'payment_reminder','payment-reminder:'||r.id); end loop;
  end if;
  for r in select i.id,i.booking_id,i.date_start,es.starts_at from public.booking_items i join public.booking_orders b on b.id=i.booking_id
    left join public.shiap_experience_booking_records er on er.booking_item_id=i.id
    left join public.shiap_experience_sessions es on es.id=er.session_id
    where b.order_status in('confirmed','completed') and i.date_start between day and day+1
  loop
    if r.date_start=day then perform shiap_private.enqueue_notification(r.booking_id,'activity_today','activity-today:'||r.id||':'||day,r.id); end if;
    -- Exact 24-hour lead only when an authoritative timestamp exists. Date-only
    -- products receive an H-1 reminder without inventing a departure time.
    if s.email_enabled and s.travel_reminders and
      (r.starts_at>now() and r.starts_at<=now()+interval '24 hours' or r.starts_at is null and r.date_start=day+1) then
      perform shiap_private.enqueue_notification(r.booking_id,'travel_reminder','travel-reminder:'||r.id,r.id);
    end if;
  end loop;
end $$;
revoke all on function public.notification_schedule() from public,anon,authenticated;
grant execute on function public.notification_schedule() to service_role;
grant execute on function shiap_private.enqueue_notification(uuid,text,text,uuid) to service_role;

create function public.notification_claim(p_limit integer,p_lease uuid) returns setof public.notification_deliveries
language plpgsql security invoker set search_path='' as $$
declare job public.notification_deliveries%rowtype; s public.notification_settings%rowtype; event public.notification_events%rowtype;
begin
  select * into s from public.notification_settings where id=true;
  for job in select * from public.notification_deliveries d where d.channel='email'
    and (d.state in('queued','retry') or d.state='processing' and d.locked_until<now()) and d.scheduled_at<=now()
    order by d.scheduled_at,d.id for update skip locked limit least(greatest(p_limit,1),25)
  loop
    select * into event from public.notification_events where id=job.event_id;
    if job.dispatch_started_at is not null then
      update public.notification_deliveries set state='failed',last_error='SMTP_DELIVERY_UNCERTAIN',lease_id=null,locked_until=null,updated_at=now() where id=job.id;
      perform shiap_private.enqueue_notification(event.booking_id,'delivery_failed','delivery-failed:'||job.id);
    elsif job.attempts>=5 or job.first_attempt_at<now()-interval '23 hours' then
      update public.notification_deliveries set state='failed',last_error='RETRY_WINDOW_EXHAUSTED',lease_id=null,locked_until=null,updated_at=now() where id=job.id;
      perform shiap_private.enqueue_notification(event.booking_id,'delivery_failed','delivery-failed:'||job.id);
    elsif not s.email_enabled or job.audience='customer' and not(event.event_type=any(s.email_events)) or not coalesce(shiap_private.notification_eligible(job.event_id),false) then
      update public.notification_deliveries set state='skipped',last_error='NO_LONGER_ELIGIBLE',lease_id=null,locked_until=null,updated_at=now() where id=job.id;
    else
      update public.notification_deliveries set state='processing',attempts=attempts+1,lease_id=p_lease,locked_until=now()+interval '90 seconds',first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now() where id=job.id returning * into job;
      return next job;
    end if;
  end loop;
end $$;
revoke all on function public.notification_claim(integer,uuid) from public,anon,authenticated;
grant execute on function public.notification_claim(integer,uuid) to service_role;
create function public.notification_finish(p_id uuid,p_lease uuid,p_state text,p_provider text default null,p_error text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare job public.notification_deliveries%rowtype; booking uuid;
begin
  if p_state not in('sent','retry','failed','skipped') or length(coalesce(p_error,''))>80 or p_error !~ '^[A-Z0-9_]*$' then raise exception 'Invalid delivery result'; end if;
  select * into job from public.notification_deliveries where id=p_id and lease_id=p_lease and state='processing' for update;
  if not found then return false; end if;
  if p_state='retry' and job.attempts>=5 then p_state:='failed'; end if;
  update public.notification_deliveries set state=p_state,provider_reference=left(p_provider,160),last_error=p_error,
    scheduled_at=case when p_state='retry' then now()+make_interval(secs=>60*power(2,job.attempts-1)::integer) else scheduled_at end,
    lease_id=null,locked_until=null,dispatch_started_at=null,updated_at=now() where id=p_id;
  if p_state='failed' then
    select booking_id into booking from public.notification_events where id=job.event_id;
    perform shiap_private.enqueue_notification(booking,'delivery_failed','delivery-failed:'||p_id);
  end if;
  return true;
end $$;
revoke all on function public.notification_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.notification_finish(uuid,uuid,text,text,text) to service_role;
create function public.notification_delivery_ready(p_id uuid,p_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(bool_and(s.email_enabled and (d.audience='admin' or e.event_type=any(s.email_events)) and shiap_private.notification_eligible(e.id)),false)
  from public.notification_deliveries d join public.notification_events e on e.id=d.event_id cross join public.notification_settings s
  where d.id=p_id and d.lease_id=p_lease and d.state='processing' and d.locked_until>now() and s.id=true
$$;
revoke all on function public.notification_delivery_ready(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_delivery_ready(uuid,uuid) to service_role;
create function public.notification_begin_smtp(p_id uuid,p_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if not public.notification_delivery_ready(p_id,p_lease) then return false; end if;
  update public.notification_deliveries set dispatch_started_at=now() where id=p_id and lease_id=p_lease and state='processing' and locked_until>now() and dispatch_started_at is null;
  return found;
end $$;
revoke all on function public.notification_begin_smtp(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_begin_smtp(uuid,uuid) to service_role;
create function public.notification_confirm_smtp(p_test uuid,p_admin uuid,p_hash text,p_sender text,p_fingerprint text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_admin) then return false; end if;
  update public.notification_smtp_tests set state='confirmed',confirmed_at=now()
    where id=p_test and admin_id=p_admin and token_hash=p_hash and state in('accepted','uncertain') and transport_fingerprint=p_fingerprint and expires_at>now();
  if not found then return false; end if;
  update public.notification_settings set verified_sender=p_sender,provider_verified_at=now(),smtp_test_confirmed_at=now(),verified_transport=p_fingerprint,updated_by=p_admin,updated_at=now() where id=true;
  return true;
end $$;
revoke all on function public.notification_confirm_smtp(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.notification_confirm_smtp(uuid,uuid,text,text,text) to service_role;
create function public.notification_mark_read(p_event uuid default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  insert into public.notification_reads(event_id,admin_id)
    select e.id,auth.uid() from public.notification_events e where (p_event is null or e.id=p_event)
      and exists(select 1 from public.notification_deliveries d where d.event_id=e.id and d.channel='admin')
    on conflict(event_id,admin_id) do nothing;
end $$;
revoke all on function public.notification_mark_read(uuid) from public,anon;
grant execute on function public.notification_mark_read(uuid) to authenticated;
commit;
