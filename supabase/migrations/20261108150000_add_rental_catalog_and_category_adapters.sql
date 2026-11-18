-- Add Rental as a managed catalog category and preserve the existing
-- activity booking RPC as its backward-compatible booking adapter.
begin;

alter table public.shiap_experiences
  add column catalog_category text not null default 'activity'
    check (catalog_category in ('activity','rental','documentation')),
  add column rental_category text
    check (rental_category in (
      'water-sports-snorkeling',
      'beach-marine-adventure',
      'boat-island-transport',
      'vehicle-mobility',
      'camping-outdoor-gear',
      'camera-creator-gear',
      'beach-leisure-equipment',
      'event-group-equipment'
    ));

update public.shiap_experiences
set catalog_category = 'documentation'
where experience_type = 'documentation';

-- Match the Rental detection that the public website already used before this
-- migration, so existing catalog records keep their current public placement.
update public.shiap_experiences
set catalog_category = 'rental'
where experience_type = 'activity'
  and concat_ws(' ', title, slug, short_description, description) ~* '(rental|sewa|peralatan)';

update public.shiap_experiences
set rental_category = case
  when concat_ws(' ', title, slug, short_description, description) ~* '(boat|charter|kapal|perahu)' then 'boat-island-transport'
  when concat_ws(' ', title, slug, short_description, description) ~* '(gopro|go-pro|camera|kamera|creator)' then 'camera-creator-gear'
  when concat_ws(' ', title, slug, short_description, description) ~* '(car|mobil|motor|bike|sepeda|scooter)' then 'vehicle-mobility'
  when concat_ws(' ', title, slug, short_description, description) ~* '(tent|tenda|camp|camping)' then 'camping-outdoor-gear'
  when concat_ws(' ', title, slug, short_description, description) ~* '(umbrella|payung|kursi pantai|beach chair|sunbed)' then 'beach-leisure-equipment'
  when concat_ws(' ', title, slug, short_description, description) ~* '(event|group|sound system|pengeras suara)' then 'event-group-equipment'
  when concat_ws(' ', title, slug, short_description, description) ~* '(snorkel|masker|fins|fin |kayak|kano|paddle|jetski|jet-ski)' then 'water-sports-snorkeling'
  else 'beach-marine-adventure'
end
where catalog_category = 'rental';

create index shiap_experiences_category_status_idx
  on public.shiap_experiences(catalog_category, status, featured desc);

-- Keep the canonical service_type used by the existing RPC/inventory logic,
-- while exposing a customer/admin-facing category for Rental filtering.
alter table public.booking_items
  add column service_category text;

update public.booking_items item
set service_category = coalesce(
  (select experience.catalog_category
   from public.shiap_experiences experience
   where experience.id = item.service_catalog_id),
  item.service_type
);

alter table public.booking_items
  alter column service_category set default 'other',
  alter column service_category set not null,
  add constraint booking_items_service_category_check
    check (service_category in ('trip','stay','rental','activity','documentation','other'));

create or replace function public.assign_booking_item_service_category()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.service_type in ('activity','documentation') and new.service_catalog_id is not null then
    select experience.catalog_category into new.service_category
    from public.shiap_experiences experience
    where experience.id = new.service_catalog_id;
  end if;

  new.service_category := coalesce(new.service_category, new.service_type);
  return new;
end;
$$;

create trigger booking_items_assign_service_category
  before insert or update on public.booking_items
  for each row execute function public.assign_booking_item_service_category();

alter table public.site_icon_settings
  drop constraint site_icon_settings_icon_key_check;
alter table public.site_icon_settings
  add constraint site_icon_settings_icon_key_check check (icon_key in (
    'home', 'explore', 'booking', 'profile', 'trip', 'stay',
    'activities', 'rental', 'shinema', 'my_booking', 'custom_trip', 'services', 'menu'
  ));

comment on column public.shiap_experiences.catalog_category is
  'Customer-facing catalog category. Rental uses the existing activity booking and inventory adapter.';
comment on column public.booking_items.service_category is
  'Customer/admin-facing category; service_type remains the backward-compatible booking RPC type.';

commit;
