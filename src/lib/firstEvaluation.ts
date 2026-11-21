import type { EligibilityResult, EvaluationStatus, PrepServiceStatus } from "../types";

export type QualificationAnswers = {
  firstTimeCivilService: boolean;
  isSubstitute: boolean;
  isKsapGraduate: boolean;
  isHigherPosition: boolean;
};

export function resolveEligibility(
  a: QualificationAnswers,
): EligibilityResult {
  if (a.isSubstitute && !a.firstTimeCivilService) {
    return "eligible_with_consent";
  }
  if (a.firstTimeCivilService) return "eligible";
  return "not_eligible";
}

export function eligibilityLabel(result: EligibilityResult): string {
  switch (result) {
    case "eligible":
      return "Podlega pierwszej ocenie";
    case "not_eligible":
      return "Nie podlega pierwszej ocenie";
    case "eligible_with_consent":
      return "Może podlegać za zgodą stron";
  }
}

export function resolvePrepDefaults(a: QualificationAnswers): {
  prepServiceStatus: PrepServiceStatus;
  examRequired: boolean;
} {
  if (a.isKsapGraduate || a.isHigherPosition) {
    return { prepServiceStatus: "not_applicable", examRequired: false };
  }
  if (a.isSubstitute && !a.firstTimeCivilService) {
    return { prepServiceStatus: "not_applicable", examRequired: false };
  }
  return { prepServiceStatus: "required", examRequired: true };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Terminy wg rozporządzenia / ustawy (uproszczenie MVP). */
export function computeDeadlines(input: {
  hiredAt: string;
  contractEndAt?: string | null;
  reportFrom?: string | null;
  reportTo?: string | null;
}) {
  const introTalkDeadline = addDays(input.hiredAt, 21);

  // Sprawozdanie po min. 8 miesiącach; okres ≥ 7 miesięcy
  const defaultReportFrom = addMonths(input.hiredAt, 8);
  const defaultReportTo = addDays(defaultReportFrom, 30);

  const reportDueFrom = input.reportFrom || defaultReportFrom;
  const reportDueTo = input.reportTo || defaultReportTo;

  // Ocena nie później niż miesiąc przed końcem umowy
  let assessmentWindowTo: string;
  if (input.contractEndAt) {
    assessmentWindowTo = addMonths(input.contractEndAt, -1);
  } else {
    assessmentWindowTo = addMonths(input.hiredAt, 11);
  }

  const assessmentWindowFrom = reportDueTo;

  const nearestDeadline = [
    introTalkDeadline,
    reportDueTo,
    assessmentWindowTo,
  ].sort()[0];

  return {
    introTalkDeadline,
    reportDueFrom,
    reportDueTo,
    assessmentWindowFrom,
    assessmentWindowTo,
    nearestDeadline,
  };
}

export function progressForStatus(status: EvaluationStatus): number {
  const map: Record<EvaluationStatus, number> = {
    draft: 10,
    intro_done: 25,
    awaiting_report: 45,
    in_assessment: 70,
    interview_done: 85,
    completed: 100,
    cancelled: 0,
  };
  return map[status];
}

export type Timeliness = "green" | "yellow" | "red" | "none";

export function timelinessForDeadline(
  nearestDeadline: string | null,
  status: EvaluationStatus,
): Timeliness {
  if (!nearestDeadline || status === "completed" || status === "cancelled") {
    return "none";
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const due = new Date(nearestDeadline + "T12:00:00");
  const diffDays = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "red";
  if (diffDays <= 14) return "yellow";
  return "green";
}

export function timelinessLabel(t: Timeliness): string {
  switch (t) {
    case "green":
      return "W terminie";
    case "yellow":
      return "Zbliża się";
    case "red":
      return "Po terminie";
    case "none":
      return "—";
  }
}
