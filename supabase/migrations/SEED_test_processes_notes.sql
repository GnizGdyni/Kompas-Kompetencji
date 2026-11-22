-- ============================================================
-- SEED TEST — procesy + uwagi pod AI
-- Supabase → SQL Editor → wklej CAŁOŚĆ → Run
--
-- WAŻNE: podmienia WSZYSTKIE sprawy/pracowników konta marek@example.com
-- Żeby zadziałało, w wyniku musisz zobaczyć:
--   NOTICE: SEED OK ...
--   oraz tabelę z 4 wierszami (Nowak, Kowalska, Lewandowski, Woźniak)
-- ============================================================

do $$
declare
  v_supervisor uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
  v_notes int;
begin
  select id into v_supervisor
  from public.profiles
  where lower(email) = lower('marek@example.com')
  limit 1;

  if v_supervisor is null then
    raise exception 'Brak profiles dla marek@example.com — zaloguj się tym kontem / ustaw role=supervisor';
  end if;

  -- 1) Uwagi → 2) sprawy → 3) pracownicy (kolejność FK)
  delete from public.employee_notes
  where author_id = v_supervisor
     or employee_id in (select id from public.employees where created_by = v_supervisor);

  delete from public.evaluation_cases
  where supervisor_id = v_supervisor;

  delete from public.employees
  where created_by = v_supervisor;

  -- ---------- Pracownicy ----------
  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  ('Ewa Nowak', 'Ewa', 'Nowak', 'ewa.nowak@test.kompas.local',
   'Departament Usług Cyfrowych / Wydział e-Usług', 'Specjalista',
   current_date - 280, current_date + 85, v_supervisor)
  returning id into e1;

  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  ('Magdalena Kowalska', 'Magdalena', 'Kowalska', 'magdalena.kowalska@test.kompas.local',
   'Departament Cyberbezpieczeństwa / Wydział Analiz', 'Starszy specjalista',
   current_date - 200, current_date + 165, v_supervisor)
  returning id into e2;

  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  ('Tomasz Lewandowski', 'Tomasz', 'Lewandowski', 'tomasz.lewandowski@test.kompas.local',
   'Departament Danych / Wydział Jakości Danych', 'Specjalista',
   current_date - 160, current_date + 200, v_supervisor)
  returning id into e3;

  insert into public.employees (
    full_name, first_name, last_name, email, org_unit, job_title,
    hired_at, contract_end_at, created_by
  ) values
  ('Jakub Woźniak', 'Jakub', 'Woźniak', 'jakub.wozniak@test.kompas.local',
   'Departament Usług Cyfrowych / Wydział Integracji', 'Naczelnik wydziału',
   current_date - 900, null, v_supervisor)
  returning id into e4;

  -- ---------- Procesy ----------
  -- Ewa: pierwsza, in_assessment + sprawozdanie (główny case pod AI)
  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required, exam_result,
    intro_talk_at, intro_talk_deadline,
    report_due_from, report_due_to,
    report_submitted_at, report_on_time, report_notes,
    assessment_interview_at,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year, intro_checklist
  ) values (
    'first', 'first', 'in_assessment', e1, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Usług Cyfrowych / Wydział e-Usług', 'Specjalista',
    'eligible', true, false, false, false,
    'required', true, 'pass',
    current_date - 250, current_date - 259,
    current_date - 40, current_date - 10,
    current_date - 12, true,
    'Sprawozdanie: obsługa zgłoszeń e-usług, aktualizacja procedur, testy regresji formularza, szkolenie z obiegu dokumentów. Problemy z niespójnymi danymi w rejestrze — wyjaśnione z zespołem integracji.',
    current_date,
    current_date - 10, current_date + 50, current_date + 14,
    70, extract(year from current_date)::int,
    '{"procedure":true,"elements":true,"expectations":true,"jobDesc":true,"reportDeadline":true}'::jsonb
  ) returning id into c1;

  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required, exam_result,
    intro_talk_at, intro_talk_deadline,
    report_due_from, report_due_to,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year, intro_checklist
  ) values (
    'first', 'first', 'awaiting_report', e2, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Cyberbezpieczeństwa / Wydział Analiz', 'Starszy specjalista',
    'eligible', true, false, false, false,
    'required', true, 'pass',
    current_date - 180, current_date - 189,
    current_date + 5, current_date + 25,
    current_date + 25, current_date + 85, current_date + 25,
    45, extract(year from current_date)::int,
    '{"procedure":true,"elements":true,"expectations":true,"jobDesc":true,"reportDeadline":true}'::jsonb
  ) returning id into c2;

  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, first_time_civil_service, is_substitute,
    is_ksap_graduate, is_higher_position,
    prep_service_status, exam_required,
    intro_talk_at, intro_talk_deadline,
    report_due_from, report_due_to,
    assessment_window_from, assessment_window_to, nearest_deadline,
    progress_percent, year, intro_checklist
  ) values (
    'first', 'first', 'intro_done', e3, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Danych / Wydział Jakości Danych', 'Specjalista',
    'eligible', true, false, false, false,
    'required', true,
    current_date - 140, current_date - 149,
    current_date + 60, current_date + 90,
    current_date + 90, current_date + 150, current_date + 90,
    25, extract(year from current_date)::int,
    '{"procedure":true,"elements":true,"expectations":true,"jobDesc":true,"reportDeadline":true}'::jsonb
  ) returning id into c3;

  insert into public.evaluation_cases (
    evaluation_type, sheet_type, status, employee_id, supervisor_id, unit_head_id,
    office_name, employee_org_unit, employee_job_title,
    eligibility_result, criteria_talk_at,
    cycle_anchor_at, cycle_due_at, nearest_deadline,
    extra_criteria, assessment_interview_at,
    progress_percent, year
  ) values (
    'periodic', 'B', 'in_assessment', e4, v_supervisor, v_supervisor,
    'Ministerstwo Cyfryzacji',
    'Departament Usług Cyfrowych / Wydział Integracji', 'Naczelnik wydziału',
    'eligible', current_date - 500,
    current_date - 500, current_date + 20, current_date + 20,
    '["kreatywnosc"]'::jsonb, current_date,
    70, extract(year from current_date)::int
  ) returning id into c4;

  -- ---------- Uwagi Ewa (5 kompetencji pierwszej oceny) ----------
  insert into public.employee_notes (employee_id, case_id, author_id, tone, subject, body, noted_at) values
  (e1, c1, v_supervisor, 'positive', 'Rzetelność — kontrola jakości',
   'Przed przekazaniem pakietu procedur e-usług sprawdziła zgodność z checklistą i poprawiła 3 niespójności numeracji załączników. Rezultat nie wymagał korekt merytorycznych.',
   current_date - 55),
  (e1, c1, v_supervisor, 'positive', 'Rzetelność — terminowość',
   'Zadanie „aktualizacja FAQ e-usługi X” oddała w terminie. Dwa dni wcześniej zgłosiła ryzyko opóźnienia po stronie dostawcy i uzgodniła plan B.',
   current_date - 48),
  (e1, c1, v_supervisor, 'negative', 'Rzetelność — pominięta kontrola',
   'W zgłoszeniu do rejestru pominęła wymaganą weryfikację statusu w systemie dziedzinowym; błąd wykryto przy przeglądzie tygodniowym.',
   current_date - 42),
  (e1, c1, v_supervisor, 'positive', 'Wiedza — procedura z bazy wiedzy',
   'Przy nowym wariancie formularza odszukała instrukcję w bazie wiedzy MC, porównała z praktyką zespołu i zaproponowała aktualizację 2 punktów procedury.',
   current_date - 38),
  (e1, c1, v_supervisor, 'positive', 'Organizacja — priorytety',
   'Przy zbiegu trzech zadań ustaliła kolejność według terminu i wpływu na użytkownika, poinformowała zespół i dotrzymała krytycznego terminu testów.',
   current_date - 33),
  (e1, c1, v_supervisor, 'negative', 'Organizacja — brak buforu',
   'Przy zadaniu zależnym od innego wydziału nie zaplanowała buforu; zagrożenie terminu zgłosiła dopiero w dniu oddania.',
   current_date - 29),
  (e1, c1, v_supervisor, 'positive', 'Komunikacja — jasna notatka',
   'Notatka ze spotkania z dostawcą: cel, ustalenia, otwarte kwestie i terminy. Odbiorcy nietechniczni nie dopytywali o sens komunikatu.',
   current_date - 24),
  (e1, c1, v_supervisor, 'negative', 'Komunikacja — niejasny mail',
   'W mailu do wydziału prawnego użyła skrótów systemowych bez wyjaśnienia; odbiorca musiał dopytać o cel i oczekiwane działanie.',
   current_date - 20),
  (e1, c1, v_supervisor, 'positive', 'Współpraca — wsparcie zespołu',
   'Przy awarii formularza przekazała obejście z dokumentacji i checklistę diagnostyczną dwóm kolegom z wydziału.',
   current_date - 15),
  (e1, c1, v_supervisor, 'positive', 'Współpraca — przepływ informacji',
   'Po uzgodnieniach z integracją zaktualizowała kanał zespołu o zmianie mapowania pól API, żeby uniknąć podwójnej pracy przy testach.',
   current_date - 8);

  insert into public.employee_notes (employee_id, case_id, author_id, tone, subject, body, noted_at) values
  (e2, c2, v_supervisor, 'positive', 'Wiedza — analiza zagrożeń',
   'Przy alercie bezpieczeństwa sięgnęła do wytycznych CERT i dobrała właściwą klasyfikację zdarzenia, wskazując źródła oceny.',
   current_date - 40),
  (e2, c2, v_supervisor, 'positive', 'Komunikacja — briefing',
   'Na briefingu oddzieliła fakty od hipotez i wskazała rekomendowane działanie z terminem.',
   current_date - 28),
  (e2, c2, v_supervisor, 'negative', 'Organizacja — przeciążenie',
   'Przyjęła cztery analizy równolegle bez renegocjacji terminów; dwa raporty po deadline.',
   current_date - 18),
  (e2, c2, v_supervisor, 'positive', 'Współpraca — sesja z SOC',
   'Poprowadziła krótką sesję z kolegą z SOC: odpowiedzialności i wnioski w notatce zespołowej.',
   current_date - 10),
  (e2, c2, v_supervisor, 'negative', 'Rzetelność — niekompletny raport',
   'W raporcie zabrakło sekcji „wpływ na usługi”; uzupełniła po uwagach recenzenta.',
   current_date - 6);

  insert into public.employee_notes (employee_id, case_id, author_id, tone, subject, body, noted_at) values
  (e3, c3, v_supervisor, 'positive', 'Współpraca — wdrożenie',
   'Dopytywał o standardy jakości danych i podzielił się podsumowaniem z opiekunem wdrożenia.',
   current_date - 90),
  (e3, c3, v_supervisor, 'positive', 'Wiedza — szkolenie',
   'Po szkoleniu z walidacji zbiorów przygotował notatkę z 5 praktycznymi regułami stosowanymi w komórce.',
   current_date - 70),
  (e3, c3, v_supervisor, 'negative', 'Komunikacja — brak potwierdzenia',
   'Po rozmowie o zakresie nie potwierdził mailowo ustaleń; powstała rozbieżność co do terminu próbki danych.',
   current_date - 50);

  insert into public.employee_notes (employee_id, case_id, author_id, tone, subject, body, noted_at) values
  (e4, c4, v_supervisor, 'positive', 'Zarządzanie ludźmi — priorytety',
   'Na weekly ustalił 3 priorytety sprintu, rozdzielił odpowiedzialności i sprawdził postęp w środku tygodnia.',
   current_date - 60),
  (e4, c4, v_supervisor, 'positive', 'Podejmowanie decyzji — eskalacja',
   'Przy konflikcie terminów API zdecydował o przesunięciu mniej krytycznej funkcji i poinformował interesariuszy tego samego dnia.',
   current_date - 45),
  (e4, c4, v_supervisor, 'negative', 'Zarządzanie — opóźniony feedback',
   'Dwóm pracownikom zaległy feedbacki po projektach (powyżej 3 tygodni).',
   current_date - 30),
  (e4, c4, v_supervisor, 'positive', 'Komunikacja — status dla BDG',
   'Status dla Biura Dyrektora: cel, RAG, ryzyka i decyzje — zwięźle, bez żargonu.',
   current_date - 21),
  (e4, c4, v_supervisor, 'positive', 'Współpraca międzywydziałowa',
   'Warsztat z DSI/DWM o mapowaniu pól; protokół i lista otwartych punktów z ownerami.',
   current_date - 14),
  (e4, c4, v_supervisor, 'negative', 'Organizacja — przeciążenie zespołu',
   'Przyjął zadanie „na wczoraj” bez renegocjacji backlogu; analitycy pracowali po godzinach bez uzgodnienia.',
   current_date - 7);

  select count(*) into v_notes from public.employee_notes where author_id = v_supervisor;
  raise notice 'SEED OK supervisor=% notes=% employees=4 cases=4', v_supervisor, v_notes;

  if v_notes < 20 then
    raise exception 'Seed niekompletny — za mało uwag (%)', v_notes;
  end if;
end $$;

-- MUSISZ zobaczyć 4 wiersze poniżej po udanym Run:
select e.last_name, c.evaluation_type, c.sheet_type, c.status,
       (select count(*) from public.employee_notes n where n.employee_id = e.id) as uwagi
from public.evaluation_cases c
join public.employees e on e.id = c.employee_id
where e.email like '%@test.kompas.local'
order by e.last_name;
