-- Least-privilege grants for the four tables in the verified hosted baseline.
-- Customer booking/catalog V2 tables are not present in the baseline and are
-- intentionally not defined here.

begin;

revoke all privileges on table public.bookings, public.customers
  from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.trip_schedules, public.trips
  from anon, authenticated;

grant select on table public.trip_schedules, public.trips
  to anon, authenticated;

commit;
