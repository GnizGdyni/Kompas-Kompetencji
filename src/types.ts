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

export type EvaluationCase = {
  id: string;
  evaluation_type: "first" | "periodic";
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
  assessment_interview_at?: string | null;
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
  draft: "Rozpoczęcie / rozmowa wstępna",
  intro_done: "Po rozmowie wstępnej",
  awaiting_report: "Oczekiwanie na sprawozdanie",
  in_assessment: "Ocena kompetencji",
  interview_done: "Po rozmowie oceniającej",
  completed: "Zakończony",
  cancelled: "Anulowany",
};

export const EVAL_TYPE_LABELS = {
  first: "Pierwsza ocena",
  periodic: "Ocena okresowa",
} as const;

export function isStaffRole(role: string | null | undefined): role is AppRole {
  return role === "supervisor" || role === "hr" || role === "unit_head";
}
