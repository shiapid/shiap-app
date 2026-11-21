begin;

create function public.admin_cancelled_unified_item_ids(p_items uuid[])
returns table(item_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if cardinality(p_items)>500 then raise exception 'Daftar item kalender terlalu panjang.' using errcode='22023'; end if;
  return query select i.item_id from shiap_private.unified_order_items i where i.item_id=any(p_items) and i.cancelled_at is not null;
end $$;
revoke all on function public.admin_cancelled_unified_item_ids(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.admin_cancelled_unified_item_ids(uuid[]) to authenticated;

commit;
