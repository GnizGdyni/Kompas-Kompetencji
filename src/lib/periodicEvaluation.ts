import { addDays, addMonths } from "./firstEvaluation";

/** Wariant arkusza oceny okresowej. */
export type PeriodicSheet = "B" | "C";

/** Kryteria obowiązkowe — arkusz B (kierowanie ludźmi). */
export const SHEET_B_MANDATORY = [
  "zarzadzanie_ludzmi",
  "podejmowanie_decyzji",
  "organizacja",
  "wspolpraca",
  "komunikacja",
] as const;

/** Kryteria obowiązkowe — arkusz C (stanowiska bez zarządzania ludźmi). */
export const SHEET_C_MANDATORY = [
  "wiedza",
  "rzetelnosc",
  "organizacja",
  "wspolpraca",
  "komunikacja",
] as const;

export const PERIODIC_SCORE_VALUES = [1, 3, 5, 7, 9] as const;
export type PeriodicScore = (typeof PERIODIC_SCORE_VALUES)[number];

export function mandatoryCodesForSheet(sheet: PeriodicSheet): string[] {
  return sheet === "B" ? [...SHEET_B_MANDATORY] : [...SHEET_C_MANDATORY];
}

export function sheetLabel(sheet: PeriodicSheet): string {
  return sheet === "B"
    ? "Arkusz B — kierowanie ludźmi"
    : "Arkusz C — bez zarządzania ludźmi";
}

/**
 * Terminy oceny okresowej (MVP wg ustawy/poradnika):
 * - kotwica cyklu = koniec poprzedniej oceny LUB data zatrudnienia na czas nieokreślony
 * - sporządzenie oceny: +24 miesiące od kotwicy
 * - rozmowa o kryteriach: w ciągu 30 dni od rozpoczęcia procesu / kotwicy okresu
 */
export function computePeriodicDeadlines(input: {
  cycleAnchorAt: string;
  processStartedAt?: string | null;
}) {
  const cycleDueAt = addMonths(input.cycleAnchorAt, 24);
  const criteriaTalkDeadline = addDays(
    input.processStartedAt || input.cycleAnchorAt,
    30,
  );
  const assessmentWindowFrom = input.cycleAnchorAt;
  const assessmentWindowTo = cycleDueAt;
  const nearestDeadline = [criteriaTalkDeadline, cycleDueAt].sort()[0];

  return {
    cycleAnchorAt: input.cycleAnchorAt,
    cycleDueAt,
    criteriaTalkDeadline,
    assessmentWindowFrom,
    assessmentWindowTo,
    nearestDeadline,
    /** Termin kolejnego cyklu po domknięciu tej oceny. */
    nextCycleDueAt: addMonths(cycleDueAt, 24),
  };
}

/** Poziom ogólny ze średniej (arkusz B/C). */
export function overallLevelFromAverage(avg: number): {
  label: string;
  band: string;
} {
  if (avg <= 2) {
    return { label: "znacznie poniżej oczekiwań", band: "1–2" };
  }
  if (avg <= 4) {
    return { label: "poniżej oczekiwań", band: "2–4" };
  }
  if (avg <= 6) {
    return { label: "na poziomie oczekiwań", band: "4–6" };
  }
  if (avg <= 8) {
    return { label: "powyżej oczekiwań", band: "6–8" };
  }
  return { label: "znacznie powyżej oczekiwań", band: "8–9" };
}

export function nearestPeriodicScore(avg: number): PeriodicScore {
  let best: PeriodicScore = 5;
  let bestDist = Infinity;
  for (const n of PERIODIC_SCORE_VALUES) {
    const d = Math.abs(n - avg);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export function parseExtraCriteria(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string").slice(0, 3);
}
