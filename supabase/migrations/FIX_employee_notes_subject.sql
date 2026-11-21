-- Temat uwagi

alter table public.employee_notes
  add column if not exists subject text;

update public.employee_notes
set subject = coalesce(nullif(trim(subject), ''), left(body, 80))
where subject is null or trim(subject) = '';

alter table public.employee_notes
  alter column subject set default '';

alter table public.employee_notes
  alter column subject set not null;
