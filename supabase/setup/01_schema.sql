-- ============================================================================
-- Kompas Kompetencji — pełny schemat bazy (jeden plik)
--
-- Supabase → SQL Editor → wklej CAŁOŚĆ → Run.
-- Bezpieczny do wielokrotnego uruchamiania: na pustej bazie tworzy wszystko,
-- na istniejącej dokłada brakujące elementy i nadpisuje polityki/funkcje.
-- NIE usuwa danych.
--
-- Kolejne kroki: 02_seed_competencies.sql, 03_seed_legal_knowledge.sql,
-- opcjonalnie 04_seed_demo.sql.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Typy
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
    -- 'employee' zostaje w enumie dla zgodności wstecznej, aplikacja go nie używa
    create type public.app_role as enum ('supervisor', 'hr', 'employee', 'unit_head');
  end if;
  if not exists (select 1 from pg_type where typname = 'evaluation_type' and typnamespace = 'public'::regnamespace) then
    create type public.evaluation_type as enum ('first', 'periodic');
  end if;
  if not exists (select 1 from pg_type where typname = 'evaluation_status' and typnamespace = 'public'::regnamespace) then
    create type public.evaluation_status as enum (
      'draft', 'intro_done', 'awaiting_report', 'in_assessment',
      'interview_done', 'completed', 'cancelled'
    );
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Funkcja pomocnicza updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Profile (konta logujące się: przełożony, HR, kierujący)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  role public.app_role not null default 'supervisor',
  org_unit text,
  job_title text,
  is_unit_head boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles alter column role set default 'supervisor';
create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Nowe konto zawsze jako przełożony; HR nadaje się ręcznie w SQL Editorze
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Zmiana roli / flagi kierującego tylko przez HR albo z SQL Editora
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

update public.profiles set role = 'supervisor' where role = 'employee';

-- ----------------------------------------------------------------------------
-- 4. Pracownicy (osoby oceniane, bez konta)
-- ----------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists org_unit text,
  add column if not exists job_title text,
  add column if not exists hired_at date,
  add column if not exists contract_end_at date;

create index if not exists employees_created_by_idx on public.employees (created_by);

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

update public.employees
set
  first_name = coalesce(first_name, split_part(full_name, ' ', 1)),
  last_name = coalesce(
    last_name,
    nullif(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''),
    full_name
  )
where first_name is null or last_name is null;

-- ----------------------------------------------------------------------------
-- 5. Procesy oceny
-- ----------------------------------------------------------------------------
create table if not exists public.evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  evaluation_type public.evaluation_type not null default 'first',
  status public.evaluation_status not null default 'draft',
  employee_id uuid not null references public.employees (id) on delete restrict,
  supervisor_id uuid not null references public.profiles (id),
  unit_head_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Starsze bazy miały employee_id → profiles; przepinamy na employees (bez kasowania danych)
do $$
declare
  v_target regclass;
begin
  select c.confrelid::regclass into v_target
  from pg_constraint c
  where c.conname = 'evaluation_cases_employee_id_fkey'
    and c.conrelid = 'public.evaluation_cases'::regclass;

  if v_target is distinct from 'public.employees'::regclass then
    if exists (
      select 1 from public.evaluation_cases ec
      where not exists (select 1 from public.employees e where e.id = ec.employee_id)
    ) then
      raise notice 'evaluation_cases zawiera sprawy bez pracownika w employees — FK nie przepięty, usuń je ręcznie';
    else
      alter table public.evaluation_cases drop constraint if exists evaluation_cases_employee_id_fkey;
      alter table public.evaluation_cases
        add constraint evaluation_cases_employee_id_fkey
        foreign key (employee_id) references public.employees (id) on delete restrict;
    end if;
  end if;
end;
$$;

alter table public.evaluation_cases
  -- identyfikacja
  add column if not exists sheet_type text,
  add column if not exists office_name text default 'Ministerstwo Cyfryzacji',
  add column if not exists employee_org_unit text,
  add column if not exists employee_job_title text,
  add column if not exists year int,
  add column if not exists progress_percent int not null default 0,
  -- kwalifikacja (pierwsza ocena)
  add column if not exists eligibility_result text,
  add column if not exists first_time_civil_service boolean,
  add column if not exists is_substitute boolean,
  add column if not exists is_ksap_graduate boolean,
  add column if not exists is_higher_position boolean,
  add column if not exists prep_service_status text,
  add column if not exists exam_required boolean default true,
  add column if not exists exam_result text,
  -- etap 1
  add column if not exists intro_talk_at date,
  add column if not exists intro_talk_deadline date,
  add column if not exists intro_checklist jsonb not null default '{}'::jsonb,
  add column if not exists criteria_talk_at date,
  add column if not exists extra_criteria jsonb default '[]'::jsonb,
  -- etap 2
  add column if not exists report_due_from date,
  add column if not exists report_due_to date,
  add column if not exists report_submitted_at date,
  add column if not exists report_on_time boolean,
  add column if not exists report_notes text,
  add column if not exists report_file_path text,
  add column if not exists report_file_name text,
  add column if not exists report_file_mime text,
  add column if not exists report_file_size integer,
  add column if not exists report_file_uploaded_at timestamptz,
  add column if not exists prep_service_end_at date,
  add column if not exists assessment_interview_at date,
  -- etap 3
  add column if not exists interview_notes text,
  add column if not exists indicator_answers jsonb default '{}'::jsonb,
  add column if not exists partial_scores jsonb not null default '{}'::jsonb,
  add column if not exists verdict text,
  add column if not exists verdict_justification text,
  add column if not exists development_notes text,
  -- terminy
  add column if not exists assessment_window_from date,
  add column if not exists assessment_window_to date,
  add column if not exists nearest_deadline date,
  add column if not exists cycle_anchor_at date,
  add column if not exists cycle_due_at date,
  add column if not exists next_cycle_due_at date;

comment on column public.evaluation_cases.sheet_type is 'first | B | C';
comment on column public.evaluation_cases.exam_result is 'pass | fail | na | null';
comment on column public.evaluation_cases.verdict is 'positive | negative | null';
comment on column public.evaluation_cases.cycle_due_at is 'Termin oceny okresowej: cycle_anchor_at + 24 miesiące';

create index if not exists evaluation_cases_supervisor_idx on public.evaluation_cases (supervisor_id);
create index if not exists evaluation_cases_employee_idx on public.evaluation_cases (employee_id);
create index if not exists evaluation_cases_status_idx on public.evaluation_cases (status);
create index if not exists evaluation_cases_year_idx on public.evaluation_cases (year);
create index if not exists evaluation_cases_nearest_deadline_idx on public.evaluation_cases (nearest_deadline);

drop trigger if exists evaluation_cases_updated_at on public.evaluation_cases;
create trigger evaluation_cases_updated_at
  before update on public.evaluation_cases
  for each row execute function public.set_updated_at();

update public.evaluation_cases
set sheet_type = 'first'
where evaluation_type = 'first' and (sheet_type is null or sheet_type = '');

update public.evaluation_cases
set year = extract(year from created_at)::int
where year is null;

-- ----------------------------------------------------------------------------
-- 6. Uwagi o pracowniku
-- ----------------------------------------------------------------------------
create table if not exists public.employee_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  case_id uuid references public.evaluation_cases (id) on delete set null,
  author_id uuid not null references public.profiles (id) on delete restrict,
  tone text not null check (tone in ('positive', 'negative')),
  body text not null,
  noted_at date not null default (current_date),
  created_at timestamptz not null default now()
);

alter table public.employee_notes add column if not exists subject text;

update public.employee_notes
set subject = coalesce(nullif(trim(subject), ''), left(body, 80))
where subject is null or trim(subject) = '';

alter table public.employee_notes alter column subject set default '';
alter table public.employee_notes alter column subject set not null;

create index if not exists employee_notes_employee_idx
  on public.employee_notes (employee_id, noted_at desc);

-- ----------------------------------------------------------------------------
-- 7. Model kompetencji (dane: 02_seed_competencies.sql)
-- ----------------------------------------------------------------------------
create table if not exists public.competencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order int not null default 0,
  max_level_points int not null default 4,
  created_at timestamptz not null default now()
);

alter table public.competencies
  add column if not exists for_first_evaluation boolean not null default false;

create table if not exists public.competency_indicators (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references public.competencies (id) on delete cascade,
  sort_order int not null default 0,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.competency_indicator_levels (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.competency_indicators (id) on delete cascade,
  level_index int not null check (level_index >= 0),
  points int not null check (points >= 0),
  label text not null,
  description text not null,
  unique (indicator_id, level_index)
);

-- ----------------------------------------------------------------------------
-- 8. Baza wiedzy asystenta (dane: 03_seed_legal_knowledge.sql)
-- ----------------------------------------------------------------------------
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  stage text not null
    check (stage in ('GENERAL', 'ALL_STAGES', 'INITIAL_TALK', 'REPORT', 'FINAL_EVALUATION', 'PERIODIC')),
  content text not null,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_documents_stage_idx on public.legal_documents (stage);

drop trigger if exists legal_documents_set_updated_at on public.legal_documents;
create trigger legal_documents_set_updated_at
  before update on public.legal_documents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. Powiadomienia (dzwonek)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  case_id uuid references public.evaluation_cases (id) on delete cascade,
  kind text not null check (kind in ('deadline_yellow', 'deadline_red', 'hr_reminder')),
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id) where read_at is null;
create unique index if not exists notifications_open_unique
  on public.notifications (recipient_id, case_id, kind)
  where read_at is null and case_id is not null;

-- ----------------------------------------------------------------------------
-- 10. RLS — polityki dostępu
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.evaluation_cases enable row level security;
alter table public.employee_notes enable row level security;
alter table public.competencies enable row level security;
alter table public.competency_indicators enable row level security;
alter table public.competency_indicator_levels enable row level security;
alter table public.legal_documents enable row level security;
alter table public.notifications enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_hr" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_hr" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_hr" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_select_hr" on public.profiles
  for select to authenticated using (public.current_role() = 'hr');
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_update_hr" on public.profiles
  for update to authenticated
  using (public.current_role() = 'hr') with check (public.current_role() = 'hr');

-- employees
drop policy if exists "employees_select_own_or_hr" on public.employees;
drop policy if exists "employees_insert_supervisor" on public.employees;
drop policy if exists "employees_update_own_or_hr" on public.employees;
drop policy if exists "employees_delete_own_or_hr" on public.employees;

create policy "employees_select_own_or_hr" on public.employees
  for select to authenticated
  using (created_by = auth.uid() or public.current_role() = 'hr');
create policy "employees_insert_supervisor" on public.employees
  for insert to authenticated
  with check (created_by = auth.uid() and public.current_role() in ('supervisor', 'hr', 'unit_head'));
create policy "employees_update_own_or_hr" on public.employees
  for update to authenticated
  using (created_by = auth.uid() or public.current_role() = 'hr')
  with check (created_by = auth.uid() or public.current_role() = 'hr');
create policy "employees_delete_own_or_hr" on public.employees
  for delete to authenticated
  using (created_by = auth.uid() or public.current_role() = 'hr');

-- evaluation_cases
drop policy if exists "cases_select_participants_or_hr" on public.evaluation_cases;
drop policy if exists "cases_select_supervisor_or_hr" on public.evaluation_cases;
drop policy if exists "cases_insert_supervisor_or_hr" on public.evaluation_cases;
drop policy if exists "cases_update_supervisor_or_hr" on public.evaluation_cases;
drop policy if exists "cases_delete_own_supervisor" on public.evaluation_cases;

create policy "cases_select_supervisor_or_hr" on public.evaluation_cases
  for select to authenticated
  using (public.current_role() = 'hr' or supervisor_id = auth.uid() or unit_head_id = auth.uid());
create policy "cases_insert_supervisor_or_hr" on public.evaluation_cases
  for insert to authenticated
  with check (
    public.current_role() in ('supervisor', 'hr', 'unit_head')
    and (supervisor_id = auth.uid() or public.current_role() = 'hr')
  );
create policy "cases_update_supervisor_or_hr" on public.evaluation_cases
  for update to authenticated
  using (public.current_role() = 'hr' or supervisor_id = auth.uid())
  with check (public.current_role() = 'hr' or supervisor_id = auth.uid());
create policy "cases_delete_own_supervisor" on public.evaluation_cases
  for delete to authenticated
  using (supervisor_id = auth.uid() and public.current_role() in ('supervisor', 'unit_head'));

-- employee_notes (bez UPDATE/DELETE — uwagi są niezmienne)
drop policy if exists "notes_select" on public.employee_notes;
drop policy if exists "notes_insert" on public.employee_notes;

create policy "notes_select" on public.employee_notes
  for select to authenticated
  using (
    public.current_role() = 'hr'
    or exists (select 1 from public.employees e where e.id = employee_id and e.created_by = auth.uid())
  );
create policy "notes_insert" on public.employee_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.current_role() = 'hr'
      or exists (select 1 from public.employees e where e.id = employee_id and e.created_by = auth.uid())
    )
  );

-- model kompetencji — odczyt dla zalogowanych
drop policy if exists "competencies_read" on public.competencies;
drop policy if exists "indicators_read" on public.competency_indicators;
drop policy if exists "levels_read" on public.competency_indicator_levels;

create policy "competencies_read" on public.competencies
  for select to authenticated using (true);
create policy "indicators_read" on public.competency_indicators
  for select to authenticated using (true);
create policy "levels_read" on public.competency_indicator_levels
  for select to authenticated using (true);

-- legal_documents — odczyt dla kont staff
drop policy if exists "legal_documents_select_staff" on public.legal_documents;
create policy "legal_documents_select_staff" on public.legal_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('supervisor', 'hr', 'unit_head')
    )
  );

-- notifications — wstawianie tylko przez funkcje RPC
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;

create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid() or public.current_role() = 'hr');
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. Uprawnienia (GRANT)
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant usage on type public.app_role to anon, authenticated, service_role;
grant usage on type public.evaluation_type to anon, authenticated, service_role;
grant usage on type public.evaluation_status to anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.evaluation_cases to authenticated;
grant select, insert on table public.employee_notes to authenticated;
grant select on table public.competencies to authenticated;
grant select on table public.competency_indicators to authenticated;
grant select on table public.competency_indicator_levels to authenticated;
grant select on table public.legal_documents to authenticated;
grant select, update on table public.notifications to authenticated;

-- Dostęp anon nie jest potrzebny (RLS i tak blokuje)
revoke all on table public.profiles from anon;
revoke all on table public.employees from anon;
revoke all on table public.evaluation_cases from anon;

grant execute on function public.current_role() to authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. Funkcje RPC powiadomień
-- ----------------------------------------------------------------------------
create or replace function public.hr_send_case_reminder(p_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.evaluation_cases%rowtype;
  v_emp_name text;
  v_timeliness text;
  v_id uuid;
begin
  if public.current_role() is distinct from 'hr' then
    raise exception 'Tylko HR może wysyłać przypomnienia';
  end if;

  select * into v_case from public.evaluation_cases where id = p_case_id;
  if not found then
    raise exception 'Nie znaleziono sprawy';
  end if;
  if v_case.status in ('completed', 'cancelled') then
    raise exception 'Sprawa jest już zakończona';
  end if;

  select coalesce(nullif(trim(concat_ws(' ', e.first_name, e.last_name)), ''), e.full_name, 'pracownik')
  into v_emp_name
  from public.employees e where e.id = v_case.employee_id;

  if v_case.nearest_deadline is null then
    v_timeliness := 'brak terminu';
  elsif v_case.nearest_deadline < current_date then
    v_timeliness := 'po terminie';
  elsif v_case.nearest_deadline <= current_date + 14 then
    v_timeliness := 'zbliża się';
  else
    v_timeliness := 'w terminie';
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = v_case.supervisor_id
    and case_id = p_case_id
    and kind = 'hr_reminder'
    and read_at is null;

  insert into public.notifications (recipient_id, case_id, kind, title, body, created_by)
  values (
    v_case.supervisor_id,
    p_case_id,
    'hr_reminder',
    format('Przypomnienie HR: %s', v_emp_name),
    format('HR prosi o weryfikację procesu. Najbliższy termin: %s (%s).',
           coalesce(v_case.nearest_deadline::text, 'brak'), v_timeliness),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.sync_deadline_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_kind text;
  v_title text;
  v_body text;
  v_count int := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  for r in
    select
      c.id as case_id,
      c.nearest_deadline,
      coalesce(nullif(trim(concat_ws(' ', e.first_name, e.last_name)), ''), e.full_name, 'pracownik') as emp_name
    from public.evaluation_cases c
    join public.employees e on e.id = c.employee_id
    where c.supervisor_id = auth.uid()
      and c.status not in ('completed', 'cancelled')
      and c.nearest_deadline is not null
  loop
    if r.nearest_deadline < current_date then
      v_kind := 'deadline_red';
      v_title := format('Po terminie: %s', r.emp_name);
      v_body := format('Termin %s już minął. Wejdź w proces i domknij zaległy etap.', r.nearest_deadline::text);
    elsif r.nearest_deadline <= current_date + 14 then
      v_kind := 'deadline_yellow';
      v_title := format('Zbliża się termin: %s', r.emp_name);
      v_body := format('Najbliższy termin: %s. Sprawdź status procesu.', r.nearest_deadline::text);
    else
      continue;
    end if;

    -- Antyspam: jedno nieprzeczytane na sprawę; po przeczytaniu kolejne po 3 dniach
    if exists (
      select 1 from public.notifications n
      where n.recipient_id = auth.uid() and n.case_id = r.case_id and n.kind = v_kind
        and (n.read_at is null or n.created_at > now() - interval '3 days')
    ) then
      continue;
    end if;

    insert into public.notifications (recipient_id, case_id, kind, title, body, created_by)
    values (auth.uid(), r.case_id, v_kind, v_title, v_body, null);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.hr_send_case_reminder(uuid) from public;
revoke all on function public.sync_deadline_notifications() from public;
grant execute on function public.hr_send_case_reminder(uuid) to authenticated;
grant execute on function public.sync_deadline_notifications() to authenticated;

-- ----------------------------------------------------------------------------
-- 13. Storage — pliki sprawozdań (ścieżka `<case_id>/<plik>`)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports', 'reports', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "reports_select_auth" on storage.objects;
drop policy if exists "reports_insert_auth" on storage.objects;
drop policy if exists "reports_update_auth" on storage.objects;
drop policy if exists "reports_delete_auth" on storage.objects;
drop policy if exists "reports_select_case" on storage.objects;
drop policy if exists "reports_insert_case" on storage.objects;
drop policy if exists "reports_update_case" on storage.objects;
drop policy if exists "reports_delete_case" on storage.objects;

create policy "reports_select_case" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1]
        and (c.supervisor_id = auth.uid() or c.unit_head_id = auth.uid() or public.current_role() = 'hr')
    )
  );

create policy "reports_insert_case" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1] and c.supervisor_id = auth.uid()
    )
  );

create policy "reports_update_case" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1] and c.supervisor_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1] and c.supervisor_id = auth.uid()
    )
  );

create policy "reports_delete_case" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.evaluation_cases c
      where c.id::text = (storage.foldername(name))[1] and c.supervisor_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 14. Domyślne uprawnienia dla przyszłych tabel + odświeżenie cache API
-- ----------------------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

notify pgrst, 'reload schema';

select 'schema_ok' as check;
