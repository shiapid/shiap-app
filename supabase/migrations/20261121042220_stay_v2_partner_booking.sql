begin;
set local lock_timeout = '5s';

-- Existing Stay rows keep their legacy classification. New Admin records opt in.
alter table public.stay_properties add column partner_booking_required boolean not null default false;

create table public.stay_partner_booking_config (
  property_id uuid primary key references public.stay_properties(id) on delete restrict,
  places_id uuid not null unique references public.places_properties(id) on delete restrict,
  application_id uuid not null unique references public.stay_service_applications(id) on delete restrict,
  agreement_id uuid not null unique references public.stay_service_agreements(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING_REVIEW','APPROVED','ACTIVE','SUSPENDED','TERMINATED')),
  instant_approved_at timestamptz,
  instant_approved_by uuid references public.admin_users(user_id) on delete restrict,
  bank_name text check (length(bank_name) between 2 and 80),
  bank_last4 text check (bank_last4 ~ '^[0-9]{4}$'),
  bank_verified_at timestamptz,
  bank_verified_by uuid references public.admin_users(user_id) on delete restrict,
  check ((instant_approved_at is null) = (instant_approved_by is null)),
  check ((bank_verified_at is null) = (bank_verified_by is null)),
  check (bank_verified_at is null or (bank_name is not null and bank_last4 is not null))
);

create table public.stay_partner_fulfillment (
  item_id uuid primary key references public.booking_items(id) on delete restrict,
  order_id uuid not null unique references public.booking_orders(id) on delete restrict,
  property_id uuid not null references public.stay_partner_booking_config(property_id) on delete restrict,
  agreement_id uuid not null references public.stay_service_agreements(id) on delete restrict,
  agreement_version integer not null check (agreement_version > 0),
  mode text not null check (mode in ('REQUEST_TO_BOOK','INSTANT')),
  status text not null check (status in ('REQUESTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','CHECKED_OUT','COMPLETED','REJECTED','CANCELLED')),
  check_in_at timestamptz not null,
  check_out_at timestamptz not null check (check_out_at > check_in_at),
  operational_hold boolean not null default false,
  updated_at timestamptz not null default now()
);
create index stay_partner_fulfillment_property_idx on public.stay_partner_fulfillment(property_id, updated_at desc);

create table public.stay_partner_operations_audit (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.stay_partner_booking_config(property_id) on delete restrict,
  item_id uuid references public.stay_partner_fulfillment(item_id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event text not null,
  note text check (length(note) <= 500),
  created_at timestamptz not null default clock_timestamp()
);

-- Physical labels and assignment supplement pooled inventory. Availability still
-- comes from the existing room-type inventory, pricing, holds, and block tables.
alter table public.stay_room_types add column partner_included_guests integer check (partner_included_guests between 1 and capacity);
create table public.stay_partner_units (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.stay_room_types(id) on delete restrict,
  label text not null check (length(btrim(label)) between 1 and 60),
  enabled boolean not null default true,
  unique(room_type_id,label)
);
create table public.stay_partner_unit_assignments (
  item_id uuid not null references public.stay_partner_fulfillment(item_id) on delete restrict,
  unit_id uuid not null references public.stay_partner_units(id) on delete restrict,
  primary key (item_id,unit_id)
);
create index stay_partner_assignment_unit_idx on public.stay_partner_unit_assignments(unit_id);
create table public.stay_partner_addons (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.stay_partner_booking_config(property_id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 100),
  price_idr bigint not null check (price_idr between 0 and 999999999999),
  enabled boolean not null default true,
  unique(property_id,name)
);
alter table public.stay_partner_units enable row level security;
alter table public.stay_partner_unit_assignments enable row level security;
alter table public.stay_partner_addons enable row level security;
revoke all on public.stay_partner_units,public.stay_partner_unit_assignments,public.stay_partner_addons from public,anon,authenticated;

alter table public.stay_partner_booking_config enable row level security;
alter table public.stay_partner_fulfillment enable row level security;
alter table public.stay_partner_operations_audit enable row level security;
revoke all on public.stay_partner_booking_config, public.stay_partner_fulfillment, public.stay_partner_operations_audit from public, anon, authenticated;

-- These checks are dynamic. An expired contract, revoked owner or invalid setup stops fresh booking.
create function shiap_private.stay_partner_booking_ready(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.stay_partner_booking_config c
    join public.stay_properties s on s.id=c.property_id
    join public.places_properties p on p.id=c.places_id and p.stay_property_id=s.id
    join public.stay_service_applications app on app.id=c.application_id and app.property_id=p.id
    join public.stay_service_agreements a on a.id=c.agreement_id and a.places_property_id=p.id and a.stay_property_id=s.id
    where c.property_id=p_property and s.status='published' and s.check_in_time is not null and s.check_out_time is not null
      and p.stay_mapping_verified_at is not null and shiap_private.stay_v2_partner_marketing(p.id)
      and app.model='BOOKING_PARTNER' and app.status='CLOSED'
      and a.model='BOOKING_PARTNER' and a.status='ACTIVE' and a.starts_at<=now() and a.ends_at>now()
      and a.stay_v2_marketing_approved_version=a.version
      and a.payment_route='EXISTING_SHIAP_BANK_TRANSFER' and a.settlement_party='SHIAP'
      and c.bank_verified_at is not null
      and exists(select 1 from public.stay_room_types r where r.property_id=s.id and r.status='active' and r.total_units>0
          and r.capacity>0 and r.weekday_price>0 and r.weekend_price>0)
  );
$$;
revoke all on function shiap_private.stay_partner_booking_ready(uuid) from public, anon, authenticated;

create function shiap_private.stay_partner_can_manage(p_agreement uuid,p_places uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_shiap_admin(),false) or exists (
    select 1 from public.stay_agreement_members a
    join public.places_property_members p on p.user_id=a.user_id and p.property_id=p_places
    where a.agreement_id=p_agreement and a.user_id=auth.uid()
      and a.role='OWNER' and a.status='ACTIVE' and p.role='OWNER' and p.status='ACTIVE' and p.verified_at is not null
  );
$$;
revoke all on function shiap_private.stay_partner_can_manage(uuid,uuid) from public, anon, authenticated;

create function public.admin_register_stay_partner_booking(p_property uuid,p_application uuid,p_agreement uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_places uuid;
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_note,''))) not between 10 and 500 then raise exception 'Catatan onboarding diperlukan.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
  select p.id into v_places from public.places_properties p
    join public.stay_service_applications app on app.id=p_application and app.property_id=p.id and app.model='BOOKING_PARTNER'
    join public.stay_service_agreements a on a.id=p_agreement and a.stay_property_id=p_property and a.places_property_id=p.id and a.model='BOOKING_PARTNER'
    where p.stay_property_id=p_property and p.stay_mapping_verified_at is not null and not p.is_demo;
  if not found then raise exception 'Pemetaan, pengajuan, dan perjanjian harus merujuk properti yang sama.' using errcode='22023'; end if;
  insert into public.stay_partner_booking_config(property_id,places_id,application_id,agreement_id)
    values(p_property,v_places,p_application,p_agreement) on conflict (property_id) do nothing;
  if not found then
    if exists(select 1 from public.stay_partner_booking_config where property_id=p_property and application_id=p_application and agreement_id=p_agreement)
    then return; end if;
    raise exception 'Properti sudah memiliki konfigurasi Partner.' using errcode='PT409';
  end if;
  insert into public.stay_partner_operations_audit(property_id,actor_id,event,note)
    values(p_property,auth.uid(),'ONBOARDING_CREATED',btrim(p_note));
end;
$$;

create function public.manage_stay_partner_booking_config(p_property uuid,p_action text,p_note text,p_bank_name text default null,p_last4 text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.stay_partner_booking_config%rowtype; v_status text;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
  select * into c from public.stay_partner_booking_config where property_id=p_property for update;
  if not found or not shiap_private.stay_partner_can_manage(c.agreement_id,c.places_id)
     or (p_action is distinct from 'SUBMIT' and not public.is_shiap_admin()) then
    raise exception 'Akses pengelolaan Partner diperlukan.' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_note,''))) not between 10 and 500 then raise exception 'Catatan keputusan diperlukan.' using errcode='22023'; end if;
  if c.status='TERMINATED' then raise exception 'Kemitraan sudah diakhiri.' using errcode='22023'; end if;
  case p_action
    when 'SUBMIT' then
      if c.status='DRAFT' then v_status:='PENDING_REVIEW'; end if;
    when 'VERIFY_BANK' then
      if length(btrim(coalesce(p_bank_name,''))) not between 2 and 80 or coalesce(p_last4,'') !~ '^[0-9]{4}$' then
        raise exception 'Isi nama bank dan empat digit terakhir rekening.' using errcode='22023';
      end if;
      update public.stay_partner_booking_config set bank_name=btrim(p_bank_name),bank_last4=p_last4,
        bank_verified_at=clock_timestamp(),bank_verified_by=auth.uid() where property_id=p_property;
    when 'REVOKE_BANK' then
      update public.stay_partner_booking_config set bank_verified_at=null,bank_verified_by=null,
        instant_approved_at=null,instant_approved_by=null where property_id=p_property;
    when 'APPROVE' then
      if c.status in ('PENDING_REVIEW','SUSPENDED') and shiap_private.stay_partner_booking_ready(p_property) then v_status:='APPROVED'; end if;
    when 'ACTIVATE' then
      if c.status='APPROVED' and shiap_private.stay_partner_booking_ready(p_property) then v_status:='ACTIVE'; end if;
    when 'APPROVE_INSTANT' then
      if c.status<>'ACTIVE' or not shiap_private.stay_partner_booking_ready(p_property)
        or exists(select 1 from public.stay_room_types r where r.property_id=p_property and r.status='active'
          and (r.weekday_price<=0 or r.weekend_price<=0 or r.total_units<=0)) then
        raise exception 'Aktivasi, inventori, dan tarif kamar harus siap sebelum Instant Booking.' using errcode='22023';
      end if;
      update public.stay_partner_booking_config set instant_approved_at=clock_timestamp(),instant_approved_by=auth.uid() where property_id=p_property;
    when 'DISABLE_INSTANT' then
      update public.stay_partner_booking_config set instant_approved_at=null,instant_approved_by=null where property_id=p_property;
    when 'SUSPEND' then
      if c.status in ('APPROVED','ACTIVE') then v_status:='SUSPENDED'; end if;
    when 'TERMINATE' then v_status:='TERMINATED';
    else raise exception 'Aksi konfigurasi tidak valid.' using errcode='22023';
  end case;
  if p_action in ('SUBMIT','APPROVE','ACTIVATE','SUSPEND','TERMINATE') then
    if v_status is null then raise exception 'Status atau syarat onboarding belum memenuhi ketentuan.' using errcode='22023'; end if;
    update public.stay_partner_booking_config set status=v_status,
      instant_approved_at=null,instant_approved_by=null where property_id=p_property;
  end if;
  insert into public.stay_partner_operations_audit(property_id,actor_id,event,note)
    values(p_property,auth.uid(),p_action,btrim(p_note));
end;
$$;

create function shiap_private.stay_partner_public_mode(p_property uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when c.status='ACTIVE' and shiap_private.stay_partner_booking_ready(p.id) then
      case when c.instant_approved_at is not null
       and not exists(select 1 from public.stay_room_types r where r.property_id=p.id and r.status='active'
         and (r.weekday_price<=0 or r.weekend_price<=0 or r.total_units<=0)) then 'INSTANT' else 'REQUEST_TO_BOOK' end
    when c.property_id is not null or p.partner_booking_required or exists (
      select 1 from public.places_properties l where l.stay_property_id=p.id and l.stay_mapping_verified_at is not null
    ) then 'UNAVAILABLE'
    else 'LEGACY' end
  from public.stay_properties p left join public.stay_partner_booking_config c on c.property_id=p.id
  where p.id=p_property and p.status='published';
$$;
revoke all on function shiap_private.stay_partner_public_mode(uuid) from public, anon, authenticated;

create function public.stay_booking_mode(p_property uuid) returns text
language sql stable security definer set search_path = '' as $$
  select shiap_private.stay_partner_public_mode(p_property);
$$;
revoke all on function public.stay_booking_mode(uuid) from public, anon, authenticated;
grant execute on function public.stay_booking_mode(uuid) to anon, authenticated;

-- The existing checkout has already acquired the Stay calendar and room locks.
-- This trigger also covers callers using the old create_booking_order RPC.
create function shiap_private.prepare_stay_partner_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.stay_partner_booking_config%rowtype; agreement_version integer; mode text;
        scheduled_in time; scheduled_out time; current_order public.booking_orders%rowtype;
begin
  if exists(select 1 from public.stay_partner_fulfillment where order_id=new.booking_id) then
    raise exception 'Pesanan Stay Partner harus dibuat terpisah.' using errcode='P0001';
  end if;
  if new.service_type<>'stay' or new.property_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
  mode:=shiap_private.stay_partner_public_mode(new.property_id);
  if mode='LEGACY' then return new; end if;
  if mode is null or mode='UNAVAILABLE' then raise exception 'Booking Partner belum tersedia untuk properti ini.' using errcode='P0001'; end if;
  if exists(select 1 from public.booking_items where booking_id=new.booking_id and id<>new.id) then
    raise exception 'Pesanan Stay Partner harus dibuat terpisah.' using errcode='P0001';
  end if;
  select * into current_order from public.booking_orders where id=new.booking_id for update;
  if not found or current_order.order_status<>'pending_confirmation' or current_order.payment_status<>'unpaid'
    or current_order.package_subtotal is not null or current_order.inventory_hold_expires_at is null
    or current_order.inventory_hold_expires_at<=clock_timestamp()
    or new.room_type_id is null or new.stay_rate_snapshot is null then
    raise exception 'Reservasi Partner tidak memiliki harga atau hold yang valid.' using errcode='P0001';
  end if;
  select * into strict c from public.stay_partner_booking_config where property_id=new.property_id;
  select a.version into strict agreement_version from public.stay_service_agreements a where a.id=c.agreement_id for share;
  select s.check_in_time,s.check_out_time into strict scheduled_in,scheduled_out from public.stay_properties s where s.id=new.property_id;
  insert into public.stay_partner_fulfillment(item_id,order_id,property_id,agreement_id,agreement_version,mode,status,check_in_at,check_out_at)
    values(new.id,new.booking_id,c.property_id,c.agreement_id,agreement_version,mode,
      case when mode='INSTANT' then 'AWAITING_PAYMENT' else 'REQUESTED' end,
      (new.date_start+scheduled_in) at time zone 'Asia/Makassar',
      (new.date_end+scheduled_out) at time zone 'Asia/Makassar');
  if mode='REQUEST_TO_BOOK' then
    update public.booking_orders set payment_enabled=false where id=new.booking_id;
  end if;
  return new;
end;
$$;
revoke all on function shiap_private.prepare_stay_partner_item() from public, anon, authenticated;
create trigger stay_partner_prepare_item after insert on public.booking_items
for each row execute function shiap_private.prepare_stay_partner_item();

create function shiap_private.guard_stay_partner_order_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare item public.stay_partner_fulfillment%rowtype;
begin
  select * into item from public.stay_partner_fulfillment where order_id=old.id;
  if not found then return new; end if;
  if new.payment_enabled and item.status='REQUESTED' then
    raise exception 'Permintaan Stay Partner belum disetujui.' using errcode='23514';
  end if;
  if new.order_status='confirmed' and old.order_status<>'confirmed' and item.status<>'CONFIRMED' then
    raise exception 'Konfirmasi pemenuhan dari operasional Stay.' using errcode='23514';
  end if;
  if new.order_status='completed' and old.order_status<>'completed' and item.status<>'COMPLETED' then
    raise exception 'Selesaikan check-out dan pemenuhan dari operasional Stay.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger stay_partner_guard_order before update of payment_enabled,order_status on public.booking_orders
for each row execute function shiap_private.guard_stay_partner_order_transition();
revoke all on function shiap_private.guard_stay_partner_order_transition() from public, anon, authenticated;

create function shiap_private.quote_stay_partner_extras() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.stay_room_types%rowtype; v_extras numeric:=0; v_base numeric; v_each numeric:=0;
  v_seen text[]:='{}'; v_selected jsonb:='[]'; v_input jsonb; v_addon public.stay_partner_addons%rowtype;
  mode text;
begin
  if new.service_type<>'stay' or new.property_id is null or new.stay_rate_snapshot is null then return new; end if;
  mode:=shiap_private.stay_partner_public_mode(new.property_id);
  if mode not in ('REQUEST_TO_BOOK','INSTANT') or mode is null then return new; end if;
  select * into strict r from public.stay_room_types where id=new.room_type_id and property_id=new.property_id;
  if r.partner_included_guests is not null and new.guests>r.partner_included_guests*new.quantity then
    if new.guests%new.quantity<>0 then
      raise exception 'Untuk tarif tamu tambahan, isi jumlah tamu merata per kamar atau pesan kamar secara terpisah.';
    end if;
    v_each:=(new.guests/new.quantity-r.partner_included_guests)*r.extra_guest_price*(new.date_end-new.date_start);
  end if;
  if jsonb_typeof(coalesce(new.selected_addons,'[]'))<>'array' or jsonb_array_length(coalesce(new.selected_addons,'[]'))>12 then
    raise exception 'Pilihan add-on Stay tidak valid.';
  end if;
  for v_input in select value from jsonb_array_elements(coalesce(new.selected_addons,'[]')) loop
    if coalesce(v_input->>'id','')='' or (v_input->>'id')=any(v_seen) then raise exception 'Add-on Stay tidak valid atau duplikat.'; end if;
    select * into v_addon from public.stay_partner_addons
      where id::text=v_input->>'id' and property_id=new.property_id and enabled for share;
    if not found then raise exception 'Add-on Stay tidak tersedia.'; end if;
    v_seen:=array_append(v_seen,v_addon.id::text);
    v_extras:=v_extras+v_addon.price_idr;
    v_selected:=v_selected||jsonb_build_array(jsonb_build_object('id',v_addon.id,'name',v_addon.name,'price',v_addon.price_idr));
  end loop;
  v_base:=(new.stay_rate_snapshot->>'subtotal')::numeric;
  if (v_base+v_each+v_extras)*new.quantity>999999999999 then raise exception 'Subtotal Stay di luar batas yang diizinkan.'; end if;
  new.selected_addons:=v_selected;
  new.stay_rate_snapshot:=new.stay_rate_snapshot||jsonb_build_object('room_subtotal',v_base,
    'subtotal',v_base+v_each+v_extras,'extra_guest_subtotal',v_each,'addon_subtotal',v_extras);
  return new;
end;
$$;
revoke all on function shiap_private.quote_stay_partner_extras() from public,anon,authenticated;
-- Alphabetical trigger order lets the existing authoritative nightly calculation run first.
create trigger booking_items_stay_partner_extras before insert on public.booking_items
for each row execute function shiap_private.quote_stay_partner_extras();

create function public.stay_partner_addon_options(p_property uuid)
returns table (id uuid,name text,price_idr bigint) language sql stable security definer set search_path = '' as $$
  select a.id,a.name,a.price_idr from public.stay_partner_addons a
  where a.property_id=p_property and a.enabled and shiap_private.stay_partner_public_mode(p_property) in ('REQUEST_TO_BOOK','INSTANT')
  order by a.name;
$$;
revoke all on function public.stay_partner_addon_options(uuid) from public,anon,authenticated;
grant execute on function public.stay_partner_addon_options(uuid) to anon,authenticated;

create function public.manage_stay_partner_inventory(p_property uuid,p_room uuid,p_action text,p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.stay_partner_booking_config%rowtype; r public.stay_room_types%rowtype;
  v_capacity integer; v_units integer; v_included integer; v_start date; v_end date;
  v_weekday bigint; v_weekend bigint; v_guest bigint; v_price bigint; v_text text;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
  select * into c from public.stay_partner_booking_config where property_id=p_property;
  if not found or c.status='TERMINATED' or not shiap_private.stay_partner_can_manage(c.agreement_id,c.places_id) then
    raise exception 'Akses inventori properti diperlukan.' using errcode='42501';
  end if;
  if p_action<>'SAVE_ADDON' and p_action<>'ADD_ROOM' then
    select * into r from public.stay_room_types where id=p_room and property_id=p_property for update;
    if not found then raise exception 'Tipe kamar tidak tersedia.' using errcode='22023'; end if;
  end if;
  case p_action
    when 'SAVE_ROOM', 'ADD_ROOM' then
      v_capacity:=(p_data->>'capacity')::integer;
      v_units:=(p_data->>'units')::integer;
      v_included:=nullif(p_data->>'included','')::integer;
      v_weekday:=(p_data->>'weekday')::bigint;
      v_weekend:=(p_data->>'weekend')::bigint;
      v_guest:=coalesce((nullif(p_data->>'extraGuest',''))::bigint,0);
      v_text:=btrim(coalesce(p_data->>'name',''));
      if (v_capacity between 1 and 100 and v_units between 1 and 200
        and (v_included is null or v_included between 1 and v_capacity)
        and v_weekday between 1 and 999999999999 and v_weekend between 1 and 999999999999
        and v_guest between 0 and 999999999999 and length(v_text) between 2 and 100) is not true then
        raise exception 'Data kamar, kapasitas, atau tarif tidak valid.' using errcode='22023';
      end if;
      if p_action='ADD_ROOM' then
        insert into public.stay_room_types(property_id,name,capacity,total_units,weekday_price,weekend_price,extra_guest_price,partner_included_guests)
          values(p_property,v_text,v_capacity,v_units,v_weekday,v_weekend,v_guest,v_included);
      else
        if (select count(*) from public.stay_partner_units where room_type_id=r.id and enabled)>v_units then
          raise exception 'Jumlah unit aktif fisik melebihi kapasitas baru.' using errcode='22023';
        end if;
        update public.stay_room_types set name=v_text,capacity=v_capacity,total_units=v_units,
          weekday_price=v_weekday,weekend_price=v_weekend,extra_guest_price=v_guest,partner_included_guests=v_included where id=r.id;
      end if;
    when 'ADD_UNIT' then
      if (select count(*) from public.stay_partner_units where room_type_id=r.id and enabled)>=r.total_units then
        raise exception 'Jumlah unit fisik sudah mencapai kapasitas kamar.' using errcode='22023';
      end if;
      insert into public.stay_partner_units(room_type_id,label) values(r.id,btrim(p_data->>'label'));
    when 'BLOCK' then
      v_start:=(p_data->>'start')::date;
      v_end:=(p_data->>'end')::date;
      v_units:=nullif(p_data->>'units','')::integer;
      if v_start is null or v_end is null or not isfinite(v_start) or not isfinite(v_end)
        or v_end<v_start or v_end-v_start>365 or (v_units is not null and v_units<1) then
        raise exception 'Rentang blok inventori tidak valid.' using errcode='22023';
      end if;
      insert into public.stay_room_inventory_blocks(room_type_id,starts_on,ends_on,blocked_units,reason)
        values(r.id,v_start,v_end,v_units,btrim(coalesce(p_data->>'reason','Pemeliharaan properti')));
    when 'UNBLOCK' then
      delete from public.stay_room_inventory_blocks where id=(p_data->>'blockId')::uuid and room_type_id=r.id;
      if not found then raise exception 'Blok inventori tidak ditemukan.' using errcode='22023'; end if;
    when 'SPECIAL_RATE' then
      v_start:=(p_data->>'start')::date;
      v_end:=(p_data->>'end')::date;
      v_price:=(p_data->>'price')::bigint;
      if (v_start is not null and v_end is not null and isfinite(v_start) and isfinite(v_end)
        and v_end>=v_start and v_end-v_start<=364 and v_price between 1 and 999999999999) is not true then
        raise exception 'Tarif dan rentang tanggal khusus tidak valid.' using errcode='22023';
      end if;
      insert into public.stay_special_rates(room_type_id,starts_on,ends_on,price)
        values(r.id,v_start,v_end,v_price);
    when 'REMOVE_RATE' then
      delete from public.stay_special_rates where id=(p_data->>'rateId')::uuid and room_type_id=r.id;
      if not found then raise exception 'Tarif khusus tidak ditemukan.' using errcode='22023'; end if;
    when 'SAVE_ADDON' then
      v_price:=(p_data->>'price')::bigint;
      insert into public.stay_partner_addons(property_id,name,price_idr,enabled)
        values(p_property,btrim(p_data->>'name'),v_price,coalesce((p_data->>'enabled')::boolean,true))
        on conflict(property_id,name) do update set price_idr=excluded.price_idr,enabled=excluded.enabled;
    else raise exception 'Aksi inventori tidak valid.' using errcode='22023';
  end case;
  insert into public.stay_partner_operations_audit(property_id,actor_id,event)
    values(p_property,auth.uid(),p_action);
end;
$$;
revoke all on function public.manage_stay_partner_inventory(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_stay_partner_inventory(uuid,uuid,text,jsonb) to authenticated;

create function public.read_stay_partner_calendar(p_room uuid,p_start date,p_end date)
returns table(night date,total integer,booked bigint,blocked bigint,available bigint,calendar_closed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.stay_room_types r
    join public.stay_partner_booking_config c on c.property_id=r.property_id
    where r.id=p_room and shiap_private.stay_partner_can_manage(c.agreement_id,c.places_id)) then
    raise exception 'Akses inventori properti diperlukan.' using errcode='42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_end<=p_start or p_end-p_start>31 then return; end if;
  return query select * from shiap_private.stay_inventory(p_room,p_start,p_end);
end;
$$;
revoke all on function public.read_stay_partner_calendar(uuid,date,date) from public,anon,authenticated;
grant execute on function public.read_stay_partner_calendar(uuid,date,date) to authenticated;

create function public.manage_stay_partner_item(p_item uuid,p_action text,p_note text,p_units uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare item public.stay_partner_fulfillment%rowtype; b public.booking_orders%rowtype; c public.stay_partner_booking_config%rowtype;
        v_status text; v_room uuid; v_quantity integer;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.' using errcode='42501'; end if;
  select * into item from public.stay_partner_fulfillment where item_id=p_item;
  if not found then raise exception 'Akses booking tidak tersedia.' using errcode='42501'; end if;
  select * into c from public.stay_partner_booking_config where property_id=item.property_id;
  if not shiap_private.stay_partner_can_manage(item.agreement_id,c.places_id) then
    raise exception 'Akses booking tidak tersedia.' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'Isi catatan operasional.' using errcode='22023'; end if;
  if p_action in ('APPROVE','CHECK_IN') then
    perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
    select * into c from public.stay_partner_booking_config where property_id=item.property_id;
  end if;
  select * into b from public.booking_orders where id=item.order_id for update;
  select * into item from public.stay_partner_fulfillment where item_id=p_item for update;
  if b.order_status in ('cancelled','rejected','expired','completed') then
    raise exception 'Pesanan tidak dapat diubah.' using errcode='22023';
  end if;
  if p_action in ('HOLD','RELEASE_HOLD') then
    if not public.is_shiap_admin() then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
    update public.stay_partner_fulfillment set operational_hold=p_action='HOLD',updated_at=clock_timestamp() where item_id=p_item;
  else
    case p_action
      when 'APPROVE' then
        if item.status='REQUESTED' and b.payment_status='unpaid' and b.order_status='pending_confirmation'
          and b.inventory_hold_expires_at>clock_timestamp() and c.status='ACTIVE' and shiap_private.stay_partner_booking_ready(c.property_id)
          and not item.operational_hold then
          v_status:='AWAITING_PAYMENT';
        end if;
      when 'REJECT' then
        if item.status='REQUESTED' and b.payment_status='unpaid' and b.order_status='pending_confirmation'
          and b.inventory_hold_expires_at>clock_timestamp() then v_status:='REJECTED'; end if;
      when 'CONFIRM' then
        if item.status='AWAITING_PAYMENT' and b.payment_status='paid' and b.order_status='pending_confirmation'
          and not item.operational_hold then v_status:='CONFIRMED'; end if;
      when 'CHECK_IN' then
        if item.status='CONFIRMED' and b.payment_status='paid' and b.order_status='confirmed'
          and not item.operational_hold and clock_timestamp()>=item.check_in_at and clock_timestamp()<item.check_out_at then v_status:='CHECKED_IN'; end if;
        if v_status='CHECKED_IN' then
          select i.room_type_id,i.quantity into strict v_room,v_quantity from public.booking_items i where i.id=item.item_id;
          if exists(select 1 from public.stay_partner_units where room_type_id=v_room and enabled) then
            if cardinality(coalesce(p_units,'{}'))<>v_quantity
              or (select count(*) from public.stay_partner_units where room_type_id=v_room and enabled and id=any(p_units))<>v_quantity
              or exists (select 1 from public.stay_partner_unit_assignments ua
                join public.stay_partner_fulfillment other on other.item_id=ua.item_id
                join public.booking_orders ob on ob.id=other.order_id
                where ua.unit_id=any(p_units) and other.status in ('CHECKED_IN','CHECKED_OUT')
                  and ob.order_status='confirmed'
                  and tstzrange(other.check_in_at,other.check_out_at,'[)')&&tstzrange(item.check_in_at,item.check_out_at,'[)'))
            then raise exception 'Pilih unit fisik yang berbeda dan tersedia.' using errcode='22023'; end if;
            insert into public.stay_partner_unit_assignments(item_id,unit_id)
              select item.item_id, id from public.stay_partner_units where id=any(p_units);
          elsif cardinality(coalesce(p_units,'{}'))>0 then
            raise exception 'Unit fisik tidak sesuai tipe kamar.' using errcode='22023';
          end if;
        end if;
      when 'CHECK_OUT' then
        if item.status='CHECKED_IN' and b.payment_status='paid' and b.order_status='confirmed'
          and not item.operational_hold then v_status:='CHECKED_OUT'; end if;
      when 'COMPLETE' then
        if item.status='CHECKED_OUT' and b.payment_status='paid' and b.order_status='confirmed'
          and clock_timestamp()>=item.check_out_at and not item.operational_hold
          and not exists (select 1 from public.booking_payment_records p where p.booking_id=b.id and p.status='pending')
          and not exists (select 1 from public.finance_transaction_entries f where f.booking_id=b.id and f.entry_type='refund' and f.status='posted')
        then v_status:='COMPLETED'; end if;
      else raise exception 'Aksi booking tidak valid.' using errcode='22023';
    end case;
    if v_status is null then raise exception 'Status serta syarat operasional belum memenuhi ketentuan.' using errcode='22023'; end if;
    update public.stay_partner_fulfillment set status=v_status,updated_at=clock_timestamp() where item_id=p_item;
    case v_status
      when 'AWAITING_PAYMENT' then
        update public.booking_orders set payment_enabled=true,inventory_hold_expires_at=clock_timestamp()+interval '15 minutes' where id=b.id;
      when 'REJECTED' then update public.booking_orders set order_status='rejected' where id=b.id;
      when 'CONFIRMED' then update public.booking_orders set order_status='confirmed' where id=b.id;
      when 'COMPLETED' then update public.booking_orders set order_status='completed' where id=b.id;
      else null;
    end case;
  end if;
  insert into public.stay_partner_operations_audit(property_id,item_id,actor_id,event,note)
    values(item.property_id,p_item,auth.uid(),p_action,btrim(p_note));
end;
$$;

create function public.read_stay_partner_operations(p_property uuid default null,p_from date default null,p_until date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with allowed as (
    select c.* from public.stay_partner_booking_config c
    where auth.uid() is not null and (p_property is null or c.property_id=p_property)
      and shiap_private.stay_partner_can_manage(c.agreement_id,c.places_id)
  ), listings as (
    select c.property_id,c.places_id,c.agreement_id,c.application_id,s.name,c.status,
           shiap_private.stay_partner_public_mode(c.property_id) as booking_mode,
           c.bank_verified_at is not null as bank_verified,
           c.instant_approved_at is not null as instant_approved
    from allowed c join public.stay_properties s on s.id=c.property_id
  ), rows as (
    select f.item_id,f.property_id,b.order_number,
      case when b.order_status in ('cancelled','expired','rejected') then b.order_status else f.status end as status,
      b.payment_status,case when b.payment_status='paid' then b.customer_name end as guest_name,
      case when b.payment_status='paid' then b.customer_whatsapp end as guest_whatsapp,
      i.service_name,i.room_type_id,i.quantity,i.guests,f.check_in_at,f.check_out_at,f.operational_hold
    from allowed c join public.stay_partner_fulfillment f on f.property_id=c.property_id
    join public.booking_orders b on b.id=f.order_id join public.booking_items i on i.id=f.item_id
    where (p_from is null or i.date_end>p_from) and (p_until is null or i.date_start<=p_until)
    order by f.check_in_at desc,f.item_id limit 100
  ), rooms as (
    select r.id,r.property_id,r.name,r.capacity,r.total_units,r.weekday_price,r.weekend_price,r.extra_guest_price,r.partner_included_guests
    from allowed c join public.stay_room_types r on r.property_id=c.property_id
    where r.status='active' order by r.name
  )
  select jsonb_build_object('properties',coalesce((select jsonb_agg(l) from listings l),'[]'),
    'bookings',coalesce((select jsonb_agg(r) from rows r),'[]'),
    'rooms',coalesce((select jsonb_agg(r) from rooms r),'[]'),
    'units',coalesce((select jsonb_agg(to_jsonb(u)) from public.stay_partner_units u join rooms r on r.id=u.room_type_id where u.enabled),'[]'),
    'blocks',coalesce((select jsonb_agg(to_jsonb(b)-'created_by') from public.stay_room_inventory_blocks b join rooms r on r.id=b.room_type_id
      where b.ends_on>=current_date),'[]'),
    'rates',coalesce((select jsonb_agg(to_jsonb(s)) from public.stay_special_rates s join rooms r on r.id=s.room_type_id
      where s.ends_on>=current_date),'[]'),
    'addons',coalesce((select jsonb_agg(to_jsonb(a)) from public.stay_partner_addons a join allowed c on c.property_id=a.property_id),'[]'));
$$;

revoke all on function public.admin_register_stay_partner_booking(uuid,uuid,uuid,text),
 public.manage_stay_partner_booking_config(uuid,text,text,text,text), public.manage_stay_partner_item(uuid,text,text,uuid[]),
 public.read_stay_partner_operations(uuid,date,date) from public, anon, authenticated;
grant execute on function public.admin_register_stay_partner_booking(uuid,uuid,uuid,text),
 public.manage_stay_partner_booking_config(uuid,text,text,text,text), public.manage_stay_partner_item(uuid,text,text,uuid[]),
 public.read_stay_partner_operations(uuid,date,date) to authenticated;

commit;
