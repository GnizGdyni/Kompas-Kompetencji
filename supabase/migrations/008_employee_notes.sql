-- Uwagi do pracownika (pozytywna / negatywna + data)

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

create index if not exists employee_notes_employee_idx
  on public.employee_notes (employee_id, noted_at desc);

alter table public.employee_notes enable row level security;

drop policy if exists "notes_select" on public.employee_notes;
drop policy if exists "notes_insert" on public.employee_notes;

create policy "notes_select"
  on public.employee_notes for select to authenticated
  using (
    public.current_role() = 'hr'
    or exists (
      select 1 from public.employees e
      where e.id = employee_id and e.created_by = auth.uid()
    )
  );

create policy "notes_insert"
  on public.employee_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.current_role() = 'hr'
      or exists (
        select 1 from public.employees e
        where e.id = employee_id and e.created_by = auth.uid()
      )
    )
  );

grant select, insert on table public.employee_notes to authenticated;
