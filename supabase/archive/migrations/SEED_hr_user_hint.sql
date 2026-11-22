-- Ustaw rolę HR dla istniejącego użytkownika Auth (po utworzeniu konta w Dashboard → Authentication)
-- Podmień email na właściwy.

-- update public.profiles
-- set role = 'hr',
--     full_name = 'Anna HR',
--     org_unit = 'Biuro Dyrektora Generalnego',
--     job_title = 'Specjalista HR'
-- where email = 'hr@example.com';

select 'Ustaw role=hr w profiles dla konta HR' as hint;
