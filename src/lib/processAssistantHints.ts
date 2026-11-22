/** Kontekst otwartego procesu + „co teraz” + wyjaśnienia ekranu dla asystenta. */

import { STATUS_LABELS, statusLabelForCase } from "../types";
import type { EvaluationStatus } from "../types";
import { stagesForType, type StageId } from "./stages";

export type OpenProcessContext = {
  caseId: string;
  evaluationType: "first" | "periodic" | string;
  sheetType?: "first" | "B" | "C" | string | null;
  status: EvaluationStatus | string;
  viewStage: StageId;
  activeStage: StageId;
  /** Stanowisko ocenianego (nie przełożonego). */
  employeeJobTitle?: string | null;
  employeeOrgUnit?: string | null;
  employeeDisplayName?: string | null;
  nearestDeadline?: string | null;
  introTalkAt?: string | null;
  reportDueFrom?: string | null;
  reportDueTo?: string | null;
  reportSubmittedAt?: string | null;
  hasReportFile?: boolean;
  hasReportNotes?: boolean;
  notesCount?: number;
  criteriaTalkAt?: string | null;
  cycleDueAt?: string | null;
  verdict?: "positive" | "negative" | "" | null;
  hasJustification?: boolean;
  scoresFilled?: number;
  scoresTotal?: number;
};

export const SCREEN_GLOSSARY = `
WYJAŚNIENIA EKRANU / PROCESU (Kompas — tylko te nazwy, NIE zmyślaj innych menu):
- Nawigacja: topbar „Procesy” (lista) → „Otwórz proces” → karta sprawy z etapami 1–3. Brak osobnego menu „Oceny okresowe” / zakładki pracownika poza kartą procesu.
- Sprawozdanie (pierwsza ocena): etap 2 karty procesu → sekcja „Sprawozdanie” → „Wybierz plik” (PDF/DOC/DOCX) + data złożenia + opcjonalnie „Notatka / opis” → „Zapisz”. Formalne przyjęcie = zapis z datą/plikiem i przejście dalej (brak osobnego „Zatwierdź sprawozdanie” / e-maila do pracownika w tej wersji).
- Status procesu (DB): draft, intro_done, awaiting_report, in_assessment, interview_done, completed, cancelled.
- Etapy UI (1–3): pierwsza = Rozmowa wstępna → Okres/sprawozdanie → Rozmowa i arkusz; okresowa = Kryteria → Okres → Rozmowa i arkusz B/C (w okresowej nie ma osobnego wgrywania sprawozdania jak w pierwszej).
- Arkusz B vs C: B — kierowanie ludźmi; C — pozostałe. Skala pierwsza 3/5/7; okresowa 1–9.
- Uzasadnienie obowiązkowe przy NEGATYWNEJ. HR: podgląd + dzwonek „Przypomnij”; bez prowadzenia oceny.
`.trim();

/** Gdzie wgrać sprawozdanie — treść zgodna z UI (krótka). */
export function reportUploadGuide(ctx?: OpenProcessContext | null): string {
  const openHint =
    ctx && ctx.evaluationType !== "periodic"
      ? ctx.viewStage === 2
        ? "Masz otwarty proces na **etapie 2** — sekcja jest na tej karcie."
        : `Masz otwarty proces (etap ${ctx.viewStage}/3) — przejdź na **etap 2**, tam jest sekcja Sprawozdanie.`
      : ctx?.evaluationType === "periodic"
        ? "W **ocenie okresowej** nie ma osobnego wgrywania sprawozdania pierwszej oceny — materiał zbierasz w uwagach i na etapie arkusza."
        : null;

  const lines = [
    "**Gdzie wgrać sprawozdanie w Kompasie**",
    "",
    "1. **Procesy** → otwórz sprawę (**pierwsza ocena**).",
    "2. Etap **2 — Służba przygotowawcza**.",
    "3. Sekcja **Sprawozdanie** → **Wybierz plik** (PDF/DOC/DOCX).",
    "4. **Data złożenia** (+ opcjonalnie opis) → **Zapisz**.",
    "",
    "_Brak menu „Oceny okresowe” i osobnego „Zatwierdź sprawozdanie” — wystarczy zapis na karcie procesu._",
  ];
  if (openHint) {
    lines.push("", openHint);
  }
  return lines.join("\n");
}

export function buildNextSteps(ctx: OpenProcessContext): string[] {
  const periodic = ctx.evaluationType === "periodic";
  const stage = ctx.viewStage;
  const steps: string[] = [];

  if (ctx.status === "completed") {
    return [
      "Proces jest zakończony — możesz pobrać PDF arkusza i ewentualnie zaplanować kolejny cykl (okresowa: +24 mies.).",
      "Asystent nie powinien sugerować zmiany ocen po zamknięciu procesu.",
    ];
  }

  if (periodic) {
    if (stage === 1) {
      steps.push(
        "Ustal arkusz B albo C zgodnie ze stanowiskiem (kierowanie → B, inaczej → C).",
      );
      steps.push(
        "Omów kryteria obowiązkowe i ewentualnie dodaj max 3 dodatkowe z OSP; wpisz datę rozmowy o kryteriach i termin sporządzenia oceny.",
      );
      steps.push(
        "Zapisz i przejdź dalej dopiero gdy kryteria/termin są ustalone.",
      );
    } else if (stage === 2) {
      steps.push(
        "Prowadź obserwację w okresie oceny; dodawaj uwagi (+/−), gdy zauważysz konkretne zachowania.",
      );
      steps.push(
        "Ustal datę rozmowy oceniającej, gdy okres i materiał (uwagi) na to pozwalają.",
      );
      steps.push("Gdy gotowe — rozpocznij etap rozmowy i arkusza B/C.");
    } else {
      steps.push(
        "Przeprowadź rozmowę oceniającą i uzupełnij wskaźniki/oceny cząstkowe (1–9) na podstawie faktów, nie domysłów.",
      );
      steps.push(
        "Wybierz werdykt; przy negatywnym uzupełnij uzasadnienie (obowiązkowe). Przy pozytywnym możesz dodać wnioski rozwojowe.",
      );
      steps.push(
        "Zapisz roboczo, pobierz PDF w razie potrzeby, potem zakończ ocenę i proces.",
      );
    }
  } else if (stage === 1) {
    steps.push(
      "Przeprowadź rozmowę wstępną: procedura, 5 elementów oceny, oczekiwania, obowiązki z OSP.",
    );
    steps.push(
      "Uzupełnij checklistę i datę rozmowy; wyznacz termin sprawozdania (okno od–do).",
    );
    steps.push("Zapisz i przejdź do etapu okresu / służby przygotowawczej.");
  } else if (stage === 2) {
    steps.push(
      "Monitoruj okres (służba przygotowawcza / egzamin, jeśli dotyczy) i zbieraj uwagi o pracowniku.",
    );
    if (!ctx.hasReportFile && !ctx.hasReportNotes && !ctx.reportSubmittedAt) {
      steps.push(
        "Po złożeniu sprawozdania: oznacz datę, terminowość i dołącz plik lub opis.",
      );
    } else {
      steps.push(
        "Sprawozdanie jest już odnotowane — sprawdź kompletność przed rozmową oceniającą.",
      );
    }
    steps.push("Gdy materiał jest gotowy — rozpocznij rozmowę i arkusz.");
  } else {
    steps.push(
      "Przeprowadź rozmowę oceniającą; uzupełnij arkusz (wskaźniki → 3/5/7) na podstawie uwag i sprawozdania.",
    );
    steps.push(
      "Wybierz werdykt; przy negatywnym uzasadnienie jest obowiązkowe. Przy pozytywnym możesz dodać wnioski rozwojowe (Podpowiedź AI).",
    );
    steps.push("Zapisz roboczo → PDF → zakończ ocenę i proces.");
  }

  return steps.slice(0, 3);
}

export function formatOpenProcessBlock(ctx: OpenProcessContext | null): string {
  if (!ctx) {
    return "Brak otwartego procesu — odpowiadaj ogólnie o przepisach i procesie w Kompasie.";
  }

  const stages = stagesForType(ctx.evaluationType);
  const stageTitle =
    stages.find((s) => s.id === ctx.viewStage)?.title ||
    `Etap ${ctx.viewStage}`;
  const statusLabel =
    statusLabelForCase(
      ctx.status as EvaluationStatus,
      ctx.evaluationType,
    ) ||
    STATUS_LABELS[ctx.status as EvaluationStatus] ||
    String(ctx.status);

  const next = buildNextSteps(ctx);

  return [
    "OTWARTY PROCES (zanonimizowany — bez nazwiska w odpowiedziach):",
    `- Typ: ${ctx.evaluationType === "periodic" ? "ocena okresowa" : "pierwsza ocena"}`,
    ctx.sheetType && ctx.sheetType !== "first"
      ? `- Arkusz: ${ctx.sheetType}`
      : null,
    `- Status: ${statusLabel} (${ctx.status})`,
    `- Etap UI: ${ctx.viewStage}/3 — ${stageTitle} (aktywny procesowo: ${ctx.activeStage})`,
    // Stanowisko/komórka tylko do dopasowania B/C/OSP — nie cytować w odpowiedzi
    ctx.employeeJobTitle
      ? `- (wewn.) typ stanowiska ocenianego: ${ctx.employeeJobTitle} — NIE powtarzaj w odpowiedzi`
      : null,
    `- Najbliższy termin: ${ctx.nearestDeadline || "—"}`,
    ctx.evaluationType === "periodic"
      ? `- Rozmowa o kryteriach: ${ctx.criteriaTalkAt || "brak"}; termin cyklu: ${ctx.cycleDueAt || "—"}`
      : `- Rozmowa wstępna: ${ctx.introTalkAt || "brak"}; sprawozdanie do: ${ctx.reportDueFrom || "—"} – ${ctx.reportDueTo || "—"}`,
    `- Sprawozdanie: data=${ctx.reportSubmittedAt || "brak"}; plik=${ctx.hasReportFile ? "tak" : "nie"}; opis=${ctx.hasReportNotes ? "tak" : "nie"}`,
    `- Uwagi o pracowniku: ${ctx.notesCount ?? 0}`,
    ctx.scoresTotal
      ? `- Arkusz: uzupełniono ${ctx.scoresFilled ?? 0}/${ctx.scoresTotal} kompetencji`
      : null,
    ctx.verdict ? `- Werdykt (roboczy/zapisany): ${ctx.verdict}` : null,
    ctx.hasJustification != null
      ? `- Uzasadnienie wpisane: ${ctx.hasJustification ? "tak" : "nie"}`
      : null,
    "",
    "SUGEROWANE KROKI NA BIEŻĄCYM ETAPIE (możesz je streścić użytkownikowi):",
    ...next.map((s, i) => `${i + 1}. ${s}`),
  ]
    .filter((line) => line != null && line !== "")
    .join("\n");
}

export const INTERVIEW_SHEET_GUIDANCE = `
POMOC PRZY ROZMOWIE / ARKUSZU (zasady):
- Nie przyznawaj ocen za przełożonego i nie „ustalaj” werdyktu — tylko wskazówki.
- Odwołuj się do faktów (uwagi, sprawozdanie, OSP), nie domysłów.
- Rozmowa: pytania otwarte o obowiązki, przykłady zachowań, potrzeby wsparcia.
- Arkusz: najpierw wskaźniki/małe pytania, potem ocena cząstkowa kompetencji; spójność z faktami.
- Przy słabszych obszarach: ogólnie wskaż, nad czym warto popracować (bez wymyślania szkoleń, jeśli użytkownik nie prosi).
`.trim();
