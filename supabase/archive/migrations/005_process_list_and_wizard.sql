-- Rozszerzenie pod listę procesów + kreator pierwszej oceny

-- Pracownik: imię/nazwisko osobno + koniec umowy
alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists contract_end_at date;

update public.employees
set
  first_name = coalesce(first_name, split_part(full_name, ' ', 1)),
  last_name = coalesce(
    last_name,
    nullif(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''),
    full_name
  )
where first_name is null or last_name is null;

-- Kwalifikacja / służba przygotowawcza / terminy na sprawie
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

update public.evaluation_cases
set year = coalesce(year, extract(year from created_at)::int)
where year is null;

create index if not exists evaluation_cases_year_idx on public.evaluation_cases (year);
create index if not exists evaluation_cases_nearest_deadline_idx on public.evaluation_cases (nearest_deadline);
