-- Apply only after the server-backed Admin Operations routes are active.
-- This closes the legacy browser-to-table schedule write path without breaking
-- the currently deployed Admin UI during the additive schema/application rollout.
begin;

revoke insert,update,delete on public.trip_departures from public,anon,authenticated;
drop policy if exists trip_departures_admin_write on public.trip_departures;
grant select on public.trip_departures to anon,authenticated;

commit;
