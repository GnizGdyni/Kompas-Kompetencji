/** Role kont logujących się do aplikacji (bez pracownika). */
export type AppRole = "supervisor" | "hr" | "unit_head";

export type EvaluationStatus =
  | "draft"
  | "intro_done"
  | "awaiting_report"
  | "in_assessment"
  | "interview_done"
  | "completed"
  | "cancelled";

export type EligibilityResult =
  | "eligible"
  | "not_eligible"
  | "eligible_with_consent";

export type PrepServiceStatus = "required" | "exempt" | "not_applicable";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  role: AppRole | string;
  org_unit: string | null;
  job_title: string | null;
  is_unit_head: boolean;
};

export type Employee = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  org_unit: string | null;
  job_title: string | null;
  hired_at: string | null;
  contract_end_at: string | null;
  created_by: string;
  created_at?: string;
};

export type EmployeeNoteTone = "positive" | "negative";

export type EmployeeNote = {
  id: string;
  employee_id: string;
  case_id: string | null;
  author_id: string;
  tone: EmployeeNoteTone;
  subject: string;
  body: string;
  noted_at: string;
  created_at?: string;
};

/** Arkusz: first = pierwsza ocena; B/C = ocena okresowa. */
export type SheetType = "first" | "B" | "C";

export type EvaluationCase = {
  id: string;
  evaluation_type: "first" | "periodic";
  sheet_type?: SheetType | null;
  status: EvaluationStatus;
  employee_id: string;
  supervisor_id: string;
  unit_head_id: string | null;
  office_name: string | null;
  employee_org_unit: string | null;
  employee_job_title: string | null;
  intro_talk_at: string | null;
  report_due_from: string | null;
  report_due_to: string | null;
  assessment_window_from: string | null;
  assessment_window_to: string | null;
  eligibility_result: EligibilityResult | null;
  first_time_civil_service: boolean | null;
  is_substitute: boolean | null;
  is_ksap_graduate: boolean | null;
  is_higher_position: boolean | null;
  prep_service_status: PrepServiceStatus | null;
  exam_required: boolean | null;
  intro_talk_deadline: string | null;
  nearest_deadline: string | null;
  progress_percent: number;
  year: number | null;
  intro_checklist?: Record<string, boolean> | null;
  exam_result?: "pass" | "fail" | "na" | null;
  report_submitted_at?: string | null;
  report_on_time?: boolean | null;
  report_notes?: string | null;
  report_file_path?: string | null;
  report_file_name?: string | null;
  report_file_mime?: string | null;
  report_file_size?: number | null;
  report_file_uploaded_at?: string | null;
  assessment_interview_at?: string | null;
  prep_service_end_at?: string | null;
  interview_notes?: string | null;
  partial_scores?: Record<string, number> | null;
  indicator_answers?: Record<string, number> | null;
  /** Max 3 kody kompetencji dodatkowych (arkusz B/C). */
  extra_criteria?: string[] | null;
  cycle_anchor_at?: string | null;
  cycle_due_at?: string | null;
  next_cycle_due_at?: string | null;
  criteria_talk_at?: string | null;
  verdict?: "positive" | "negative" | null;
  verdict_justification?: string | null;
  development_notes?: string | null;
  created_at?: string;
  employees?: Employee | Employee[] | null;
};

export type ProcessRow = EvaluationCase & {
  employee: Employee;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  supervisor: "Przełożony",
  hr: "HR / Administrator",
  unit_head: "Kierujący komórką",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  supervisor: "#1d4ed8",
  hr: "#7c3aed",
  unit_head: "#c2410c",
};

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  draft: "Rozmowa wstępna",
  intro_done: "Służba przygotowawcza",
  awaiting_report: "Służba przygotowawcza",
  in_assessment: "Rozmowa i arkusz",
  interview_done: "Rozmowa i arkusz",
  completed: "Zakończony",
  cancelled: "Anulowany",
};

export const EVAL_TYPE_LABELS = {
  first: "Pierwsza ocena",
  periodic: "Ocena okresowa",
} as const;

/** Etykieta etapu z uwzględnieniem typu oceny. */
export function statusLabelForCase(
  status: EvaluationStatus,
  evaluationType: "first" | "periodic" | string,
): string {
  if (status === "intro_done" || status === "awaiting_report") {
    return evaluationType === "periodic"
      ? "Okres podlegający ocenie"
      : "Służba przygotowawcza";
  }
  if (status === "draft" && evaluationType === "periodic") {
    return "Kryteria i termin";
  }
  return STATUS_LABELS[status];
}

export function isStaffRole(role: string | null | undefined): role is AppRole {
  return role === "supervisor" || role === "hr" || role === "unit_head";
}

export function isHrRole(role: string | null | undefined): boolean {
  return role === "hr";
}

/** HR: podgląd/nadzór. Przełożony/kierujący: prowadzenie oceny. */
export function canRunEvaluation(role: string | null | undefined): boolean {
  return isStaffRole(role) && !isHrRole(role);
}
