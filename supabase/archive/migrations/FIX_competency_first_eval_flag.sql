-- Flaga: które kompetencje wchodzą do pierwszej oceny (5 podstawowych).
-- Reszta zostaje w bazie pod ocenę okresową / inne ścieżki.

alter table public.competencies
  add column if not exists for_first_evaluation boolean not null default false;

update public.competencies
set for_first_evaluation = (
  code in (
    'rzetelnosc',
    'komunikacja',
    'wiedza',
    'organizacja',
    'wspolpraca'
  )
);
