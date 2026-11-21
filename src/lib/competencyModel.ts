import {
  mandatoryCodesForSheet,
  nearestPeriodicScore,
  type PeriodicSheet,
} from "./periodicEvaluation";

/** Model kompetencji + mapowanie średniej wskaźników → oceny cząstkowe. */

export type CompetencyLevel = {
  id: string;
  level_index: number;
  points: number;
  label: string;
  description: string;
};

export type CompetencyIndicator = {
  id: string;
  sort_order: number;
  title: string;
  levels: CompetencyLevel[];
};

export type Competency = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  max_level_points: number;
  for_first_evaluation: boolean;
  indicators: CompetencyIndicator[];
};

/** 5 kompetencji podstawowych pierwszej oceny (rozporządzenie). */
export const FIRST_EVALUATION_CODES = [
  "rzetelnosc",
  "komunikacja",
  "wiedza",
  "organizacja",
  "wspolpraca",
] as const;

export type CaseCompetencyContext = {
  evaluationType: "first" | "periodic" | string;
  sheetType?: PeriodicSheet | "first" | null;
  extraCriteria?: string[];
};

export function competenciesForEvaluationType(
  all: Competency[],
  evaluationType: "first" | "periodic" | string,
): Competency[] {
  return competenciesForCase(all, { evaluationType });
}

export function competenciesForCase(
  all: Competency[],
  ctx: CaseCompetencyContext,
): Competency[] {
  if (ctx.evaluationType === "first" || ctx.sheetType === "first") {
    const flagged = all.filter((c) => c.for_first_evaluation);
    if (flagged.length > 0) return flagged;
    const set = new Set<string>(FIRST_EVALUATION_CODES);
    return all.filter((c) => set.has(c.code));
  }

  const sheet: PeriodicSheet =
    ctx.sheetType === "B" || ctx.sheetType === "C" ? ctx.sheetType : "C";
  const mandatory = mandatoryCodesForSheet(sheet);
  const extras = (ctx.extraCriteria ?? []).slice(0, 3);
  const wanted = new Set([...mandatory, ...extras]);
  const order = new Map(
    [...mandatory, ...extras].map((code, i) => [code, i]),
  );

  return all
    .filter((c) => wanted.has(c.code))
    .sort(
      (a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99),
    );
}

/** Odpowiedzi: indicator_id → points. */
export type IndicatorAnswers = Record<string, number>;

/** Oceny cząstkowe: code → punkty (3/5/7 lub 1/3/5/7/9). */
export type PartialScores = Record<string, number>;

export function parseIndicatorAnswers(raw: unknown): IndicatorAnswers {
  if (!raw || typeof raw !== "object") return {};
  const out: IndicatorAnswers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

export function parsePartialScores(raw: unknown): PartialScores {
  if (!raw || typeof raw !== "object") return {};
  const out: PartialScores = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (n === 1 || n === 3 || n === 5 || n === 7 || n === 9) out[k] = n;
  }
  return out;
}

/** Średnia punktów wskaźników w kompetencji (null jeśli niekompletna). */
export function competencyIndicatorAverage(
  competency: Competency,
  answers: IndicatorAnswers,
): number | null {
  if (competency.indicators.length === 0) return null;
  const vals: number[] = [];
  for (const ind of competency.indicators) {
    if (!(ind.id in answers)) return null;
    vals.push(answers[ind.id]);
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Pierwsza ocena: 3 środki skali → 3 / 5 / 7. */
const FIRST_EVAL_LEVEL_POINTS: Record<number, 3 | 5 | 7> = {
  1: 3,
  2: 5,
  3: 7,
};

/** Ocena okresowa: pełne 5 poziomów → 1 / 3 / 5 / 7 / 9. */
const PERIODIC_LEVEL_POINTS: Record<number, 1 | 3 | 5 | 7 | 9> = {
  0: 1,
  1: 3,
  2: 5,
  3: 7,
  4: 9,
};

/**
 * Poziomy do wyboru w UI.
 * Pierwsza ocena: 3 kryteria → 3 / 5 / 7.
 * Okresowa (B/C): 5 poziomów → 1 / 3 / 5 / 7 / 9.
 */
export function levelsForEvaluationType(
  levels: CompetencyLevel[],
  evaluationType: "first" | "periodic" | string,
): CompetencyLevel[] {
  if (evaluationType === "periodic") {
    return levels
      .filter((l) => l.level_index in PERIODIC_LEVEL_POINTS)
      .map((l) => ({
        ...l,
        points: PERIODIC_LEVEL_POINTS[l.level_index],
      }))
      .sort((a, b) => a.level_index - b.level_index);
  }

  return levels
    .filter((l) => l.level_index in FIRST_EVAL_LEVEL_POINTS)
    .map((l) => ({
      ...l,
      points: FIRST_EVAL_LEVEL_POINTS[l.level_index],
    }))
    .sort((a, b) => a.level_index - b.level_index);
}

export function nearestOf357(avg: number): 3 | 5 | 7 {
  const opts = [3, 5, 7] as const;
  let best: 3 | 5 | 7 = 5;
  let bestDist = Infinity;
  for (const n of opts) {
    const d = Math.abs(n - avg);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export function nearestScore357(avg: number, maxPoints: number): 3 | 5 | 7 {
  const max = Math.max(maxPoints, 1);
  const scaled = 3 + (avg / max) * 4;
  return nearestOf357(scaled);
}

export function suggestedScoreForCompetency(
  competency: Competency,
  answers: IndicatorAnswers,
  evaluationType: "first" | "periodic" | string = "first",
): number | null {
  const avg = competencyIndicatorAverage(competency, answers);
  if (avg === null) return null;
  if (evaluationType === "periodic") {
    return nearestPeriodicScore(avg);
  }
  return nearestOf357(avg);
}

export function averagePartialScores(
  competencies: Competency[],
  scores: PartialScores,
): number | null {
  if (competencies.length === 0) return null;
  const vals: number[] = [];
  for (const c of competencies) {
    const v = scores[c.code];
    if (typeof v !== "number") return null;
    vals.push(v);
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function allIndicatorsAnswered(
  competencies: Competency[],
  answers: IndicatorAnswers,
): boolean {
  return competencies.every((c) =>
    c.indicators.every((i) => i.id in answers),
  );
}

/** Kompetencje spoza obowiązkowych — kandydaci na dodatkowe (max 3). */
export function extraCriteriaCandidates(
  all: Competency[],
  sheet: PeriodicSheet,
): Competency[] {
  const mandatory = new Set(mandatoryCodesForSheet(sheet));
  return all.filter((c) => !mandatory.has(c.code));
}

/**
 * Kolor semantyczny oceny w punktach.
 * czerwony = poniżej / negatywne, żółty = na poziomie, zielony = powyżej.
 * Działa dla skali 3/5/7 i 1/3/5/7/9.
 */
export type ScoreTone = "neg" | "mid" | "pos";

export function scoreTone(points: number | null | undefined): ScoreTone | null {
  if (points == null || Number.isNaN(points)) return null;
  if (points <= 3) return "neg";
  if (points <= 5) return "mid";
  return "pos";
}

/** Ton średniej — te same progi co przy ocenie okresowej / pierwszej. */
export function averageTone(avg: number | null): ScoreTone | null {
  if (avg == null) return null;
  if (avg < 4.5) return "neg";
  if (avg < 6) return "mid";
  return "pos";
}
