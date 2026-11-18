-- Public catalog policies call this helper for non-published rows. The result
-- only reveals whether the current request is an admin (anon is always false).
grant execute on function public.is_shiap_admin() to anon,authenticated;
