-- Odpal w SQL Editor, jeśli tablica sprawy wywala błąd o brakujących kolumnach

alter table public.evaluation_cases
  add column if not exists intro_checklist jsonb not null default '{}'::jsonb,
  add column if not exists exam_result text,
  add column if not exists report_submitted_at date,
  add column if not exists report_on_time boolean,
  add column if not exists report_notes text,
  add column if not exists assessment_interview_at date;

select 'board_columns_ok' as check;
