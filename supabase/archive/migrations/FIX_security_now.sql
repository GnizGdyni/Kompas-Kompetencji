-- Poprawki bezpieczeństwa (README → Wyniki rewizji kodu, S1, S2, S4).
-- Odpal całość w Supabase → SQL Editor.

-- ---------------------------------------------------------------------------
-- S1: zwykły użytkownik nie może zmienić sobie roli ani flagi kierującego.
-- Zmiany z SQL Editora / service role (auth.uid() is null) i przez HR są dozwolone.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_role() = 'hr' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_unit_head is distinct from old.is_unit_head then
    raise exception 'Zmiana roli jest dostępna tylko dla HR';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_self_change on public.profiles;
create trigger profiles_prevent_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- ---------------------------------------------------------------------------
-- S2: rola przy rejestracji zawsze 'supervisor' — niezależnie od metadanych.
-- Konto HR nadaje się ręcznie: update profiles set role = 'hr' ... (SQL Editor).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'supervisor'
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- S4: pliki sprawozdań — ścieżka `<case_id>/<plik>`.
-- Odczyt: przełożony sprawy, kierujący komórką, HR. Zapis/usuwanie: przełożony sprawy.
-- ---------------------------------------------------------------------------
drop policy if exists "reports_select_auth" on storage.objects;
drop policy if exists "reports_insert_auth" on storage.objects;
drop policy if exists "reports_update_auth" on storage.objects;
drop policy if exists "reports_delete_auth" on storage.objects;
drop policy if exists "reports_select_case" on storage.objects;
drop policy if exists "reports_insert_case" on storage.objects;
drop policy if exists "reports_update_case" on storage.objects;
drop policy if exists "reports_delete_case" on storage.objects;

create policy "reports_select_case"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1]
        and (
          c.supervisor_id = auth.uid()
          or c.unit_head_id = auth.uid()
          or public.current_role() = 'hr'
        )
    )
  );

create policy "reports_insert_case"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.supervisor_id = auth.uid()
    )
  );

create policy "reports_update_case"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.supervisor_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.supervisor_id = auth.uid()
    )
  );

create policy "reports_delete_case"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.supervisor_id = auth.uid()
    )
  );

select 'security_hardening_ok' as check;
