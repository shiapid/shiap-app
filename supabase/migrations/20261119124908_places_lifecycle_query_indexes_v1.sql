-- Supports property entitlement/history lookups and bounded retention on growing event history.
-- No business data, payment state or public grants are changed.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
create index places_subscriptions_property_period_idx on public.places_subscriptions(property_id,starts_at,ends_at);
create index places_marketing_retention_idx on public.places_marketing_events(created_at);
commit;
