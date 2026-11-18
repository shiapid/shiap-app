-- Admin Operations Upgrade V1: safe schedule edits and booking archive/trash.
begin;

alter table public.trip_departures
  add column departure_time time,
  add column meeting_point text check (meeting_point is null or length(meeting_point) <= 500),
  add column updated_at timestamptz not null default now(),
  add column version integer not null default 1 check (version > 0);

create function shiap_private.bump_trip_departure_version() returns trigger
language plpgsql set search_path=''
as $$
begin
  new.updated_at := clock_timestamp();
  new.version := old.version + 1;
  return new;
end $$;
revoke all on function shiap_private.bump_trip_departure_version() from public,anon,authenticated;
create trigger trip_departures_version_before_update before update on public.trip_departures
for each row execute function shiap_private.bump_trip_departure_version();
-- Keep the legacy Admin UI's schedule writes working during the additive migration
-- and application rollout. A follow-up migration removes these writes after the
-- server-backed Admin UI is active.

create table public.admin_trip_departure_audit (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.trip_departures(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  old_values jsonb not null,
  new_values jsonb not null,
  affected_booking_ids uuid[] not null default '{}',
  reason text,
  created_at timestamptz not null default now()
);
alter table public.admin_trip_departure_audit enable row level security;
revoke all on public.admin_trip_departure_audit from public,anon,authenticated;
grant all on public.admin_trip_departure_audit to service_role;
create index admin_trip_departure_audit_departure_created_idx
  on public.admin_trip_departure_audit(departure_id,created_at desc);

create table public.booking_admin_record_state (
  booking_id uuid primary key references public.booking_orders(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text check (archive_reason is null or length(archive_reason) <= 500),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deletion_reason text check (deletion_reason is null or length(deletion_reason) <= 500),
  deleted_from_scope text check (deleted_from_scope is null or deleted_from_scope in ('active','archived')),
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null,
  restoration_count integer not null default 0 check (restoration_count >= 0),
  updated_at timestamptz not null default now(),
  check ((deleted_at is null) = (deleted_from_scope is null))
);
alter table public.booking_admin_record_state enable row level security;
revoke all on public.booking_admin_record_state from public,anon,authenticated;
grant all on public.booking_admin_record_state to service_role;
create index booking_admin_record_state_archive_idx on public.booking_admin_record_state(archived_at desc)
  where archived_at is not null and deleted_at is null;
create index booking_admin_record_state_trash_idx on public.booking_admin_record_state(deleted_at desc)
  where deleted_at is not null;

create or replace function public.admin_update_trip_departure(
  p_actor uuid,
  p_departure_id uuid,
  p_expected_version integer,
  p_departure_date date,
  p_end_date date,
  p_departure_time time,
  p_price_per_person numeric,
  p_min_participants integer,
  p_max_participants integer,
  p_status text,
  p_meeting_point text,
  p_notes text,
  p_reason text,
  p_confirm_impact boolean default false
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  old_row public.trip_departures%rowtype;
  new_row public.trip_departures%rowtype;
  impacted uuid[];
  paid_count integer;
  pending_count integer;
  material_change boolean;
  old_data jsonb;
  new_data jsonb;
  item_row record;
begin
  if p_actor is null or not exists(select 1 from public.admin_users a where a.user_id=p_actor) then
    raise exception 'Akses Admin diperlukan.' using errcode='42501';
  end if;
  if p_departure_id is null or p_expected_version is null then raise exception 'Jadwal tidak valid.'; end if;
  if p_departure_date is null or (p_end_date is not null and p_end_date<p_departure_date)
     or (p_price_per_person is not null and p_price_per_person<0) or p_min_participants is null or p_min_participants<1 or p_max_participants is null or p_max_participants<1
     or p_status is null
     or p_min_participants>p_max_participants
     or p_status not in ('draft','open','full','cancelled')
     or length(coalesce(p_meeting_point,''))>500 or length(coalesce(p_notes,''))>2000
     or length(coalesce(p_reason,''))>500 then
    raise exception 'Data jadwal tidak valid.' using errcode='22023';
  end if;
  select * into old_row from public.trip_departures where id=p_departure_id for update;
  if not found then raise exception 'Jadwal tidak ditemukan.' using errcode='P0002'; end if;
  if old_row.version<>p_expected_version then
    return jsonb_build_object('result','conflict','current_version',old_row.version,'current_updated_at',old_row.updated_at);
  end if;
  if p_max_participants<old_row.booked_seats then
    raise exception 'Kapasitas tidak boleh di bawah kursi yang sudah terpakai atau tertahan (%).',old_row.booked_seats using errcode='23514';
  end if;
  select coalesce(array_agg(distinct i.booking_id order by i.booking_id),'{}'::uuid[]),
    count(distinct b.id) filter(where b.payment_status='paid')::integer,
    count(distinct b.id) filter(where exists(select 1 from public.booking_payment_records pr where pr.booking_id=b.id and pr.status='pending'))::integer
  into impacted,paid_count,pending_count
  from public.booking_items i join public.booking_orders b on b.id=i.booking_id
  where i.departure_id=p_departure_id and b.order_status not in ('cancelled','expired','rejected');
  old_data:=jsonb_build_object('departure_date',old_row.departure_date,'end_date',old_row.end_date,'departure_time',old_row.departure_time,
    'price_per_person',old_row.price_per_person,'min_participants',old_row.min_participants,'max_participants',old_row.max_participants,
    'status',old_row.status,'meeting_point',old_row.meeting_point,'notes',old_row.notes);
  new_data:=jsonb_build_object('departure_date',p_departure_date,'end_date',p_end_date,'departure_time',p_departure_time,
    'price_per_person',p_price_per_person,'min_participants',p_min_participants,'max_participants',p_max_participants,
    'status',p_status,'meeting_point',nullif(btrim(p_meeting_point),''),'notes',nullif(btrim(p_notes),''));
  material_change:=old_row.departure_date is distinct from p_departure_date or old_row.end_date is distinct from p_end_date
    or old_row.departure_time is distinct from p_departure_time or old_row.status is distinct from p_status
    or old_row.meeting_point is distinct from nullif(btrim(p_meeting_point),'');
  if material_change and cardinality(impacted)>0 and not p_confirm_impact then
    return jsonb_build_object('result','confirmation_required','affected_bookings',cardinality(impacted),
      'paid_bookings',coalesce(paid_count,0),'awaiting_verification',coalesce(pending_count,0),'old_values',old_data,'new_values',new_data);
  end if;
  if material_change and cardinality(impacted)>0 and length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Alasan perubahan yang berdampak pada pelanggan wajib diisi minimal 3 karakter.' using errcode='22023';
  end if;

  update public.trip_departures set departure_date=p_departure_date,end_date=p_end_date,departure_time=p_departure_time,
    price_per_person=p_price_per_person,min_participants=p_min_participants,max_participants=p_max_participants,
    status=p_status,meeting_point=nullif(btrim(p_meeting_point),''),notes=nullif(btrim(p_notes),'')
  where id=p_departure_id returning * into new_row;

  if old_row.departure_date is distinct from p_departure_date or old_row.end_date is distinct from p_end_date then
    update public.booking_items set date_start=p_departure_date,date_end=p_end_date
    where departure_id=p_departure_id and booking_id=any(impacted);
  end if;
  insert into public.admin_trip_departure_audit(departure_id,actor_user_id,old_values,new_values,affected_booking_ids,reason)
    values(p_departure_id,p_actor,old_data,new_data,impacted,nullif(btrim(p_reason),''));

  if material_change and cardinality(impacted)>0 then
    for item_row in select i.id,i.booking_id from public.booking_items i join public.booking_orders b on b.id=i.booking_id
      where i.departure_id=p_departure_id and b.order_status not in ('cancelled','expired','rejected')
    loop
      perform shiap_private.enqueue_notification(item_row.booking_id,'trip_schedule_changed',
        'trip-schedule-changed:'||p_departure_id||':'||new_row.version||':'||item_row.id,item_row.id);
      insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
        values(item_row.booking_id,p_actor,'admin','trip_schedule_changed',coalesce(nullif(btrim(p_reason),''),'Jadwal perjalanan diperbarui oleh Admin.'));
    end loop;
  end if;
  return jsonb_build_object('result','updated','version',new_row.version,'updated_at',new_row.updated_at,
    'affected_bookings',cardinality(impacted),'paid_bookings',coalesce(paid_count,0),'awaiting_verification',coalesce(pending_count,0));
end $$;
revoke all on function public.admin_update_trip_departure(uuid,uuid,integer,date,date,time,numeric,integer,integer,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_update_trip_departure(uuid,uuid,integer,date,date,time,numeric,integer,integer,text,text,text,text,boolean) to service_role;

create or replace function public.admin_manage_booking_records(
  p_actor uuid,p_booking_ids uuid[],p_action text,p_scope text,p_reason text default null
) returns table(booking_id uuid,result text,message text)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; b public.booking_orders%rowtype; s public.booking_admin_record_state%rowtype; why text:=btrim(coalesce(p_reason,''));
begin
  if p_actor is null or not exists(select 1 from public.admin_users a where a.user_id=p_actor) then
    raise exception 'Akses Admin diperlukan.' using errcode='42501';
  end if;
  if p_action not in ('archive','remove','restore') or p_scope not in ('active','archived','trash')
     or coalesce(cardinality(p_booking_ids),0)<1 or cardinality(p_booking_ids)>100
     or length(why)<3 or length(why)>500 then
    raise exception 'Tindakan, booking, atau alasan tidak valid.' using errcode='22023';
  end if;
  if (p_action='restore' and p_scope<>'trash') or (p_action='archive' and p_scope<>'active')
     or (p_action='remove' and p_scope='trash') then raise exception 'Scope tindakan tidak sesuai.' using errcode='22023'; end if;
  for v_id in select distinct unnest(p_booking_ids) loop
    begin
      select * into b from public.booking_orders bo where bo.id=v_id for update;
      if not found then booking_id:=v_id; result:='failed'; message:='Booking tidak ditemukan.'; return next; continue; end if;
      booking_id:=v_id;
      select * into s from public.booking_admin_record_state state where state.booking_id=v_id for update;
      if p_action='restore' then
        if s.deleted_at is null then result:='failed'; message:='Booking bukan berada di Tempat Sampah.'; return next; continue; end if;
        update public.booking_admin_record_state as state set deleted_at=null,deleted_by=null,deletion_reason=null,deleted_from_scope=null,
          restored_at=now(),restored_by=p_actor,restoration_count=restoration_count+1,updated_at=now() where state.booking_id=b.id;
        insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
          values(b.id,p_actor,'admin','booking_restored',why);
      elsif p_action='archive' then
        if s.deleted_at is not null or s.archived_at is not null or b.order_status not in ('completed','cancelled','expired','rejected')
          or exists(select 1 from public.booking_payment_records pr where pr.booking_id=b.id and pr.status='pending') then
          result:='failed'; message:='Hanya booking final tanpa verifikasi tertunda yang dapat diarsipkan.'; return next; continue;
        end if;
        insert into public.booking_admin_record_state(booking_id,archived_at,archived_by,archive_reason,updated_at)
          values(b.id,now(),p_actor,why,now())
          on conflict on constraint booking_admin_record_state_pkey do update set archived_at=excluded.archived_at,archived_by=excluded.archived_by,archive_reason=excluded.archive_reason,updated_at=excluded.updated_at;
        insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
          values(b.id,p_actor,'admin','booking_archived',why);
      else
        if s.deleted_at is not null or (p_scope='active' and s.archived_at is not null) or (p_scope='archived' and s.archived_at is null)
          or b.order_status not in ('cancelled','expired','rejected') or b.payment_status in ('paid','pending')
          or exists(select 1 from public.booking_payment_records pr where pr.booking_id=b.id and pr.status='pending') then
          result:='failed'; message:='Booking belum final atau masih memiliki pembayaran/verification yang tidak boleh dikeluarkan dari daftar.'; return next; continue;
        end if;
        insert into public.booking_admin_record_state(booking_id,deleted_at,deleted_by,deletion_reason,deleted_from_scope,updated_at)
          values(b.id,now(),p_actor,why,p_scope,now())
          on conflict on constraint booking_admin_record_state_pkey do update set deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by,deletion_reason=excluded.deletion_reason,deleted_from_scope=excluded.deleted_from_scope,updated_at=excluded.updated_at;
        insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
          values(b.id,p_actor,'admin','booking_removed_from_list',why);
      end if;
      result:='success'; message:=case p_action when 'archive' then 'Booking diarsipkan.' when 'remove' then 'Booking dipindahkan ke Tempat Sampah.' else 'Booking dipulihkan ke daftar asal.' end;
      return next;
    exception when others then
      booking_id:=v_id; result:='failed'; message:='Operasi gagal. Periksa status terbaru booking dan coba lagi.'; return next;
    end;
  end loop;
end $$;
revoke all on function public.admin_manage_booking_records(uuid,uuid[],text,text,text) from public,anon,authenticated;
grant execute on function public.admin_manage_booking_records(uuid,uuid[],text,text,text) to service_role;

-- Preserve the old RPC name for deployed clients, but make it a soft-delete wrapper.
create or replace function public.admin_delete_unpaid_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); operation record;
begin
  if uid is null or not exists(select 1 from public.admin_users a where a.user_id=uid) then
    raise exception 'Akses Admin diperlukan.' using errcode='42501';
  end if;
  select * into operation from public.admin_manage_booking_records(uid,array[p_booking_id],'remove','active','Dikeluarkan dari daftar melalui aksi detail booking.');
  if operation.result<>'success' then raise exception '%',operation.message using errcode='23514'; end if;
end $$;
revoke all on function public.admin_delete_unpaid_booking(uuid) from public,anon;
grant execute on function public.admin_delete_unpaid_booking(uuid) to authenticated;

alter table public.notification_events drop constraint notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check check(event_type in(
  'booking_created','payment_reminder','proof_received','payment_verified','payment_rejected','booking_cancelled','booking_expired',
  'travel_reminder','approval_required','activity_today','delivery_failed','trip_schedule_changed'));
update public.notification_settings set email_events=array_append(email_events,'trip_schedule_changed')
  where id=true and not ('trip_schedule_changed'=any(email_events));

commit;
