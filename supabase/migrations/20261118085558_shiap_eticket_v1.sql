-- E-Ticket V1: one private credential per paid booking service item.
begin;

create table public.shiap_business_contact_settings (
  id boolean primary key default true check(id),
  contact_name text not null default 'SHIAP' check(length(contact_name) between 1 and 80),
  whatsapp text,
  email text,
  website text not null default 'https://shiap.id',
  instagram text,
  tiktok text,
  youtube text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.shiap_business_contact_settings(id,whatsapp,email,instagram,tiktok,youtube)
values(true,'08562130222','pasti@shiap.id','https://instagram.com/shiap.id','https://tiktok.com/@shiap.id','https://youtube.com/@shiap.id')
on conflict(id) do nothing;
alter table public.shiap_business_contact_settings enable row level security;
revoke all on public.shiap_business_contact_settings from public,anon,authenticated;
grant select,insert,update on public.shiap_business_contact_settings to authenticated;
grant select,insert,update on public.shiap_business_contact_settings to service_role;
create policy shiap_business_contact_admin_read on public.shiap_business_contact_settings
  for select to authenticated using(public.is_shiap_admin());
create policy shiap_business_contact_admin_insert on public.shiap_business_contact_settings
  for insert to authenticated with check(public.is_shiap_admin());
create policy shiap_business_contact_admin_update on public.shiap_business_contact_settings
  for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());

insert into public.notification_whatsapp_templates(id,label,body) values(
  'ticket_ready','E-Tiket tersedia',E'Halo {{customer_name}}, E-Tiket untuk pesanan {{booking_code}} telah tersedia setelah pembayaran penuh diverifikasi. Buka detail pesanan pada perangkat/browser saat memesan untuk melihat voucher dan mengunduh PDF. Jangan bagikan QR tiket kepada orang lain.\n{{booking_url}}'
) on conflict(id) do nothing;

create table public.booking_tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_orders(id) on delete cascade,
  booking_item_id uuid not null references public.booking_items(id) on delete cascade,
  ticket_code text not null unique,
  -- Random opaque UUID only. The row is private; it contains no customer data.
  qr_credential uuid not null unique default gen_random_uuid(),
  status text not null default 'issued' check(status in('issued','checked_in','revoked')),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid,
  unique(booking_item_id),
  check((status='checked_in')=(checked_in_at is not null)),
  check((status='checked_in')=(checked_in_by is not null))
);
create index booking_tickets_booking_idx on public.booking_tickets(booking_id,issued_at);
alter table public.booking_tickets enable row level security;
revoke all on public.booking_tickets from public,anon,authenticated;
grant select,insert,update on public.booking_tickets to service_role;

create function shiap_private.manage_booking_tickets() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.payment_status='paid' and new.order_status not in('cancelled','expired','rejected')
     and (old.payment_status is distinct from 'paid') then
    insert into public.booking_tickets(booking_id,booking_item_id,ticket_code)
    select new.id,i.id,'SHIAP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))
    from public.booking_items i where i.booking_id=new.id
    on conflict(booking_item_id) do nothing;
  end if;
  if new.order_status in('cancelled','expired','rejected') or new.payment_status='refunded' then
    update public.booking_tickets set status='revoked',checked_in_at=null,checked_in_by=null
    where booking_id=new.id and status='issued';
  end if;
  return new;
end $$;
revoke all on function shiap_private.manage_booking_tickets() from public,anon,authenticated;
create trigger booking_tickets_after_payment
  after update of payment_status,order_status on public.booking_orders
  for each row execute function shiap_private.manage_booking_tickets();

-- Historical paid bookings are intentionally not backfilled here.
-- Issue historical vouchers only through a separately reviewed, bounded, idempotent operation.

create function public.checkin_booking_ticket(p_credential uuid,p_admin uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.booking_tickets%rowtype; b public.booking_orders%rowtype; item public.booking_items%rowtype;
begin
  if p_credential is null or p_admin is null or not exists(select 1 from public.admin_users a where a.user_id=p_admin) then
    raise exception 'Akses check-in Admin diperlukan.';
  end if;
  select * into t from public.booking_tickets where qr_credential=p_credential for update;
  if not found then return jsonb_build_object('result','invalid'); end if;
  if t.status='checked_in' then return jsonb_build_object('result','already_checked_in','ticket_code',t.ticket_code,'checked_in_at',t.checked_in_at); end if;
  select * into b from public.booking_orders where id=t.booking_id;
  if not found or b.payment_status<>'paid' or b.order_status in('cancelled','expired','rejected') or t.status<>'issued' then
    update public.booking_tickets set status='revoked',checked_in_at=null,checked_in_by=null where id=t.id and status='issued';
    return jsonb_build_object('result','invalid');
  end if;
  select * into item from public.booking_items where id=t.booking_item_id;
  if not found then return jsonb_build_object('result','invalid'); end if;
  update public.booking_tickets set status='checked_in',checked_in_at=now(),checked_in_by=p_admin where id=t.id and status='issued';
  return jsonb_build_object('result','checked_in','ticket_code',t.ticket_code,'booking_code',b.order_number,
    'service_name',item.service_name,'service_type',item.service_type,'guests',item.guests,'checked_in_at',now());
end $$;
revoke all on function public.checkin_booking_ticket(uuid,uuid) from public,anon,authenticated;
grant execute on function public.checkin_booking_ticket(uuid,uuid) to service_role;

commit;
