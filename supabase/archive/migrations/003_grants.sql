-- Naprawa: permission denied for table profiles
-- Odpal w SQL Editor (całość)

grant usage on schema public to anon, authenticated, service_role;

grant usage on type public.app_role to anon, authenticated, service_role;
grant usage on type public.evaluation_type to anon, authenticated, service_role;
grant usage on type public.evaluation_status to anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select on table public.profiles to anon;

grant select, insert, update, delete on table public.evaluation_cases to authenticated;
grant select on table public.evaluation_cases to anon;

grant execute on function public.current_role() to authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;

-- na przyszłość: nowe tabele też z grantami
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
