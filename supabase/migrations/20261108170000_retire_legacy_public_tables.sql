-- Retire legacy production catalog/booking tables after explicit owner approval.
-- This intentionally deletes their rows. No customer records are copied.
-- Run only after the SHIAP replacement schema migrations have succeeded.
begin;

drop table if exists public.bookings;
drop table if exists public.customers;
drop table if exists public.trip_schedules;
drop table if exists public.trips;

commit;
