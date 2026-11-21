-- Wklej CAŁOŚĆ do Supabase → SQL Editor → Run
-- Tworzy employees + rozszerza evaluation_cases + granty

-- 1) Tabela employees
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  email text,
  org_unit text,
  job_title text,
  hired_at date,
  contract_end_at date,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists contract_end_at date;

create index if not exists employees_created_by_idx on public.employees (created_by);

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- 2) Podłącz evaluation_cases do employees
alter table public.evaluation_cases drop constraint if exists evaluation_cases_employee_id_fkey;
truncate table public.evaluation_cases;

alter table public.evaluation_cases
  add constraint evaluation_cases_employee_id_fkey
  foreign key (employee_id) references public.employees (id) on delete restrict;

-- 3) Kolumny kreatora na sprawach
alter table public.evaluation_cases
  add column if not exists eligibility_result text,
  add column if not exists first_time_civil_service boolean,
  add column if not exists is_substitute boolean,
  add column if not exists is_ksap_graduate boolean,
  add column if not exists is_higher_position boolean,
  add column if not exists prep_service_status text,
  add column if not exists exam_required boolean default true,
  add column if not exists intro_talk_deadline date,
  add column if not exists nearest_deadline date,
  add column if not exists progress_percent int not null default 0,
  add column if not exists year int;

-- 4) Role / trigger
alter table public.profiles alter column role set default 'supervisor';

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
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'supervisor')
  );
  return new;
end;
$$;

update public.profiles set role = 'supervisor' where role::text = 'employee';

-- 5) RLS employees
alter table public.employees enable row level security;

drop policy if exists "employees_select_own_or_hr" on public.employees;
drop policy if exists "employees_insert_supervisor" on public.employees;
drop policy if exists "employees_update_own_or_hr" on public.employees;
drop policy if exists "employees_delete_own_or_hr" on public.employees;

create policy "employees_select_own_or_hr"
  on public.employees for select to authenticated
  using (created_by = auth.uid() or public.current_role() = 'hr');

create policy "employees_insert_supervisor"
  on public.employees for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.current_role() in ('supervisor', 'hr', 'unit_head')
  );

create policy "employees_update_own_or_hr"
  on public.employees for update to authenticated
  using (created_by = auth.uid() or public.current_role() = 'hr')
  with check (created_by = auth.uid() or public.current_role() = 'hr');

create policy "employees_delete_own_or_hr"
  on public.employees for delete to authenticated
  using (created_by = auth.uid() or public.current_role() = 'hr');

-- 6) RLS cases
drop policy if exists "cases_select_participants_or_hr" on public.evaluation_cases;
drop policy if exists "cases_select_supervisor_or_hr" on public.evaluation_cases;

create policy "cases_select_supervisor_or_hr"
  on public.evaluation_cases for select to authenticated
  using (
    public.current_role() = 'hr'
    or supervisor_id = auth.uid()
    or unit_head_id = auth.uid()
  );

-- 7) GRANT — bez tego znów będzie permission denied / schema cache
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.employees to authenticated;
grant select on table public.employees to anon;
grant select, insert, update, delete on table public.evaluation_cases to authenticated;

-- 8) Sprawdzenie
select 'employees_ok' as check, count(*) from public.employees;
