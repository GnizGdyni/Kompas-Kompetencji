-- Pola pod tablicę sprawy (etapy 1–3 działające)

alter table public.evaluation_cases
  add column if not exists intro_checklist jsonb not null default '{}'::jsonb,
  add column if not exists exam_result text,
  add column if not exists report_submitted_at date,
  add column if not exists report_on_time boolean,
  add column if not exists report_notes text,
  add column if not exists assessment_interview_at date;

comment on column public.evaluation_cases.exam_result is 'pass | fail | na | null';
comment on column public.evaluation_cases.intro_checklist is 'checklist rozmowy wstępnej (JSON bool)';
