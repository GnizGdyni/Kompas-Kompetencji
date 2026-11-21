import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  computeDeadlines,
  eligibilityLabel,
  progressForStatus,
  resolveEligibility,
  resolvePrepDefaults,
} from "../lib/firstEvaluation";
import { supabase } from "../lib/supabase";
import { isStaffRole, type PrepServiceStatus } from "../types";

const STEPS = [
  "Dane pracownika",
  "Kwalifikacja",
  "Służba przygotowawcza",
  "Obsada ról",
  "Terminy",
] as const;

export function NewProcessWizardPage() {
  const { loading, user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  const deadlines = useMemo(() => {
    if (!hiredAt) return null;
    return computeDeadlines({
      hiredAt,
      contractEndAt: contractEndAt || null,
      reportFrom: reportFrom || null,
      reportTo: reportTo || null,
    });
  }, [hiredAt, contractEndAt, reportFrom, reportTo]);

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
    if (step === 0) {
      return Boolean(firstName && lastName && orgUnit && jobTitle && hiredAt);
    }
    if (step === 4) {
      return Boolean(deadlines);
    }
    return true;
  }

  function goNext() {
    setError(null);
    if (step === 1 && eligibility === "not_eligible") {
      setError(
        "Według odpowiedzi pracownik nie podlega pierwszej ocenie. Możesz wrócić i poprawić kwalifikację albo anulować.",
      );
    }
    if (step === 1) {
      setPrepStatus(prepDefaults.prepServiceStatus);
      setExamRequired(prepDefaults.examRequired);
    }
    if (step === 4 && hiredAt && !reportFrom && deadlines) {
      setReportFrom(deadlines.reportDueFrom);
      setReportTo(deadlines.reportDueTo);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function createProcess() {
    if (!user || !deadlines || !hiredAt) return;
    if (eligibility === "not_eligible") {
      setError("Nie można utworzyć procesu — pracownik nie podlega pierwszej ocenie.");
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

    const finalDeadlines = computeDeadlines({
      hiredAt,
      contractEndAt: contractEndAt || null,
      reportFrom: reportFrom || deadlines.reportDueFrom,
      reportTo: reportTo || deadlines.reportDueTo,
    });

    const { data: caseRow, error: caseErr } = await supabase
      .from("evaluation_cases")
      .insert({
        evaluation_type: "first",
        status: "draft",
        employee_id: employee.id,
        supervisor_id: user.id,
        unit_head_id: unitHeadSame ? user.id : null,
        office_name: "Ministerstwo Cyfryzacji",
        employee_org_unit: orgUnit.trim(),
        employee_job_title: jobTitle.trim(),
        eligibility_result: eligibility,
        first_time_civil_service: firstTime,
        is_substitute: isSubstitute,
        is_ksap_graduate: isKsap,
        is_higher_position: isHigher,
        prep_service_status: effectivePrep,
        exam_required: effectiveExam,
        intro_talk_deadline: finalDeadlines.introTalkDeadline,
        report_due_from: finalDeadlines.reportDueFrom,
        report_due_to: finalDeadlines.reportDueTo,
        assessment_window_from: finalDeadlines.assessmentWindowFrom,
        assessment_window_to: finalDeadlines.assessmentWindowTo,
        nearest_deadline: finalDeadlines.nearestDeadline,
        progress_percent: progressForStatus("draft"),
        year: new Date(hiredAt).getFullYear(),
      })
      .select("id")
      .single();

    setSaving(false);

    if (caseErr || !caseRow) {
      setError(caseErr?.message || "Nie udało się utworzyć procesu");
      return;
    }

    // unit_headName stored only in UI for MVP if different person without account
    void unitHeadName;

    navigate(`/procesy/${caseRow.id}`);
  }

  return (
    <AppShell title="Kreator: nowy proces pierwszej oceny">
      <div className="wizard">
        <ol className="wizard-steps">
          {STEPS.map((label, i) => (
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

        <div className="panel wizard-panel">
          {step === 0 && (
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
                    required
                  />
                </label>
                <label>
                  <span>Stanowisko *</span>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Data nawiązania stosunku pracy *</span>
                  <input
                    type="date"
                    value={hiredAt}
                    onChange={(e) => setHiredAt(e.target.value)}
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

          {step === 1 && (
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
              <div
                className={`eligibility eligibility-${eligibility}`}
              >
                Wynik: <strong>{eligibilityLabel(eligibility)}</strong>
              </div>
            </>
          )}

          {step === 2 && (
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

          {step === 3 && (
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

          {step === 4 && (
            <>
              <h2>Podsumowanie terminów</h2>
              {!hiredAt ? (
                <div className="alert alert-warn">
                  Uzupełnij datę zatrudnienia w kroku 1.
                </div>
              ) : (
                <>
                  <div className="deadline-grid">
                    <div className="deadline-card">
                      <span>Rozmowa wstępna (do)</span>
                      <strong>{deadlines?.introTalkDeadline}</strong>
                    </div>
                    <div className="deadline-card">
                      <span>Okno sprawozdania</span>
                      <strong>
                        {deadlines?.reportDueFrom} — {deadlines?.reportDueTo}
                      </strong>
                    </div>
                    <div className="deadline-card">
                      <span>Okno oceny (do)</span>
                      <strong>{deadlines?.assessmentWindowTo}</strong>
                    </div>
                  </div>
                  <p className="muted">
                    Możesz doprecyzować okno sprawozdania w dopuszczalnych
                    granicach (po upływie 8 miesięcy od zatrudnienia).
                  </p>
                  <div className="form grid-2">
                    <label>
                      <span>Sprawozdanie od</span>
                      <input
                        type="date"
                        value={reportFrom || deadlines?.reportDueFrom || ""}
                        onChange={(e) => setReportFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>Sprawozdanie do</span>
                      <input
                        type="date"
                        value={reportTo || deadlines?.reportDueTo || ""}
                        onChange={(e) => setReportTo(e.target.value)}
                      />
                    </label>
                  </div>
                </>
              )}
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
              {step < STEPS.length - 1 ? (
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
                  disabled={saving || !canNext() || eligibility === "not_eligible"}
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
