-- Expand the customer-facing icon slots that admins can override with PNGs.
-- This is additive to the existing icon settings table and policies.
begin;

alter table public.site_icon_settings
  drop constraint if exists site_icon_settings_icon_key_check;

alter table public.site_icon_settings
  add constraint site_icon_settings_icon_key_check check (icon_key in (
    'home', 'explore', 'booking', 'profile', 'trip', 'stay',
    'activities', 'rental', 'shinema', 'my_booking', 'custom_trip',
    'services', 'menu', 'search', 'notifications', 'favorites',
    'trust_destinations', 'trust_booking', 'trust_partners',
    'trust_sustainability', 'featured_trips', 'popular_destinations',
    'more_experiences', 'private_trip'
  ));

comment on constraint site_icon_settings_icon_key_check on public.site_icon_settings is
  'Supported admin-managed icon slots for customer-facing navigation, services, and homepage sections.';

commit;
