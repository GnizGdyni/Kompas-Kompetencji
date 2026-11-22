-- Ocena okresowa: arkusz B/C + cykl 24 miesięcy + kryteria dodatkowe

alter table public.evaluation_cases
  add column if not exists sheet_type text;

alter table public.evaluation_cases
  add column if not exists extra_criteria jsonb default '[]'::jsonb;

alter table public.evaluation_cases
  add column if not exists cycle_anchor_at date;

alter table public.evaluation_cases
  add column if not exists cycle_due_at date;

alter table public.evaluation_cases
  add column if not exists next_cycle_due_at date;

alter table public.evaluation_cases
  add column if not exists criteria_talk_at date;

-- Uzupełnij istniejące pierwsze oceny
update public.evaluation_cases
set sheet_type = 'first'
where evaluation_type = 'first'
  and (sheet_type is null or sheet_type = '');

comment on column public.evaluation_cases.sheet_type is
  'first | B | C — wariant arkusza (pierwsza ocena albo okresowa B/C)';

comment on column public.evaluation_cases.cycle_due_at is
  'Termin sporządzenia oceny okresowej: cycle_anchor_at + 24 miesiące';
