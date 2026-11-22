-- ============================================================
-- Seed demo zgodny z OSP (paczka MC) + arkuszami first / B / C
-- Wymaga: marek@example.com (supervisor)
-- ============================================================

do $$
declare
  v_supervisor uuid;
  e_cyber uuid;
  e_ai uuid;
  e_nacz uuid;
  e_first uuid;
begin
  select id into v_supervisor
  from public.profiles
  where email = 'marek@example.com'
  limit 1;

  if v_supervisor is null then
    raise exception 'Brak profilu marek@example.com';
  end if;

  delete from public.employee_notes
  where author_id = v_supervisor
     or employee_id in (select id from public.employees where created_by = v_supervisor);

  delete from public.evaluation_cases
  where supervisor_id = v_supervisor;

  delete from public.employees
  where created_by = v_supervisor;

  -- 1) Starszy specjalista — OSP DC WZKSOiC 6 → arkusz C
  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values (
    'Katarzyna Nowak', 'Katarzyna', 'Nowak', 'katarzyna.nowak@mc.gov.pl',
    'Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa',
    'starszy specjalista',
    '2024-03-01', null, v_supervisor
  ) returning id into e_cyber;

  -- 2) Radca — OSP DSI WWI 5 → arkusz C
  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values (
    'Piotr Zieliński', 'Piotr', 'Zieliński', 'piotr.zielinski@mc.gov.pl',
    'Departament Rozwoju i Bezpieczeństwa Sztucznej Inteligencji / Wydział Wspierania Innowacyjności',
    'radca',
    '2023-09-01', null, v_supervisor
  ) returning id into e_ai;

  -- 3) Naczelnik — OSP DWM WKAM 1 → arkusz B
  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values (
    'Anna Wiśniewska', 'Anna', 'Wiśniewska', 'anna.wisniewska@mc.gov.pl',
    'Departament Współpracy Międzynarodowej / Wydział Koordynacji Aktywności Międzynarodowych',
    'naczelnik wydziału',
    '2022-01-15', null, v_supervisor
  ) returning id into e_nacz;

  -- 4) Pierwsza ocena — ten sam profil OSP (cyber), umowa terminowa
  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values (
    'Michał Kamiński', 'Michał', 'Kamiński', 'michal.kaminski@mc.gov.pl',
    'Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa',
    'starszy specjalista',
    '2025-09-01', '2026-08-31', v_supervisor
  ) returning id into e_first;

  -- Okresowa C — cyber, draft (rozmowa o kryteriach)
  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    intro_talk_deadline, nearest_deadline,
    cycle_anchor_at, cycle_due_at, next_cycle_due_at,
    assessment_window_from, assessment_window_to,
    progress_percent, year, extra_criteria
  ) values (
    'periodic', 'C', 'draft', e_cyber, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa',
    'starszy specjalista',
    '2026-12-22', '2026-12-22',
    '2024-11-22', '2026-11-22', '2028-11-22',
    '2024-11-22', '2026-11-22',
    10, 2026, '[]'::jsonb
  );

  -- Okresowa C — radca SI, po rozmowie o kryteriach / w ocenie
  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    intro_talk_deadline, criteria_talk_at, nearest_deadline,
    cycle_anchor_at, cycle_due_at, next_cycle_due_at,
    assessment_window_from, assessment_window_to,
    progress_percent, year, extra_criteria
  ) values (
    'periodic', 'C', 'in_assessment', e_ai, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Rozwoju i Bezpieczeństwa Sztucznej Inteligencji / Wydział Wspierania Innowacyjności',
    'radca',
    '2026-10-15', '2026-10-10', '2027-09-01',
    '2025-09-01', '2027-09-01', '2029-09-01',
    '2025-09-01', '2027-09-01',
    40, 2026,
    '["myslenie_analityczne","kreatywnosc"]'::jsonb
  );

  -- Okresowa B — naczelnik (kierowanie ludźmi)
  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    intro_talk_deadline, criteria_talk_at, nearest_deadline,
    cycle_anchor_at, cycle_due_at, next_cycle_due_at,
    assessment_window_from, assessment_window_to,
    progress_percent, year, extra_criteria
  ) values (
    'periodic', 'B', 'in_assessment', e_nacz, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Współpracy Międzynarodowej / Wydział Koordynacji Aktywności Międzynarodowych',
    'naczelnik wydziału',
    '2026-09-01', '2026-08-28', '2027-01-15',
    '2025-01-15', '2027-01-15', '2029-01-15',
    '2025-01-15', '2027-01-15',
    55, 2026,
    '["wiedza","zarzadzanie_strategiczne"]'::jsonb
  );

  -- Pierwsza ocena — świeży start
  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required,
    intro_talk_deadline, report_due_from, report_due_to,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year, intro_checklist, extra_criteria
  ) values (
    'first', 'first', 'draft', e_first, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa',
    'starszy specjalista',
    'eligible', true, false, false, false,
    'required', true,
    '2025-09-22', '2026-05-01', '2026-05-31',
    '2026-05-31', '2026-07-30', '2025-09-22',
    10, 2025, '{}'::jsonb, '[]'::jsonb
  );

  raise notice 'Seed OSP OK dla %', v_supervisor;
end $$;
