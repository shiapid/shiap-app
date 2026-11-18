begin;
alter table public.site_icon_settings drop constraint site_icon_settings_icon_key_check;
alter table public.site_icon_settings add constraint site_icon_settings_icon_key_check check(icon_key in ('home','explore','booking','profile','trip','stay','places','activities','rental','shinema','my_booking','custom_trip','services','menu','search','notifications','favorites','trust_destinations','trust_booking','trust_partners','trust_sustainability','featured_trips','popular_destinations','more_experiences','private_trip'));
commit;
