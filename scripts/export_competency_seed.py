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
OUT = ROOT / "supabase" / "setup" / "02_seed_competencies.sql"

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
    lines.append(
        """
-- ============================================================================
-- Kompas Kompetencji — model kompetencji (arkusze ocen, wskaźniki, poziomy)
-- Uruchom PO 01_schema.sql.
--
-- Wstawia dane tylko, gdy tabela competencies jest pusta. Ponowne uruchomienie
-- niczego nie psuje (zapisane odpowiedzi w indicator_answers zostają ważne).
-- ============================================================================

do $seed$
begin
  if exists (select 1 from public.competencies) then
    raise notice 'Model kompetencji już jest w bazie — pomijam';
    return;
  end if;
""".strip()
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

    lines.append("end;")
    lines.append("$seed$;")
    lines.append("")
    lines.append("select count(*) as competencies from public.competencies;")

    text = "\n".join(lines) + "\n"
    OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT.name}")
    print(f"Competencies: {len(COMPETENCIES)}")


if __name__ == "__main__":
    main()
