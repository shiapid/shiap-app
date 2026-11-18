begin;

create table public.home_hero_settings (
  id boolean primary key default true check (id),
  eyebrow text not null default 'TRAVEL · EXPLORE · DISCOVER' check (length(eyebrow) between 2 and 100),
  title_line_one text not null default 'Explore More.' check (length(title_line_one) between 1 and 80),
  title_line_two text not null default 'With SHIAP.' check (length(title_line_two) between 1 and 80),
  description text not null default 'Satu pintu untuk trip, stay, aktivitas laut, dokumentasi dan pengalaman wisata di Kotabaru.' check (length(description) between 2 and 300),
  button_label text not null default 'Mulai Jelajah' check (length(button_label) between 1 and 60),
  button_href text not null default '/explore' check (button_href like '/%' and button_href not like '//%'),
  search_placeholder text not null default 'Cari trip, stay, snorkeling...' check (length(search_placeholder) between 2 and 120),
  image_path text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.home_hero_settings(id) values(true);
create trigger set_updated_at before update on public.home_hero_settings
for each row execute function public.set_shiap_updated_at();

alter table public.home_hero_settings enable row level security;
revoke all on public.home_hero_settings from anon,authenticated;
grant select on public.home_hero_settings to anon,authenticated;
grant update on public.home_hero_settings to authenticated;
grant all on public.home_hero_settings to service_role;

create policy home_hero_settings_public_read on public.home_hero_settings
  for select to anon,authenticated using(true);
create policy home_hero_settings_admin_update on public.home_hero_settings
  for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());

comment on table public.home_hero_settings is
  'Customer-visible homepage Explore hero copy, CTA, search placeholder, and optional image override.';

commit;
