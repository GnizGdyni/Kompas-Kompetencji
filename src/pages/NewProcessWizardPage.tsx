import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  addMonths,
  computeDeadlines,
  eligibilityLabel,
  progressForStatus,
  resolveEligibility,
  resolvePrepDefaults,
} from "../lib/firstEvaluation";
import {
  computePeriodicDeadlines,
  sheetLabel,
  type PeriodicSheet,
} from "../lib/periodicEvaluation";
import { OSP_JOB_TITLES } from "../lib/ospPositions";
import { supabase } from "../lib/supabase";
import { isStaffRole, type PrepServiceStatus } from "../types";

type EvalKind = "first" | "periodic";

const STEPS_FIRST = [
  "Typ oceny",
  "Dane pracownika",
  "Kwalifikacja",
  "Służba przygotowawcza",
  "Obsada ról",
] as const;

const STEPS_PERIODIC = [
  "Typ oceny",
  "Dane pracownika",
  "Arkusz i cykl",
  "Obsada ról",
] as const;

export function NewProcessWizardPage() {
  const { loading, user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [evalKind, setEvalKind] = useState<EvalKind>("first");
  const [sheet, setSheet] = useState<PeriodicSheet>("C");
  const [cycleAnchorAt, setCycleAnchorAt] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hiredAt, setHiredAt] = useState("");
  const [contractEndAt, setContractEndAt] = useState("");

  const [firstTime, setFirstTime] = useState(true);
  const [isSubstitute, setIsSubstitute] = useState(false);
  const [isKsap, setIsKsap] = useState(false);
  const [isHigher, setIsHigher] = useState(false);

  const eligibility = useMemo(
    () =>
      resolveEligibility({
        firstTimeCivilService: firstTime,
        isSubstitute,
        isKsapGraduate: isKsap,
        isHigherPosition: isHigher,
      }),
    [firstTime, isSubstitute, isKsap, isHigher],
  );

  const prepDefaults = useMemo(
    () =>
      resolvePrepDefaults({
        firstTimeCivilService: firstTime,
        isSubstitute,
        isKsapGraduate: isKsap,
        isHigherPosition: isHigher,
      }),
    [firstTime, isSubstitute, isKsap, isHigher],
  );

  const [prepStatus, setPrepStatus] = useState<PrepServiceStatus | null>(null);
  const [examRequired, setExamRequired] = useState<boolean | null>(null);

  const effectivePrep = prepStatus ?? prepDefaults.prepServiceStatus;
  const effectiveExam = examRequired ?? prepDefaults.examRequired;

  const [unitHeadName, setUnitHeadName] = useState("");
  const [unitHeadSame, setUnitHeadSame] = useState(true);

  const steps = evalKind === "first" ? STEPS_FIRST : STEPS_PERIODIC;

  const firstDeadlines = useMemo(() => {
    if (!hiredAt) return null;
    return computeDeadlines({
      hiredAt,
      contractEndAt: contractEndAt || null,
      reportFrom: null,
      reportTo: null,
    });
  }, [hiredAt, contractEndAt]);

  const periodicDeadlines = useMemo(() => {
    const anchor = cycleAnchorAt || hiredAt;
    if (!anchor) return null;
    return computePeriodicDeadlines({
      cycleAnchorAt: anchor,
      processStartedAt: new Date().toISOString().slice(0, 10),
    });
  }, [cycleAnchorAt, hiredAt]);

  if (loading) {
    return (
      <div className="page">
        <div className="panel">Ładowanie…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role && !isStaffRole(profile.role)) {
    return <Navigate to="/login" replace />;
  }

  function canNext(): boolean {
    if (step === 0) return true;
    if (step === 1) {
      return Boolean(firstName && lastName && orgUnit && jobTitle && hiredAt);
    }
    if (evalKind === "first") {
      if (step === steps.length - 1) return Boolean(firstDeadlines);
      return true;
    }
    // periodic
    if (step === 2) return Boolean(periodicDeadlines);
    if (step === steps.length - 1) return Boolean(periodicDeadlines);
    return true;
  }

  function goNext() {
    setError(null);
    if (evalKind === "first" && step === 2) {
      if (eligibility === "not_eligible") {
        setError(
          "Według odpowiedzi pracownik nie podlega pierwszej ocenie. Możesz wrócić i poprawić kwalifikację albo anulować.",
        );
      }
      setPrepStatus(prepDefaults.prepServiceStatus);
      setExamRequired(prepDefaults.examRequired);
    }
    if (evalKind === "periodic" && step === 1 && hiredAt && !cycleAnchorAt) {
      setCycleAnchorAt(hiredAt);
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function createProcess() {
    if (!user || !hiredAt) return;

    if (evalKind === "first") {
      if (!firstDeadlines) return;
      if (eligibility === "not_eligible") {
        setError(
          "Nie można utworzyć procesu — pracownik nie podlega pierwszej ocenie.",
        );
        return;
      }
    } else if (!periodicDeadlines) {
      return;
    }

    setSaving(true);
    setError(null);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    const { data: employee, error: empErr } = await supabase
      .from("employees")
      .insert({
        full_name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        org_unit: orgUnit.trim(),
        job_title: jobTitle.trim(),
        hired_at: hiredAt,
        contract_end_at: contractEndAt || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (empErr || !employee) {
      setSaving(false);
      setError(empErr?.message || "Nie udało się zapisać pracownika");
      return;
    }

    const base = {
      employee_id: employee.id,
      supervisor_id: user.id,
      unit_head_id: unitHeadSame ? user.id : null,
      office_name: "Ministerstwo Cyfryzacji",
      employee_org_unit: orgUnit.trim(),
      employee_job_title: jobTitle.trim(),
      status: "draft" as const,
      progress_percent: progressForStatus("draft"),
      year: new Date(hiredAt).getFullYear(),
    };

    const payload =
      evalKind === "first"
        ? {
            ...base,
            evaluation_type: "first" as const,
            sheet_type: "first" as const,
            eligibility_result: eligibility,
            first_time_civil_service: firstTime,
            is_substitute: isSubstitute,
            is_ksap_graduate: isKsap,
            is_higher_position: isHigher,
            prep_service_status: effectivePrep,
            exam_required: effectiveExam,
            prep_service_end_at:
              effectivePrep === "required" ? addMonths(hiredAt, 8) : null,
            intro_talk_deadline: firstDeadlines!.introTalkDeadline,
            report_due_from: firstDeadlines!.reportDueFrom,
            report_due_to: firstDeadlines!.reportDueTo,
            assessment_window_from: firstDeadlines!.assessmentWindowFrom,
            assessment_window_to: firstDeadlines!.assessmentWindowTo,
            nearest_deadline: firstDeadlines!.nearestDeadline,
            extra_criteria: [],
          }
        : {
            ...base,
            evaluation_type: "periodic" as const,
            sheet_type: sheet,
            eligibility_result: null,
            first_time_civil_service: null,
            is_substitute: null,
            is_ksap_graduate: null,
            is_higher_position: null,
            prep_service_status: null,
            exam_required: false,
            intro_talk_deadline: periodicDeadlines!.criteriaTalkDeadline,
            report_due_from: null,
            report_due_to: null,
            assessment_window_from: periodicDeadlines!.assessmentWindowFrom,
            assessment_window_to: periodicDeadlines!.assessmentWindowTo,
            nearest_deadline: periodicDeadlines!.nearestDeadline,
            cycle_anchor_at: periodicDeadlines!.cycleAnchorAt,
            cycle_due_at: periodicDeadlines!.cycleDueAt,
            next_cycle_due_at: periodicDeadlines!.nextCycleDueAt,
            extra_criteria: [],
          };

    const { data: caseRow, error: caseErr } = await supabase
      .from("evaluation_cases")
      .insert(payload as Record<string, unknown>)
      .select("id")
      .single();

    setSaving(false);

    if (caseErr || !caseRow) {
      setError(caseErr?.message || "Nie udało się utworzyć procesu");
      return;
    }

    void unitHeadName;
    navigate(`/procesy/${caseRow.id}`);
  }

  return (
    <AppShell title="Nowy proces">
      <div className="wizard">
        <ol
          className="wizard-steps"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((label, i) => (
            <li
              key={label}
              className={
                i === step ? "active" : i < step ? "done" : undefined
              }
            >
              <span className="step-num">{i + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="wizard-panel">
          {step === 0 && (
            <>
              <h2>Typ oceny</h2>
              <p className="muted">
                Pierwsza ocena (arkusz A) albo ocena okresowa (arkusz B/C, cykl
                24 miesięcy).
              </p>
              <div className="actions" style={{ marginTop: "0.75rem" }}>
                <label className="check">
                  <input
                    type="radio"
                    name="evalKind"
                    checked={evalKind === "first"}
                    onChange={() => {
                      setEvalKind("first");
                      setStep(0);
                    }}
                  />
                  <span>Pierwsza ocena (arkusz A)</span>
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="evalKind"
                    checked={evalKind === "periodic"}
                    onChange={() => {
                      setEvalKind("periodic");
                      setStep(0);
                    }}
                  />
                  <span>Ocena okresowa (arkusz B lub C)</span>
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2>Dane pracownika</h2>
              <div className="form grid-2">
                <label>
                  <span>Imię *</span>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Nazwisko *</span>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Komórka organizacyjna *</span>
                  <input
                    value={orgUnit}
                    onChange={(e) => setOrgUnit(e.target.value)}
                    placeholder="np. departament / wydział"
                    required
                  />
                </label>
                <label>
                  <span>Stanowisko *</span>
                  <input
                    list="osp-job-titles"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Wybierz z listy OSP lub wpisz…"
                    required
                  />
                  <datalist id="osp-job-titles">
                    {OSP_JOB_TITLES.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Data nawiązania stosunku pracy *</span>
                  <input
                    type="date"
                    value={hiredAt}
                    onChange={(e) => {
                      setHiredAt(e.target.value);
                      if (!cycleAnchorAt) setCycleAnchorAt(e.target.value);
                    }}
                    required
                  />
                </label>
                <label>
                  <span>Data końca umowy</span>
                  <input
                    type="date"
                    value={contractEndAt}
                    onChange={(e) => setContractEndAt(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}

          {evalKind === "first" && step === 2 && (
            <>
              <h2>Kwalifikacja do pierwszej oceny</h2>
              <div className="form">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={firstTime}
                    onChange={(e) => setFirstTime(e.target.checked)}
                  />
                  <span>Pierwszy raz w służbie cywilnej</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={isSubstitute}
                    onChange={(e) => setIsSubstitute(e.target.checked)}
                  />
                  <span>Zatrudniony w celu zastępstwa</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={isKsap}
                    onChange={(e) => setIsKsap(e.target.checked)}
                  />
                  <span>Absolwent KSAP</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={isHigher}
                    onChange={(e) => setIsHigher(e.target.checked)}
                  />
                  <span>Wyższe stanowisko w służbie cywilnej</span>
                </label>
              </div>
              <div className={`eligibility eligibility-${eligibility}`}>
                Wynik: <strong>{eligibilityLabel(eligibility)}</strong>
              </div>
            </>
          )}

          {evalKind === "first" && step === 3 && (
            <>
              <h2>Służba przygotowawcza</h2>
              <div className="form">
                <label>
                  <span>Status służby przygotowawczej</span>
                  <select
                    value={effectivePrep}
                    onChange={(e) =>
                      setPrepStatus(e.target.value as PrepServiceStatus)
                    }
                  >
                    <option value="required">Podlega</option>
                    <option value="exempt">Zwolniony</option>
                    <option value="not_applicable">Nie dotyczy</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={effectiveExam}
                    onChange={(e) => setExamRequired(e.target.checked)}
                  />
                  <span>Podlega egzaminowi ze służby przygotowawczej</span>
                </label>
              </div>
            </>
          )}

          {evalKind === "periodic" && step === 2 && (
            <>
              <h2>Arkusz B/C i cykl 24 miesięcy</h2>
              <p className="muted">
                Termin sporządzenia oceny = kotwica cyklu + 24 miesiące. Kotwica
                to data zakończenia poprzedniej oceny albo data zatrudnienia na
                czas nieokreślony.
              </p>
              <div className="form">
                <div className="actions" style={{ marginTop: 0 }}>
                  <label className="check">
                    <input
                      type="radio"
                      name="sheet"
                      checked={sheet === "B"}
                      onChange={() => setSheet("B")}
                    />
                    <span>{sheetLabel("B")}</span>
                  </label>
                  <label className="check">
                    <input
                      type="radio"
                      name="sheet"
                      checked={sheet === "C"}
                      onChange={() => setSheet("C")}
                    />
                    <span>{sheetLabel("C")}</span>
                  </label>
                </div>
                <label>
                  <span>Kotwica cyklu *</span>
                  <input
                    type="date"
                    value={cycleAnchorAt || hiredAt}
                    onChange={(e) => setCycleAnchorAt(e.target.value)}
                  />
                </label>
                {periodicDeadlines ? (
                  <div className="deadline-grid">
                    <div className="deadline-card">
                      <span>Rozmowa o kryteriach (do)</span>
                      <strong>{periodicDeadlines.criteriaTalkDeadline}</strong>
                    </div>
                    <div className="deadline-card">
                      <span>Sporządzenie oceny (cykl)</span>
                      <strong>{periodicDeadlines.cycleDueAt}</strong>
                    </div>
                    <div className="deadline-card">
                      <span>Kolejny cykl (po tej ocenie)</span>
                      <strong>{periodicDeadlines.nextCycleDueAt}</strong>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}

          {((evalKind === "first" && step === 4) ||
            (evalKind === "periodic" && step === 3)) && (
            <>
              <h2>Obsada ról</h2>
              <div className="form">
                <label>
                  <span>Bezpośredni przełożony</span>
                  <input
                    value={
                      profile?.full_name ||
                      profile?.email ||
                      user.email ||
                      ""
                    }
                    disabled
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={unitHeadSame}
                    onChange={(e) => setUnitHeadSame(e.target.checked)}
                  />
                  <span>
                    Kierujący komórką = ten sam przełożony (zalogowany)
                  </span>
                </label>
                {!unitHeadSame ? (
                  <label>
                    <span>Kierujący komórką organizacyjną (opis)</span>
                    <input
                      value={unitHeadName}
                      onChange={(e) => setUnitHeadName(e.target.value)}
                      placeholder="Imię i nazwisko"
                    />
                  </label>
                ) : null}
              </div>
            </>
          )}

          {error ? <div className="alert alert-error">{error}</div> : null}

          <div className="wizard-nav">
            <Link className="btn btn-ghost" to="/dashboard">
              Anuluj
            </Link>
            <div className="actions">
              {step > 0 ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                >
                  Wstecz
                </button>
              ) : null}
              {step < steps.length - 1 ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!canNext()}
                  onClick={goNext}
                >
                  Dalej
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={
                    saving ||
                    !canNext() ||
                    (evalKind === "first" && eligibility === "not_eligible")
                  }
                  onClick={() => void createProcess()}
                >
                  {saving ? "Tworzenie…" : "Utwórz proces"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
