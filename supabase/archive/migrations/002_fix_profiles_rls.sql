-- Upraszcza RLS na profiles (unika problemów z current_role przy SELECT własnego profilu)

drop policy if exists "profiles_select_own_or_hr" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_select_hr"
  on public.profiles for select
  to authenticated
  using (public.current_role() = 'hr');
