-- Preserve approved public column signatures and visibility predicates without table grants.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';set local search_path='';
do $migration$
declare target text;definition text;columns_ddl text;columns_select text;projection text;begin
 foreach target in array array['places_public_directory_v','places_public_plan_v','destinations_public_v','places_public_destinations_v'] loop
  select pg_get_viewdef(c.oid,true) into definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=target and c.relkind='v';
  if definition is null then raise exception 'Expected public projection missing: %',target;end if;
  select string_agg(format('%I %s',a.attname,format_type(a.atttypid,a.atttypmod)),',' order by a.attnum),string_agg(format('p.%I',a.attname),',' order by a.attnum) into columns_ddl,columns_select from pg_attribute a where a.attrelid=('public.'||target)::regclass and a.attnum>0 and not a.attisdropped;
  projection:=target||'_projection';
  -- No user-supplied SQL/parameters; these are the exact existing approved SELECTs.
  execute format('create function shiap_private.%I() returns table (%s) language sql stable security definer set search_path='''' as $projection_body$ %s $projection_body$',projection,columns_ddl,definition);
  execute format('revoke all on function shiap_private.%I() from public',projection);
  execute format('grant execute on function shiap_private.%I() to anon,authenticated,service_role',projection);
  execute format('create or replace view public.%I with(security_invoker=true,security_barrier=true) as select %s from shiap_private.%I() p',target,columns_select,projection);
 end loop;
end $migration$;
commit;
