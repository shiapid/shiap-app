begin;

create table public.custom_trip_settings (
  id boolean primary key default true check(id),
  is_active boolean not null default true,
  whatsapp_number text not null default '' check(whatsapp_number='' or whatsapp_number ~ '^[0-9]{8,15}$'),
  destinations text[] not null default '{}',
  durations_days integer[] not null default '{1,2,3,4,5}',
  activities text[] not null default '{}',
  stays text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.custom_trip_settings(id,is_active,whatsapp_number,destinations,durations_days,activities,stays)
values(
  true,true,'',
  array['Pantai Teluk Tamiang','Pantai Risalo','Pantai Gedambaan','Pulau Kerayaan'],
  array[1,2,3,4,5],
  array['Snorkeling','Jetski','Banana Boat','Kano','Paddleboard','Island Hopping'],
  array['Homestay','Villa','Penginapan lainnya']
);

alter table public.custom_trip_settings enable row level security;
revoke all on public.custom_trip_settings from anon,authenticated;
grant select on public.custom_trip_settings to anon,authenticated;
grant update on public.custom_trip_settings to authenticated;
grant all on public.custom_trip_settings to service_role;
create policy custom_trip_settings_public_read on public.custom_trip_settings
  for select to anon,authenticated using(is_active or public.is_shiap_admin());
create policy custom_trip_settings_admin_update on public.custom_trip_settings
  for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());

commit;
