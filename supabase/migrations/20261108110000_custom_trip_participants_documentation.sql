begin;

alter table public.custom_trip_settings
  add column min_participants integer not null default 1 check(min_participants between 1 and 100),
  add column max_participants integer not null default 20 check(max_participants between 1 and 100),
  add column documentation_services text[] not null default array['Drone','Camera','Underwater'],
  add column documentation_deliverables text[] not null default array['Foto','Video','Editing'],
  add constraint custom_trip_participant_range_check check(max_participants>=min_participants);

commit;
