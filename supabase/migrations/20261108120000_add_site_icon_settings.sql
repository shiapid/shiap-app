begin;

create table public.site_icon_settings (
  icon_key text primary key check (icon_key in (
    'home', 'explore', 'booking', 'profile', 'trip', 'stay',
    'activities', 'shinema', 'my_booking', 'custom_trip'
  )),
  label text not null check (length(trim(label)) between 2 and 80),
  image_path text not null check (length(trim(image_path)) between 1 and 500),
  alt_text text not null check (length(trim(alt_text)) between 1 and 120),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.site_icon_settings
for each row execute function public.set_shiap_updated_at();

alter table public.site_icon_settings enable row level security;
revoke all on public.site_icon_settings from anon, authenticated;
grant select on public.site_icon_settings to anon, authenticated;
grant insert, update, delete on public.site_icon_settings to authenticated;
grant all on public.site_icon_settings to service_role;

create policy site_icon_settings_public_read
  on public.site_icon_settings for select to anon, authenticated
  using (is_active);
create policy site_icon_settings_admin_manage
  on public.site_icon_settings for all to authenticated
  using (public.is_shiap_admin())
  with check (public.is_shiap_admin());

comment on table public.site_icon_settings is
  'Admin-managed PNG overrides for customer-facing navigation and service icon slots.';

commit;
