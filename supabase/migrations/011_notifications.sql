-- Powiadomienia in-app (dzwonek): terminy + ręczne przypomnienia HR

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  case_id uuid references public.evaluation_cases (id) on delete cascade,
  kind text not null
    check (kind in ('deadline_yellow', 'deadline_red', 'hr_reminder')),
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

-- Jedno nieprzeczytane powiadomienie danego rodzaju na sprawę
create unique index if not exists notifications_open_unique
  on public.notifications (recipient_id, case_id, kind)
  where read_at is null and case_id is not null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (
    recipient_id = auth.uid()
    or public.current_role() = 'hr'
  );

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Brak bezpośredniego INSERT z klienta — tylko RPC poniżej

grant select, update on table public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- HR: wyślij przypomnienie do przełożonego sprawy
-- ---------------------------------------------------------------------------
create or replace function public.hr_send_case_reminder(p_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.evaluation_cases%rowtype;
  v_emp_name text;
  v_deadline text;
  v_title text;
  v_body text;
  v_id uuid;
  v_timeliness text;
begin
  if public.current_role() is distinct from 'hr' then
    raise exception 'Tylko HR może wysyłać przypomnienia';
  end if;

  select * into v_case
  from public.evaluation_cases
  where id = p_case_id;

  if not found then
    raise exception 'Nie znaleziono sprawy';
  end if;

  if v_case.status in ('completed', 'cancelled') then
    raise exception 'Sprawa jest już zakończona';
  end if;

  if v_case.supervisor_id is null then
    raise exception 'Brak przełożonego przy sprawie';
  end if;

  select coalesce(
    nullif(trim(both from concat_ws(' ', e.first_name, e.last_name)), ''),
    e.full_name,
    'pracownik'
  )
  into v_emp_name
  from public.employees e
  where e.id = v_case.employee_id;

  v_deadline := coalesce(v_case.nearest_deadline::text, 'brak');

  if v_case.nearest_deadline is null then
    v_timeliness := 'brak terminu';
  elsif v_case.nearest_deadline < current_date then
    v_timeliness := 'po terminie';
  elsif v_case.nearest_deadline <= current_date + 14 then
    v_timeliness := 'zbliża się';
  else
    v_timeliness := 'w terminie';
  end if;

  v_title := format('Przypomnienie HR: %s', v_emp_name);
  v_body := format(
    'HR prosi o weryfikację procesu. Najbliższy termin: %s (%s).',
    v_deadline,
    v_timeliness
  );

  -- Oznacz poprzednie nieprzeczytane HR reminder jako przeczytane, żeby wstawić nowe
  update public.notifications
  set read_at = now()
  where recipient_id = v_case.supervisor_id
    and case_id = p_case_id
    and kind = 'hr_reminder'
    and read_at is null;

  insert into public.notifications (
    recipient_id, case_id, kind, title, body, created_by
  ) values (
    v_case.supervisor_id,
    p_case_id,
    'hr_reminder',
    v_title,
    v_body,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.hr_send_case_reminder(uuid) from public;
grant execute on function public.hr_send_case_reminder(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Przełożony: zsynchronizuj powiadomienia o terminach (żółte/czerwone)
-- ---------------------------------------------------------------------------
create or replace function public.sync_deadline_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_kind text;
  v_title text;
  v_body text;
  v_count int := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  for r in
    select
      c.id as case_id,
      c.supervisor_id,
      c.nearest_deadline,
      c.status,
      coalesce(
        nullif(trim(both from concat_ws(' ', e.first_name, e.last_name)), ''),
        e.full_name,
        'pracownik'
      ) as emp_name
    from public.evaluation_cases c
    join public.employees e on e.id = c.employee_id
    where c.supervisor_id = auth.uid()
      and c.status not in ('completed', 'cancelled')
      and c.nearest_deadline is not null
  loop
    if r.nearest_deadline < current_date then
      v_kind := 'deadline_red';
      v_title := format('Po terminie: %s', r.emp_name);
      v_body := format(
        'Termin %s już minął. Wejdź w proces i domknij zaległy etap.',
        r.nearest_deadline::text
      );
    elsif r.nearest_deadline <= current_date + 14 then
      v_kind := 'deadline_yellow';
      v_title := format('Zbliża się termin: %s', r.emp_name);
      v_body := format(
        'Najbliższy termin: %s. Sprawdź status procesu.',
        r.nearest_deadline::text
      );
    else
      continue;
    end if;

    -- jeśli jest już nieprzeczytane tego kind — pomiń
    if exists (
      select 1 from public.notifications n
      where n.recipient_id = auth.uid()
        and n.case_id = r.case_id
        and n.kind = v_kind
        and n.read_at is null
    ) then
      continue;
    end if;

    -- jeśli ostatnie przeczytane tego kind było < 3 dni temu — nie spamuj
    if exists (
      select 1 from public.notifications n
      where n.recipient_id = auth.uid()
        and n.case_id = r.case_id
        and n.kind = v_kind
        and n.read_at is not null
        and n.created_at > now() - interval '3 days'
    ) then
      continue;
    end if;

    insert into public.notifications (
      recipient_id, case_id, kind, title, body, created_by
    ) values (
      auth.uid(), r.case_id, v_kind, v_title, v_body, null
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.sync_deadline_notifications() from public;
grant execute on function public.sync_deadline_notifications() to authenticated;
