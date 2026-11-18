begin;

alter table public.site_icon_settings
  drop constraint site_icon_settings_icon_key_check;
alter table public.site_icon_settings
  add constraint site_icon_settings_icon_key_check check (icon_key in (
    'home', 'explore', 'booking', 'profile', 'trip', 'stay',
    'activities', 'shinema', 'my_booking', 'custom_trip', 'services', 'menu'
  ));

commit;
