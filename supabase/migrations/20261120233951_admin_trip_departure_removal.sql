begin;

alter table public.trip_departures
  add column removed_at timestamptz,
  add constraint trip_departures_removed_status_check
    check (removed_at is null or status = 'cancelled');

create function public.admin_remove_trip_departure(
  p_actor uuid, p_departure_id uuid, p_expected_version integer
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  departure public.trip_departures%rowtype;
  removed_time timestamptz;
begin
  if p_actor is null or not exists (
    select 1 from public.admin_users where user_id = p_actor
  ) then
    raise exception 'Akses Admin diperlukan.' using errcode = '42501';
  end if;

  -- Serialize with booking creation and edits, which lock the same departure.
  select * into departure from public.trip_departures
    where id = p_departure_id for update;
  if not found then return 'not_found'; end if;
  if departure.removed_at is not null then return 'removed'; end if;
  if departure.version is distinct from p_expected_version then return 'conflict'; end if;

  if departure.booked_seats > 0 or exists (
    select 1 from public.booking_items where departure_id = p_departure_id
  ) then
    return 'has_bookings';
  end if;

  update public.trip_departures
    set status = 'cancelled', removed_at = clock_timestamp()
    where id = p_departure_id returning removed_at into removed_time;

  insert into public.admin_trip_departure_audit (
    departure_id, actor_user_id, old_values, new_values, reason
  ) values (
    p_departure_id, p_actor,
    jsonb_build_object('status', departure.status, 'removed_at', departure.removed_at),
    jsonb_build_object('status', 'cancelled', 'removed_at', removed_time),
    'Jadwal dihapus dari daftar oleh Admin.'
  );

  return 'removed';
end;
$$;

revoke all on function public.admin_remove_trip_departure(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_remove_trip_departure(uuid, uuid, integer) to service_role;

commit;
