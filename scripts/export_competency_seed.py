"""Export all competencies from Excel into SQL seed file."""
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
EXCEL = (
    ROOT.parent
    / "Materialy_uporzadkowane"
    / "04_Model_kompetencji"
    / "01_Model_kompetencji.xlsx"
)
OUT = ROOT / "supabase" / "migrations" / "009_competency_model.sql"
FIX = ROOT / "supabase" / "migrations" / "FIX_competency_model_now.sql"

LEVEL_LABELS = [
    "Znacznie poniżej oczekiwań",
    "Poniżej oczekiwań",
    "Na poziomie oczekiwań",
    "Powyżej oczekiwań",
    "Znacznie powyżej oczekiwań",
]

# sheet name -> code
# Pierwsza ocena: tylko 5 podstawowych (flaga for_first_evaluation)
FIRST_EVAL_CODES = {
    "rzetelnosc",
    "komunikacja",
    "wiedza",
    "organizacja",
    "wspolpraca",
}

COMPETENCIES = [
    ("RZETELNOŚĆ", "rzetelnosc"),
    ("KOMUNIKACJA", "komunikacja"),
    ("WYKORZYSTYWANIE WIEDZY", "wiedza"),
    ("ORGANIZACJA PRACY", "organizacja"),
    ("KREATYWNOŚĆ", "kreatywnosc"),
    ("WSPÓŁPRACA", "wspolpraca"),
    ("MYŚLENIE ANALITYCZNE", "myslenie_analityczne"),
    ("NEGOCJOWANIE", "negocjowanie"),
    ("WYSTĄPIENIA PUBLICZNE", "wystapienia_publiczne"),
    ("ORIENTACJA NA KLIENTA", "orientacja_na_klienta"),
    ("RADZENIE SOBIE W SYTUACJIACH KR", "radzenie_sobie_w_sytuacjach_kryzysowych"),
    ("ZARZĄDZANIE STRATEGICZNE", "zarzadzanie_strategiczne"),
    ("ZARZĄDZANIE LUDŹMI", "zarzadzanie_ludzmi"),
    ("PODEJMOWANIE DECYZJI I ODPOWIED", "podejmowanie_decyzji"),
]


def esc(s: object) -> str:
    if s is None:
        return ""
    return str(s).replace("'", "''").replace("\r\n", "\n").strip()


def main() -> None:
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    lines: list[str] = []
    lines.append("-- Model kompetencji (pełny z Excela) + kolumna odpowiedzi wskaźników")
    lines.append("-- Poziomy: 0 .. max (tu max=4)")
    lines.append("")
    lines.append(
        """
create table if not exists public.competencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order int not null default 0,
  max_level_points int not null default 4,
  for_first_evaluation boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.competencies
  add column if not exists for_first_evaluation boolean not null default false;

create table if not exists public.competency_indicators (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references public.competencies(id) on delete cascade,
  sort_order int not null default 0,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.competency_indicator_levels (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.competency_indicators(id) on delete cascade,
  level_index int not null check (level_index >= 0),
  points int not null check (points >= 0),
  label text not null,
  description text not null,
  unique (indicator_id, level_index)
);

alter table public.evaluation_cases
  add column if not exists indicator_answers jsonb default '{}'::jsonb;

alter table public.competencies enable row level security;
alter table public.competency_indicators enable row level security;
alter table public.competency_indicator_levels enable row level security;

drop policy if exists "competencies_read" on public.competencies;
create policy "competencies_read" on public.competencies
  for select to authenticated using (true);

drop policy if exists "indicators_read" on public.competency_indicators;
create policy "indicators_read" on public.competency_indicators
  for select to authenticated using (true);

drop policy if exists "levels_read" on public.competency_indicator_levels;
create policy "levels_read" on public.competency_indicator_levels
  for select to authenticated using (true);

grant select on public.competencies to authenticated;
grant select on public.competency_indicators to authenticated;
grant select on public.competency_indicator_levels to authenticated;
""".strip()
    )
    lines.append("")
    lines.append(
        "truncate public.competency_indicator_levels, public.competency_indicators, public.competencies restart identity cascade;"
    )
    lines.append("")

    for i, (sheet, code) in enumerate(COMPETENCIES, 1):
        if sheet not in wb.sheetnames:
            raise SystemExit(f"Brak arkusza: {sheet}")
        ws = wb[sheet]
        title = esc(ws.cell(1, 1).value)
        first = "true" if code in FIRST_EVAL_CODES else "false"
        lines.append(
            f"insert into public.competencies (code, name, sort_order, max_level_points, for_first_evaluation) "
            f"values ('{code}', '{title}', {i}, 4, {first});"
        )
        ind_n = 0
        for row in ws.iter_rows(min_row=4, values_only=True):
            if not row[0]:
                continue
            ind_n += 1
            ind_text = esc(row[0])
            lines.append(
                "insert into public.competency_indicators (competency_id, sort_order, title) "
                f"select id, {ind_n}, '{ind_text}' from public.competencies where code = '{code}';"
            )
            for li, (lab, desc) in enumerate(zip(LEVEL_LABELS, row[1:6])):
                lines.append(
                    "insert into public.competency_indicator_levels "
                    "(indicator_id, level_index, points, label, description) "
                    f"select i.id, {li}, {li}, '{esc(lab)}', '{esc(desc)}' "
                    "from public.competency_indicators i "
                    "join public.competencies c on c.id = i.competency_id "
                    f"where c.code = '{code}' and i.sort_order = {ind_n};"
                )
        lines.append("")

    text = "\n".join(lines) + "\n"
    OUT.write_text(text, encoding="utf-8")
    FIX.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT.name} and {FIX.name}")
    print(f"Competencies: {len(COMPETENCIES)}")


if __name__ == "__main__":
    main()
