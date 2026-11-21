-- Odpal w SQL Editor (kolumny pod połączone etapy)

alter table public.evaluation_cases
  add column if not exists prep_service_end_at date,
  add column if not exists interview_notes text,
  add column if not exists partial_scores jsonb not null default '{}'::jsonb,
  add column if not exists verdict text,
  add column if not exists verdict_justification text,
  add column if not exists development_notes text;

select 'merged_stages_ok' as check;
