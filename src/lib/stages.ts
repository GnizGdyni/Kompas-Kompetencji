import type { EvaluationCase, EvaluationStatus } from "../types";
import { progressForStatus } from "./firstEvaluation";

export type StageId = 1 | 2 | 3 | 4 | 5 | 6;

export type StageDef = {
  id: StageId;
  title: string;
  short: string;
  description: string;
};

export const STAGES: StageDef[] = [
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
    short: "Służba",
    description:
      "Status służby przygotowawczej oraz wynik egzaminu (jeśli dotyczy).",
  },
  {
    id: 3,
    title: "Sprawozdanie",
    short: "Sprawozdanie",
    description:
      "Złożenie sprawozdania z zadań (okres ≥ 7 miesięcy) w wyznaczonym oknie.",
  },
  {
    id: 4,
    title: "Rozmowa oceniająca",
    short: "Rozmowa",
    description:
      "Omówienie postawy, postępów, relacji, terminowości, egzaminu i sprawozdania.",
  },
  {
    id: 5,
    title: "Ocena na piśmie",
    short: "Arkusz",
    description:
      "Oceny cząstkowe 3/5/7, ocena łączna, uzasadnienie, wnioski rozwojowe, werdykt.",
  },
  {
    id: 6,
    title: "Wniosek do DG",
    short: "Wniosek",
    description:
      "Wniosek kierującego komórką do dyrektora generalnego o dalsze zatrudnienie.",
  },
];

/** Który etap jest aktywny na podstawie statusu sprawy. */
export function activeStageForStatus(
  status: EvaluationStatus,
  progressPercent = 0,
): StageId {
  switch (status) {
    case "draft":
      return 1;
    case "intro_done":
      return 2;
    case "awaiting_report":
      return 3;
    case "in_assessment":
      return 4;
    case "interview_done":
      return 5;
    case "completed":
      // 90 = ocena domknięta, czeka wniosek (etap 6); 100 = całość
      return progressPercent >= 100 ? 6 : 6;
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
  if (status === "completed" && progressPercent >= 100) {
    return "done";
  }
  if (status === "completed" && progressPercent < 100) {
    if (stageId <= 5) return "done";
    return stageId === 6 ? "active" : "locked";
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

/** Najbliższy termin zależny od etapu. */
export function nearestDeadlineForCase(
  c: Pick<
    EvaluationCase,
    | "status"
    | "intro_talk_deadline"
    | "report_due_to"
    | "assessment_window_to"
    | "exam_required"
    | "exam_result"
  >,
): string | null {
  switch (c.status) {
    case "draft":
      return c.intro_talk_deadline;
    case "intro_done":
      if (c.exam_required && !c.exam_result) {
        return c.report_due_to; // egzamin zwykle przed/okolo sprawozdania
      }
      return c.report_due_to;
    case "awaiting_report":
      return c.report_due_to;
    case "in_assessment":
    case "interview_done":
      return c.assessment_window_to;
    default:
      return null;
  }
}

export function statusAfterCompletingStage(
  stageId: StageId,
): EvaluationStatus | null {
  switch (stageId) {
    case 1:
      return "intro_done";
    case 2:
      return "awaiting_report";
    case 3:
      return "in_assessment";
    case 4:
      return "interview_done";
    case 5:
      return "completed"; // MVP: werdykt + domknięcie razem; wniosek = etap 6 done
    case 6:
      return "completed";
    default:
      return null;
  }
}

export { progressForStatus };
