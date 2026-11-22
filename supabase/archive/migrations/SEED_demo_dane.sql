-- ============================================================
-- Realistyczny zestaw demo — Kompas Kompetencji (pierwsza ocena)
-- Odpal w SQL Editor PO migracjach (employees + kolumny board).
-- Wymaga konta: marek@example.com z rolą supervisor.
-- ============================================================

do $$
declare
  v_supervisor uuid;
  e1 uuid;
  e2 uuid;
  e3 uuid;
  e4 uuid;
begin
  select id into v_supervisor
  from public.profiles
  where email = 'marek@example.com'
  limit 1;

  if v_supervisor is null then
    raise exception 'Brak profilu marek@example.com — utwórz usera i ustaw role=supervisor';
  end if;

  -- wyczyść poprzednie demo tego przełożonego (opcjonalnie)
  delete from public.evaluation_cases
  where supervisor_id = v_supervisor;
  delete from public.employees
  where created_by = v_supervisor;

  -- ---------- Pracownicy (obiekty) ----------
  insert into public.employees (
    id, full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  (
    gen_random_uuid(),
    'Katarzyna Nowak', 'Katarzyna', 'Nowak', 'katarzyna.nowak@mc.gov.pl',
    'Departament Usług Cyfrowych / Wydział Rozwoju e-Usług',
    'Specjalista',
    '2025-03-01', '2026-02-28', v_supervisor
  ) returning id into e1;

  insert into public.employees (
    id, full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  (
    gen_random_uuid(),
    'Piotr Zieliński', 'Piotr', 'Zieliński', 'piotr.zielinski@mc.gov.pl',
    'Departament Cyberbezpieczeństwa / Wydział Analiz',
    'Starszy specjalista',
    '2025-01-15', '2026-01-14', v_supervisor
  ) returning id into e2;

  insert into public.employees (
    id, full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  (
    gen_random_uuid(),
    'Anna Wiśniewska', 'Anna', 'Wiśniewska', 'anna.wisniewska@mc.gov.pl',
    'Departament Danych / Wydział Jakości Danych',
    'Specjalista',
    '2025-06-01', '2026-05-31', v_supervisor
  ) returning id into e3;

  insert into public.employees (
    id, full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  (
    gen_random_uuid(),
    'Michał Kamiński', 'Michał', 'Kamiński', 'michal.kaminski@mc.gov.pl',
    'Departament Usług Cyfrowych / Wydział Integracji',
    'Specjalista',
    '2024-11-01', '2025-10-31', v_supervisor
  ) returning id into e4;

  -- ---------- Sprawy na różnych etapach ----------

  -- 1) Kasia — świeża sprawa, czeka rozmowa wstępna (draft)
  insert into public.evaluation_cases (
    evaluation_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required,
    intro_talk_deadline, report_due_from, report_due_to,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year, intro_checklist
  ) values (
    'first', 'draft', e1, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Usług Cyfrowych / Wydział Rozwoju e-Usług', 'Specjalista',
    'eligible', true, false, false, false,
    'required', true,
    '2025-03-22', '2025-11-01', '2025-11-30',
    '2025-11-30', '2026-01-28', '2025-03-22',
    10, 2025, '{}'::jsonb
  );

  -- 2) Piotr — po rozmowie wstępnej, etap służby/egzaminu
  insert into public.evaluation_cases (
    evaluation_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required,
    intro_talk_at, intro_talk_deadline,
    report_due_from, report_due_to,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year,
    intro_checklist
  ) values (
    'first', 'intro_done', e2, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Cyberbezpieczeństwa / Wydział Analiz', 'Starszy specjalista',
    'eligible', true, false, false, false,
    'required', true,
    '2025-01-28', '2025-02-05',
    '2025-09-15', '2025-10-15',
    '2025-10-15', '2025-12-14', '2025-10-15',
    25, 2025,
    jsonb_build_object(
      'procedure', true,
      'elements', true,
      'expectations', true,
      'jobDesc', true,
      'reportDeadline', true
    )
  );

  -- 3) Anna — czeka na sprawozdanie (termin się zbliża / żółty zależnie od daty systemowej)
  insert into public.evaluation_cases (
    evaluation_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required, exam_result,
    intro_talk_at, intro_talk_deadline,
    report_due_from, report_due_to,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year,
    intro_checklist
  ) values (
    'first', 'awaiting_report', e3, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Danych / Wydział Jakości Danych', 'Specjalista',
    'eligible', true, false, false, false,
    'required', true, 'pass',
    '2025-06-12', '2025-06-22',
    '2026-02-01', '2026-02-28',
    '2026-02-28', '2026-04-30', '2026-02-28',
    45, 2025,
    jsonb_build_object(
      'procedure', true,
      'elements', true,
      'expectations', true,
      'jobDesc', true,
      'reportDeadline', true
    )
  );

  -- 4) Michał — daleko w procesie: po rozmowie oceniającej, przed arkuszem
  insert into public.evaluation_cases (
    evaluation_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required, exam_result,
    intro_talk_at, intro_talk_deadline,
    report_due_from, report_due_to,
    report_submitted_at, report_on_time, report_notes,
    assessment_interview_at,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year,
    intro_checklist
  ) values (
    'first', 'interview_done', e4, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Usług Cyfrowych / Wydział Integracji', 'Specjalista',
    'eligible', true, false, false, false,
    'required', true, 'pass',
    '2024-11-15', '2024-11-22',
    '2025-07-01', '2025-07-31',
    '2025-07-20', true,
    'Sprawozdanie złożone w formie pisemnej; obejmuje zadania z OSP + projekt integracji API mObywatel.',
    '2025-08-05',
    '2025-07-31', '2025-09-30', '2025-09-30',
    85, 2024,
    jsonb_build_object(
      'procedure', true,
      'elements', true,
      'expectations', true,
      'jobDesc', true,
      'reportDeadline', true
    )
  );

  raise notice 'Demo OK: 4 pracowników i 4 sprawy dla %', v_supervisor;
end $$;

-- podgląd
select
  e.last_name,
  e.job_title,
  c.status,
  c.progress_percent,
  c.nearest_deadline,
  c.exam_result
from public.evaluation_cases c
join public.employees e on e.id = c.employee_id
order by c.progress_percent;
