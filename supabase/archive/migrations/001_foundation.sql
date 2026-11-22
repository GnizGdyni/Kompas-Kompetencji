-- Kompas Kompetencji — fundament: role, profile, sprawy ocen
-- Odpal w Supabase → SQL Editor (całość naraz)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Role
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'supervisor',  -- przełożony / oceniający
  'hr',          -- HR / administrator procesu
  'employee',    -- oceniany
  'unit_head'    -- kierujący komórką (opcjonalnie osobne konto)
);

create type public.evaluation_type as enum (
  'first',     -- pierwsza ocena
  'periodic'   -- ocena okresowa (później)
);

create type public.evaluation_status as enum (
  'draft',
  'intro_done',
  'awaiting_report',
  'in_assessment',
  'interview_done',
  'completed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Profile (1:1 z auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  role public.app_role not null default 'employee',
  org_unit text,                 -- komórka organizacyjna
  job_title text,                -- stanowisko
  is_unit_head boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- Auto-profil po rejestracji / utworzeniu usera w Auth
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
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'employee')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sprawa oceny (szkielet pod pierwszą ocenę)
-- ---------------------------------------------------------------------------
create table public.evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  evaluation_type public.evaluation_type not null default 'first',
  status public.evaluation_status not null default 'draft',

  employee_id uuid not null references public.profiles (id),
  supervisor_id uuid not null references public.profiles (id),
  unit_head_id uuid references public.profiles (id),

  office_name text default 'Ministerstwo Cyfryzacji',
  employee_org_unit text,
  employee_job_title text,

  intro_talk_at date,
  report_due_from date,
  report_due_to date,
  assessment_window_from date,
  assessment_window_to date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evaluation_cases_supervisor_idx on public.evaluation_cases (supervisor_id);
create index evaluation_cases_employee_idx on public.evaluation_cases (employee_id);
create index evaluation_cases_status_idx on public.evaluation_cases (status);

create trigger evaluation_cases_updated_at
  before update on public.evaluation_cases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: aktualna rola
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.evaluation_cases enable row level security;

-- Profil: każdy widzi swój; HR widzi wszystkich
create policy "profiles_select_own_or_hr"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.current_role() = 'hr'
  );

-- Profil: user aktualizuje swój (bez zmiany roli — rolę zmienia HR)
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_update_hr"
  on public.profiles for update
  to authenticated
  using (public.current_role() = 'hr')
  with check (public.current_role() = 'hr');

-- Sprawy: uczestnicy + HR
create policy "cases_select_participants_or_hr"
  on public.evaluation_cases for select
  to authenticated
  using (
    public.current_role() = 'hr'
    or supervisor_id = auth.uid()
    or employee_id = auth.uid()
    or unit_head_id = auth.uid()
  );

create policy "cases_insert_supervisor_or_hr"
  on public.evaluation_cases for insert
  to authenticated
  with check (
    public.current_role() in ('supervisor', 'hr', 'unit_head')
    and (supervisor_id = auth.uid() or public.current_role() = 'hr')
  );

create policy "cases_update_supervisor_or_hr"
  on public.evaluation_cases for update
  to authenticated
  using (
    public.current_role() = 'hr'
    or supervisor_id = auth.uid()
  )
  with check (
    public.current_role() = 'hr'
    or supervisor_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Seed podglądowy (opcjonalny) — odkomentuj PO utworzeniu userów w Auth
-- i podstaw ich UUID:
--
-- update public.profiles set
--   full_name = 'Marek Przełożony',
--   role = 'supervisor',
--   org_unit = 'Departament Usług Cyfrowych',
--   job_title = 'Naczelnik wydziału',
--   is_unit_head = true
-- where email = 'marek@example.com';
--
-- update public.profiles set
--   full_name = 'Kasia Nowak',
--   role = 'employee',
--   org_unit = 'Departament Usług Cyfrowych',
--   job_title = 'Specjalista'
-- where email = 'kasia@example.com';
--
-- update public.profiles set
--   full_name = 'Anna HR',
--   role = 'hr',
--   org_unit = 'Biuro Dyrektora Generalnego',
--   job_title = 'Specjalista HR'
-- where email = 'hr@example.com';
