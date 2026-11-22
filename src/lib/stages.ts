import type { EvaluationCase, EvaluationStatus } from "../types";
import { progressForStatus } from "./firstEvaluation";

/** 3 połączone etapy procesu (zamiast 6 sztucznych kroków). */
export type StageId = 1 | 2 | 3;

export type StageDef = {
  id: StageId;
  title: string;
  short: string;
  description: string;
};

export const STAGES_FIRST: StageDef[] = [
  {
    id: 1,
    title: "Rozmowa wstępna",
    short: "Wstępna",
    description:
      "Zapoznanie z procedurą, elementami oceny, oczekiwaniami i terminem sprawozdania (≤ 21 dni).",
  },
  {
    id: 2,
    title: "Służba przygotowawcza",
    short: "Okres",
    description: "",
  },
  {
    id: 3,
    title: "Rozmowa i arkusz",
    short: "Rozmowa",
    description: "",
  },
];

export const STAGES_PERIODIC: StageDef[] = [
  {
    id: 1,
    title: "Kryteria i termin",
    short: "Kryteria",
    description:
      "Rozmowa o kryteriach (obowiązkowe + max 3 dodatkowe z OSP) i zapoznanie z terminem sporządzenia oceny (cykl 24 mies.).",
  },
  {
    id: 2,
    title: "Okres podlegający ocenie",
    short: "Okres",
    description:
      "Obserwacja w cyklu oceny okresowej. Ustalasz datę rozmowy oceniającej i gdy gotowe — rozpoczynasz arkusz B/C.",
  },
  {
    id: 3,
    title: "Rozmowa i arkusz B/C",
    short: "Rozmowa",
    description: "",
  },
];

/** @deprecated użyj stagesForType — zostawione dla kompatybilności */
export const STAGES = STAGES_FIRST;

export function stagesForType(
  evaluationType: "first" | "periodic" | string,
): StageDef[] {
  return evaluationType === "periodic" ? STAGES_PERIODIC : STAGES_FIRST;
}

/**
 * Mapowanie statusów DB → etap UI
 * draft → 1
 * intro_done | awaiting_report → 2 (okres)
 * in_assessment | interview_done → 3 (rozmowa+arkusz)
 * completed → 3 done
 */
export function activeStageForStatus(
  status: EvaluationStatus,
  _progressPercent = 0,
): StageId {
  switch (status) {
    case "draft":
      return 1;
    case "intro_done":
    case "awaiting_report":
      return 2;
    case "in_assessment":
    case "interview_done":
      return 3;
    case "completed":
      return 3;
    case "cancelled":
      return 1;
  }
}

export function stageState(
  stageId: StageId,
  status: EvaluationStatus,
  progressPercent = 0,
): "done" | "active" | "locked" {
  if (status === "cancelled") {
    return stageId === 1 ? "active" : "locked";
  }
  if (status === "completed") {
    return "done";
  }
  const active = activeStageForStatus(status, progressPercent);
  if (stageId < active) return "done";
  if (stageId === active) return "active";
  return "locked";
}

export type IntroChecklist = {
  procedure: boolean;
  elements: boolean;
  expectations: boolean;
  jobDesc: boolean;
  reportDeadline: boolean;
};

export const EMPTY_INTRO_CHECKLIST: IntroChecklist = {
  procedure: false,
  elements: false,
  expectations: false,
  jobDesc: false,
  reportDeadline: false,
};

export function parseIntroChecklist(raw: unknown): IntroChecklist {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    procedure: Boolean(o.procedure),
    elements: Boolean(o.elements),
    expectations: Boolean(o.expectations),
    jobDesc: Boolean(o.jobDesc),
    reportDeadline: Boolean(o.reportDeadline),
  };
}

export function introChecklistComplete(c: IntroChecklist): boolean {
  return (
    c.procedure &&
    c.elements &&
    c.expectations &&
    c.jobDesc &&
    c.reportDeadline
  );
}

export const SCORE_ELEMENTS = [
  { key: "rzetelnosc", label: "Rzetelność" },
  { key: "wiedza", label: "Wykorzystywanie wiedzy i doskonalenie zawodowe" },
  { key: "organizacja", label: "Organizacja pracy i orientacja na cele" },
  { key: "komunikacja", label: "Komunikacja" },
  { key: "wspolpraca", label: "Współpraca" },
] as const;

export type ScoreKey = (typeof SCORE_ELEMENTS)[number]["key"];
export type PartialScores = Partial<Record<ScoreKey, 3 | 5 | 7>>;

export function parseScores(raw: unknown): PartialScores {
  if (!raw || typeof raw !== "object") return {};
  const out: PartialScores = {};
  for (const { key } of SCORE_ELEMENTS) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === 3 || v === 5 || v === 7) out[key] = v;
  }
  return out;
}

export function averageScore(scores: PartialScores): number | null {
  const vals = SCORE_ELEMENTS.map((e) => scores[e.key]).filter(
    (v): v is 3 | 5 | 7 => v === 3 || v === 5 || v === 7,
  );
  if (vals.length !== SCORE_ELEMENTS.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Najbliższy termin zależny od etapu. */
export function nearestDeadlineForCase(
  c: Pick<
    EvaluationCase,
    | "status"
    | "intro_talk_deadline"
    | "report_due_to"
    | "assessment_window_to"
    | "assessment_interview_at"
    | "prep_service_end_at"
  >,
): string | null {
  switch (c.status) {
    case "draft":
      return c.intro_talk_deadline;
    case "intro_done":
    case "awaiting_report":
      return (
        c.assessment_interview_at ||
        c.report_due_to ||
        c.prep_service_end_at ||
        null
      );
    case "in_assessment":
    case "interview_done":
      return c.assessment_window_to;
    default:
      return null;
  }
}

export { progressForStatus };
