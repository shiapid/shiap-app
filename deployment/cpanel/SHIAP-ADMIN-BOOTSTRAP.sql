-- Run manually in Supabase SQL Editor only after creating and confirming the
-- intended user through Authentication > Users. No password is stored here.
-- Replace the placeholder with the exact confirmed admin email.
do $$
declare
  bootstrap_email text := lower(trim('REPLACE_WITH_CONFIRMED_ADMIN_EMAIL'));
  bootstrap_user_id uuid;
begin
  if bootstrap_email = '' or bootstrap_email = 'replace_with_confirmed_admin_email' then
    raise exception 'Set the confirmed admin email in this one-time bootstrap script.';
  end if;

  select id into bootstrap_user_id
  from auth.users
  where lower(email) = bootstrap_email
    and email_confirmed_at is not null;

  if bootstrap_user_id is null then
    raise exception 'No confirmed Auth user matches the supplied email.';
  end if;

  if exists (select 1 from public.admin_users where user_id = bootstrap_user_id) then
    return;
  end if;

  if exists (select 1 from public.admin_users) then
    raise exception 'An admin already exists; use the reviewed admin management process.';
  end if;

  insert into public.admin_users(user_id) values (bootstrap_user_id)
  on conflict (user_id) do nothing;
end $$;
