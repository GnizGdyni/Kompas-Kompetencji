-- Usuwanie procesu oceny przez przełożonego (tylko własne sprawy).
-- HR nie usuwa — ma tylko nadzór.
-- Uwagi o pracowniku zostają (case_id → null), powiadomienia znikają kaskadowo.

grant delete on table public.evaluation_cases to authenticated;

drop policy if exists "cases_delete_own_supervisor" on public.evaluation_cases;

create policy "cases_delete_own_supervisor"
  on public.evaluation_cases for delete
  to authenticated
  using (
    supervisor_id = auth.uid()
    and public.current_role() in ('supervisor', 'unit_head')
  );

select 'case_delete_ok' as check;
