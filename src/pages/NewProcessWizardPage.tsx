import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  addMonths,
  computeDeadlines,
  eligibilityLabel,
  needsAgreementQuestion,
  progressForStatus,
  qualificationComplete,
  qualificationToFlags,
  resolveEligibility,
  resolvePrepDefaults,
  shouldShowPrepStep,
  type QualificationAnswers,
  type QualificationPath,
} from "../lib/firstEvaluation";
import {
  computePeriodicDeadlines,
  sheetLabel,
  type PeriodicSheet,
} from "../lib/periodicEvaluation";
import {
  findOspPreset,
  findOspPresetByJobAndUnit,
  OSP_PRESETS,
} from "../lib/ospPositions";
import { supabase } from "../lib/supabase";
import {
  canRunEvaluation,
  isStaffRole,
  type PrepServiceStatus,
} from "../types";

type EvalKind = "first" | "periodic";

const STEPS_PERIODIC = [
  "Dane pracownika",
  "Rodzaj oceny",
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
  const [ospPresetId, setOspPresetId] = useState("");
  const [sheetSourcesOpen, setSheetSourcesOpen] = useState(false);
  const [hiredAt, setHiredAt] = useState("");
  const [contractEndAt, setContractEndAt] = useState("");

  const [qualPath, setQualPath] = useState<QualificationPath>("first_time");
  const [ksapExemptionRequested, setKsapExemptionRequested] = useState<
    boolean | null
  >(null);
  const [agreementConcluded, setAgreementConcluded] = useState<boolean | null>(
    null,
  );

  const qualAnswers: QualificationAnswers = useMemo(
    () => ({
      path: qualPath,
      ksapExemptionRequested,
      agreementConcluded,
    }),
    [qualPath, ksapExemptionRequested, agreementConcluded],
  );

  const eligibility = useMemo(
    () => resolveEligibility(qualAnswers),
    [qualAnswers],
  );

  const prepDefaults = useMemo(
    () => resolvePrepDefaults(qualAnswers),
    [qualAnswers],
  );

  const showPrepStep =
    evalKind === "first" && shouldShowPrepStep(qualAnswers);

  const [prepStatus, setPrepStatus] = useState<PrepServiceStatus | null>(null);
  const [examRequired, setExamRequired] = useState<boolean | null>(null);

  const effectivePrep = prepStatus ?? prepDefaults.prepServiceStatus;
  const effectiveExam = examRequired ?? prepDefaults.examRequired;

  const [unitHeadName, setUnitHeadName] = useState("");
  const [unitHeadSame, setUnitHeadSame] = useState(true);

  const steps = useMemo(() => {
    if (evalKind === "periodic") return [...STEPS_PERIODIC];
    if (showPrepStep) {
      return [
        "Dane pracownika",
        "Rodzaj oceny",
        "Kwalifikacja",
        "Służba przygotowawcza",
        "Obsada ról",
      ];
    }
    return ["Dane pracownika", "Rodzaj oceny", "Kwalifikacja", "Obsada ról"];
  }, [evalKind, showPrepStep]);

  function setQualificationPath(path: QualificationPath) {
    setQualPath(path);
    setKsapExemptionRequested(null);
    setAgreementConcluded(null);
    setPrepStatus(null);
    setExamRequired(null);
  }

  useEffect(() => {
    setStep((s) => Math.min(s, Math.max(0, steps.length - 1)));
  }, [steps.length]);

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

  const sheetOsp = useMemo(
    () =>
      findOspPreset(ospPresetId) ||
      findOspPresetByJobAndUnit(jobTitle, orgUnit),
    [ospPresetId, jobTitle, orgUnit],
  );

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
  if (!canRunEvaluation(profile?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  function canNext(): boolean {
    if (step === 0) {
      return Boolean(
        firstName &&
          lastName &&
          ospPresetId &&
          orgUnit &&
          jobTitle &&
          hiredAt,
      );
    }
    if (step === 1) {
      if (evalKind === "periodic") return Boolean(periodicDeadlines);
      return true;
    }
    if (evalKind === "first") {
      if (step === 2) return qualificationComplete(qualAnswers);
      if (step === steps.length - 1) return Boolean(firstDeadlines);
      return true;
    }
    if (step === steps.length - 1) return Boolean(periodicDeadlines);
    return true;
  }

  function goNext() {
    setError(null);
    if (step === 0) {
      if (hiredAt && !cycleAnchorAt) setCycleAnchorAt(hiredAt);
      if (sheetOsp) setSheet(sheetOsp.suggestedSheet);
    }
    if (evalKind === "first" && step === 2) {
      if (!qualificationComplete(qualAnswers)) {
        setError("Uzupełnij odpowiedzi kwalifikacyjne.");
        return;
      }
      setPrepStatus(prepDefaults.prepServiceStatus);
      setExamRequired(prepDefaults.examRequired);
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function createProcess() {
    if (!user || !hiredAt) return;

    if (evalKind === "first") {
      if (!firstDeadlines) return;
      if (!qualificationComplete(qualAnswers)) {
        setError("Uzupełnij kwalifikację przed utworzeniem procesu.");
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

    const flags = qualificationToFlags(qualAnswers);
    const payload =
      evalKind === "first"
        ? {
            ...base,
            evaluation_type: "first" as const,
            sheet_type: "first" as const,
            eligibility_result: eligibility,
            first_time_civil_service: flags.firstTimeCivilService,
            is_substitute: flags.isSubstitute,
            is_ksap_graduate: flags.isKsapGraduate,
            is_higher_position: flags.isHigherPosition,
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
              </div>
              <div className="form">
                <label>
                  <span>Opis stanowiska (OSP) *</span>
                  <select
                    value={ospPresetId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setOspPresetId(id);
                      const p = findOspPreset(id);
                      if (!p) {
                        setJobTitle("");
                        setOrgUnit("");
                        return;
                      }
                      setJobTitle(p.jobTitle);
                      setOrgUnit(p.orgUnit);
                    }}
                    required
                  >
                    <option value="">— wybierz OSP —</option>
                    {OSP_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form grid-2">
                <label>
                  <span>Komórka organizacyjna *</span>
                  <input value={orgUnit} readOnly required />
                </label>
                <label>
                  <span>Stanowisko *</span>
                  <input value={jobTitle} readOnly required />
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

          {step === 1 && (
            <>
              <h2>Rodzaj oceny</h2>
              <p className="muted">
                Wybierz pierwszą ocenę albo ocenę okresową. Przy okresowej —
                wariant arkusza B/C (sugestia z OSP, jeśli dostępna).
              </p>
              <div className="actions" style={{ marginTop: "0.75rem" }}>
                <label className="check">
                  <input
                    type="radio"
                    name="evalKind"
                    checked={evalKind === "first"}
                    onChange={() => setEvalKind("first")}
                  />
                  <span>Pierwsza ocena</span>
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="evalKind"
                    checked={evalKind === "periodic"}
                    onChange={() => {
                      setEvalKind("periodic");
                      if (sheetOsp) setSheet(sheetOsp.suggestedSheet);
                      if (hiredAt && !cycleAnchorAt) setCycleAnchorAt(hiredAt);
                    }}
                  />
                  <span>Ocena okresowa</span>
                </label>
              </div>

              {evalKind === "periodic" ? (
                <div className="form" style={{ marginTop: "1rem" }}>
                  {sheetOsp ? (
                    <div className="ai-suggest-panel">
                      <div className="ai-suggest-head">
                        <strong>Sugestia AI (OSP → arkusz)</strong>
                      </div>
                      <ul className="ai-suggest-list">
                        <li>
                          <strong>
                            {sheetLabel(sheetOsp.suggestedSheet)}
                          </strong>
                        </li>
                      </ul>
                      <div className="ai-suggest-sources">
                        <button
                          type="button"
                          className="ai-sources-toggle"
                          aria-expanded={sheetSourcesOpen}
                          onClick={() => setSheetSourcesOpen((o) => !o)}
                        >
                          Źródła…
                          <span aria-hidden="true">
                            {sheetSourcesOpen ? " ▾" : " ▸"}
                          </span>
                        </button>
                        {sheetSourcesOpen ? (
                          <ul>
                            <li>
                              {sheetOsp.label} ·{" "}
                              <a
                                href={sheetOsp.pdf}
                                target="_blank"
                                rel="noreferrer"
                              >
                                PDF OSP
                              </a>
                            </li>
                            <li>
                              {sheetOsp.managesPeople
                                ? "OSP: stanowisko z kierowaniem ludźmi → arkusz B"
                                : "OSP: brak kierowania ludźmi → arkusz C"}
                            </li>
                            {sheetOsp.softCompetenciesHint ? (
                              <li>
                                Kompetencje miękkie z OSP:{" "}
                                {sheetOsp.softCompetenciesHint}
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>
                      {sheet !== sheetOsp.suggestedSheet ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => setSheet(sheetOsp.suggestedSheet)}
                        >
                          Zastosuj sugestię
                        </button>
                      ) : (
                        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                          Sugestia zastosowana.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="muted">
                      Brak dopasowanego OSP — wybierz arkusz ręcznie poniżej.
                    </p>
                  )}
                  <div className="actions" style={{ marginTop: "0.35rem" }}>
                    <label
                      className={`check${
                        sheetOsp?.suggestedSheet === "B" ? " ai-suggested" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="sheet"
                        checked={sheet === "B"}
                        onChange={() => setSheet("B")}
                      />
                      <span>{sheetLabel("B")}</span>
                    </label>
                    <label
                      className={`check${
                        sheetOsp?.suggestedSheet === "C" ? " ai-suggested" : ""
                      }`}
                    >
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
                        <strong>
                          {periodicDeadlines.criteriaTalkDeadline}
                        </strong>
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
              ) : (
                <p className="muted" style={{ marginTop: "1rem" }}>
                  W kolejnych krokach: kwalifikacja (jedna opcja). Służba
                  przygotowawcza tylko gdy dotyczy.
                </p>
              )}
            </>
          )}

          {evalKind === "first" && step === 2 && (
            <>
              <h2>Kwalifikacja do pierwszej oceny</h2>
              <p className="muted">Wybierz jedną opcję.</p>
              <div className="form">
                {(
                  [
                    ["first_time", "Pierwszy raz w służbie cywilnej"],
                    ["substitute", "Zatrudniony w celu zastępstwa"],
                    ["ksap", "Absolwent KSAP"],
                    ["higher", "Wyższe stanowisko w służbie cywilnej"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="check">
                    <input
                      type="radio"
                      name="qualPath"
                      checked={qualPath === value}
                      onChange={() => setQualificationPath(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}

                {qualPath === "ksap" ? (
                  <fieldset className="qual-followup">
                    <legend>
                      Czy absolwent złożył wniosek o zwolnienie ze służby
                      przygotowawczej?
                    </legend>
                    <label className="check">
                      <input
                        type="radio"
                        name="ksapExemption"
                        checked={ksapExemptionRequested === true}
                        onChange={() => setKsapExemptionRequested(true)}
                      />
                      <span>Tak — złożono wniosek o zwolnienie</span>
                    </label>
                    <label className="check">
                      <input
                        type="radio"
                        name="ksapExemption"
                        checked={ksapExemptionRequested === false}
                        onChange={() => setKsapExemptionRequested(false)}
                      />
                      <span>Nie — bez wniosku (służba przygotowawcza)</span>
                    </label>
                  </fieldset>
                ) : null}

                {needsAgreementQuestion(qualAnswers) ? (
                  <fieldset className="qual-followup">
                    <legend>
                      Czy zostało zawarte porozumienie stron co do podlegania
                      pierwszej ocenie?
                    </legend>
                    <label className="check">
                      <input
                        type="radio"
                        name="agreement"
                        checked={agreementConcluded === true}
                        onChange={() => setAgreementConcluded(true)}
                      />
                      <span>Tak</span>
                    </label>
                    <label className="check">
                      <input
                        type="radio"
                        name="agreement"
                        checked={agreementConcluded === false}
                        onChange={() => setAgreementConcluded(false)}
                      />
                      <span>Nie</span>
                    </label>
                  </fieldset>
                ) : null}

                {qualPath === "higher" ? (
                  <p className="hint">
                    Przy wyższym stanowisku krok służby przygotowawczej zostanie
                    pominięty (nie dotyczy).
                  </p>
                ) : null}
              </div>
              <div className={`eligibility eligibility-${eligibility}`}>
                Wynik: <strong>{eligibilityLabel(eligibility)}</strong>
                {qualPath === "ksap" && ksapExemptionRequested === true
                  ? " · zwolnienie ze służby przygotowawczej"
                  : ""}
                {qualPath === "higher" ? " · bez służby przygotowawczej" : ""}
              </div>
            </>
          )}

          {evalKind === "first" && showPrepStep && step === 3 && (
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

          {((evalKind === "first" &&
            step === (showPrepStep ? 4 : 3)) ||
            (evalKind === "periodic" && step === 2)) && (
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
                  disabled={saving || !canNext()}
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
