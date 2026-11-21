import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  eligibilityLabel,
  progressForStatus,
  timelinessForDeadline,
  timelinessLabel,
} from "../lib/firstEvaluation";
import {
  EMPTY_INTRO_CHECKLIST,
  STAGES,
  activeStageForStatus,
  introChecklistComplete,
  nearestDeadlineForCase,
  parseIntroChecklist,
  stageState,
  type IntroChecklist,
  type StageId,
} from "../lib/stages";
import { supabase } from "../lib/supabase";
import {
  EVAL_TYPE_LABELS,
  STATUS_LABELS,
  isStaffRole,
  type EligibilityResult,
  type Employee,
  type EvaluationCase,
  type EvaluationStatus,
} from "../types";

type CaseRow = EvaluationCase & { employee: Employee };

export function ProcessDetailPage() {
  const { id } = useParams();
  const { loading, user, profile } = useAuth();
  const [row, setRow] = useState<CaseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageId | null>(null);

  const [checklist, setChecklist] = useState<IntroChecklist>(EMPTY_INTRO_CHECKLIST);
  const [introDate, setIntroDate] = useState("");
  const [examResult, setExamResult] = useState<"pass" | "fail" | "na" | "">("");
  const [reportDate, setReportDate] = useState("");
  const [reportOnTime, setReportOnTime] = useState(true);
  const [reportNotes, setReportNotes] = useState("");
  const [interviewDate, setInterviewDate] = useState("");

  const load = useCallback(async () => {
    if (!id || !user) return;
    const { data, error: err } = await supabase
      .from("evaluation_cases")
      .select("*, employees(*)")
      .eq("id", id)
      .maybeSingle();

    if (err) {
      setError(err.message);
      return;
    }
    if (!data) {
      setError("Nie znaleziono procesu");
      return;
    }
    const emp = Array.isArray(data.employees)
      ? data.employees[0]
      : data.employees;
    if (!emp) {
      setError("Brak danych pracownika");
      return;
    }

    const caseRow = { ...(data as EvaluationCase), employee: emp as Employee };
    setRow(caseRow);
    setChecklist(parseIntroChecklist(caseRow.intro_checklist));
    setIntroDate(caseRow.intro_talk_at || new Date().toISOString().slice(0, 10));
    setExamResult(caseRow.exam_result || "");
    setReportDate(
      caseRow.report_submitted_at || new Date().toISOString().slice(0, 10),
    );
    setReportOnTime(caseRow.report_on_time ?? true);
    setReportNotes(caseRow.report_notes || "");
    setInterviewDate(
      caseRow.assessment_interview_at ||
        new Date().toISOString().slice(0, 10),
    );
    setSelectedStage(
      activeStageForStatus(caseRow.status, caseRow.progress_percent ?? 0),
    );
    setError(null);
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeStage = row
    ? activeStageForStatus(row.status, row.progress_percent ?? 0)
    : 1;
  const viewStage = selectedStage ?? activeStage;

  function st(stageId: StageId) {
    if (!row) return "locked" as const;
    return stageState(stageId, row.status, row.progress_percent ?? 0);
  }

  const nearest = useMemo(() => {
    if (!row) return null;
    return nearestDeadlineForCase(row);
  }, [row]);

  const timeliness = row
    ? timelinessForDeadline(nearest, row.status)
    : "none";

  async function patchCase(patch: Record<string, unknown>) {
    if (!row) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("evaluation_cases")
      .update(patch)
      .eq("id", row.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return false;
    }
    await load();
    return true;
  }

  async function completeIntro() {
    if (!introChecklistComplete(checklist)) {
      setError("Zaznacz wszystkie punkty checklisty rozmowy wstępnej.");
      return;
    }
    const nextStatus: EvaluationStatus = "intro_done";
    await patchCase({
      intro_checklist: checklist,
      intro_talk_at: introDate,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: nearestDeadlineForCase({
        ...row!,
        status: nextStatus,
      }),
    });
  }

  async function completePrep() {
    if (row?.exam_required && !examResult) {
      setError("Wybierz wynik egzaminu (lub NIE DOTYCZY).");
      return;
    }
    const result =
      examResult ||
      (!row?.exam_required ? "na" : examResult);
    if (!result) return;

    const nextStatus: EvaluationStatus = "awaiting_report";
    await patchCase({
      exam_result: result,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: nearestDeadlineForCase({
        ...row!,
        status: nextStatus,
        exam_result: result,
      }),
    });
  }

  async function completeReport() {
    if (!reportDate) {
      setError("Podaj datę złożenia sprawozdania.");
      return;
    }
    const nextStatus: EvaluationStatus = "in_assessment";
    await patchCase({
      report_submitted_at: reportDate,
      report_on_time: reportOnTime,
      report_notes: reportNotes || null,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: nearestDeadlineForCase({
        ...row!,
        status: nextStatus,
      }),
    });
  }

  async function completeInterview() {
    const nextStatus: EvaluationStatus = "interview_done";
    await patchCase({
      assessment_interview_at: interviewDate,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: nearestDeadlineForCase({
        ...row!,
        status: nextStatus,
      }),
    });
  }

  async function markVerdictPlaceholder() {
    // MVP: etap 5 zamyka sprawę merytorycznie; etap 6 to potwierdzenie wniosku
    const nextStatus: EvaluationStatus = "completed";
    await patchCase({
      status: nextStatus,
      progress_percent: 90,
      nearest_deadline: null,
    });
  }

  async function completeRequest() {
    await patchCase({
      status: "completed",
      progress_percent: 100,
      nearest_deadline: null,
    });
  }

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

  const name = row
    ? [row.employee.first_name, row.employee.last_name].filter(Boolean).join(" ") ||
      row.employee.full_name
    : "";

  return (
    <AppShell title="Tablica sprawy">
      <div className="actions" style={{ marginBottom: "1rem" }}>
        <Link className="btn btn-ghost" to="/dashboard">
          ← Lista procesów
        </Link>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {!row && !error ? (
        <div className="panel">Ładowanie procesu…</div>
      ) : null}

      {row ? (
        <>
          <header className="case-header">
            <div>
              <p className="eyebrow">{EVAL_TYPE_LABELS[row.evaluation_type]}</p>
              <h2 style={{ margin: "0.25rem 0" }}>{name}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {[row.employee.job_title, row.employee.org_unit]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="case-header-meta">
              <div>
                <span className="meta-label">Etap</span>
                <strong>{STATUS_LABELS[row.status]}</strong>
              </div>
              <div>
                <span className="meta-label">Postęp</span>
                <strong>{row.progress_percent}%</strong>
              </div>
              <div>
                <span className="meta-label">Terminowość</span>
                <span className={`dot dot-${timeliness}`}>
                  {timelinessLabel(timeliness)}
                </span>
              </div>
            </div>
          </header>

          <ol className="stage-timeline">
            {STAGES.map((s) => {
              const state = st(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`stage-pill stage-${state} ${
                      viewStage === s.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedStage(s.id)}
                  >
                    <span className="stage-num">{s.id}</span>
                    <span className="stage-short">{s.short}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="case-grid">
            <section className="panel case-main">
              <h2 style={{ marginTop: 0 }}>
                Etap {viewStage}: {STAGES[viewStage - 1].title}
              </h2>
              <p className="muted">{STAGES[viewStage - 1].description}</p>

              {st(viewStage) === "locked" ? (
                <div className="alert alert-warn">
                  Ten etap jest jeszcze zablokowany. Najpierw domknij etap{" "}
                  {activeStage}.
                </div>
              ) : null}

              {viewStage === 1 && (
                <div className="form">
                  <label>
                    <span>Data rozmowy wstępnej</span>
                    <input
                      type="date"
                      value={introDate}
                      disabled={st(1) !== "active"}
                      onChange={(e) => setIntroDate(e.target.value)}
                    />
                  </label>
                  {(
                    [
                      ["procedure", "Omówiono procedurę i etapy pierwszej oceny"],
                      ["elements", "Omówiono 5 elementów oceny (opisy)"],
                      ["expectations", "Omówiono oczekiwania przełożonego"],
                      ["jobDesc", "Omówiono obowiązki z opisu stanowiska"],
                      [
                        "reportDeadline",
                        "Wyznaczono i omówiono termin sprawozdania",
                      ],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="check">
                      <input
                        type="checkbox"
                        checked={checklist[key]}
                        disabled={st(1) !== "active"}
                        onChange={(e) =>
                          setChecklist({ ...checklist, [key]: e.target.checked })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {st(1) === "active" ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeIntro()}
                    >
                      {saving ? "Zapisywanie…" : "Potwierdź rozmowę wstępną"}
                    </button>
                  ) : st(1) === "done" ? (
                    <div className="alert eligibility-eligible">
                      Rozmowa wstępna potwierdzona
                      {row.intro_talk_at ? ` (${row.intro_talk_at})` : ""}.
                    </div>
                  ) : null}
                </div>
              )}

              {viewStage === 2 && (
                <div className="form">
                  <p>
                    <strong>Status służby:</strong>{" "}
                    {row.prep_service_status || "—"}
                  </p>
                  <p>
                    <strong>Wymagany egzamin:</strong>{" "}
                    {row.exam_required ? "tak" : "nie / nie dotyczy"}
                  </p>
                  <label>
                    <span>Wynik egzaminu</span>
                    <select
                      value={examResult}
                      disabled={st(2) !== "active"}
                      onChange={(e) =>
                        setExamResult(
                          e.target.value as "pass" | "fail" | "na" | "",
                        )
                      }
                    >
                      <option value="">— wybierz —</option>
                      <option value="pass">Zaliczony (TAK)</option>
                      <option value="fail">Niezaliczony (NIE)</option>
                      <option value="na">Nie dotyczy</option>
                    </select>
                  </label>
                  {st(2) === "active" ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completePrep()}
                    >
                      {saving ? "Zapisywanie…" : "Zapisz i przejdź do sprawozdania"}
                    </button>
                  ) : st(2) === "done" ? (
                    <div className="alert eligibility-eligible">
                      Etap służby / egzaminu domknięty
                      {row.exam_result ? ` (wynik: ${row.exam_result})` : ""}.
                    </div>
                  ) : null}
                </div>
              )}

              {viewStage === 3 && (
                <div className="form">
                  <p className="muted">
                    Okno sprawozdania: {row.report_due_from || "—"} —{" "}
                    {row.report_due_to || "—"}
                  </p>
                  <label>
                    <span>Data złożenia</span>
                    <input
                      type="date"
                      value={reportDate}
                      disabled={st(3) !== "active"}
                      onChange={(e) => setReportDate(e.target.value)}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={reportOnTime}
                      disabled={st(3) !== "active"}
                      onChange={(e) => setReportOnTime(e.target.checked)}
                    />
                    <span>Złożone w wyznaczonym terminie</span>
                  </label>
                  <label>
                    <span>Notatka / link do pliku (opcjonalnie)</span>
                    <input
                      value={reportNotes}
                      disabled={st(3) !== "active"}
                      onChange={(e) => setReportNotes(e.target.value)}
                      placeholder="np. sprawozdanie w EZD / opis"
                    />
                  </label>
                  {st(3) === "active" ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeReport()}
                    >
                      {saving ? "Zapisywanie…" : "Oznacz sprawozdanie jako złożone"}
                    </button>
                  ) : st(3) === "done" ? (
                    <div className="alert eligibility-eligible">
                      Sprawozdanie odnotowane
                      {row.report_submitted_at
                        ? ` (${row.report_submitted_at})`
                        : ""}
                      .
                    </div>
                  ) : null}
                </div>
              )}

              {viewStage === 4 && (
                <div className="form">
                  <label>
                    <span>Data rozmowy oceniającej</span>
                    <input
                      type="date"
                      value={interviewDate}
                      disabled={st(4) !== "active"}
                      onChange={(e) => setInterviewDate(e.target.value)}
                    />
                  </label>
                  <p className="muted">
                    Pełna agenda rozmowy + asystent AI dołożymy w kolejnym kroku.
                    Na MVP możesz potwierdzić przeprowadzenie rozmowy.
                  </p>
                  {st(4) === "active" ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeInterview()}
                    >
                      Potwierdź rozmowę oceniającą
                    </button>
                  ) : st(4) === "done" ? (
                    <div className="alert eligibility-eligible">
                      Rozmowa oceniająca potwierdzona.
                    </div>
                  ) : null}
                </div>
              )}

              {viewStage === 5 && (
                <div className="form">
                  <p className="muted">
                    Tu będzie ocena 5 elementów (3/5/7 pkt) z modelem kompetencji
                    i walidacją warunków pozytywnej oceny.
                  </p>
                  {st(5) === "active" ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void markVerdictPlaceholder()}
                    >
                      Domknij ocenę na piśmie (MVP)
                    </button>
                  ) : st(5) === "done" ? (
                    <div className="alert eligibility-eligible">
                      Ocena na piśmie oznaczona jako domknięta (MVP).
                    </div>
                  ) : null}
                </div>
              )}

              {viewStage === 6 && (
                <div className="form">
                  <p className="muted">
                    Wniosek do dyrektora generalnego: umowa na czas nieokreślony
                    (pozytywna) albo rozwiązanie / brak umowy (negatywna). PDF
                    wniosku dołożymy później.
                  </p>
                  {st(6) === "active" ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeRequest()}
                    >
                      Oznacz wniosek jako złożony
                    </button>
                  ) : st(6) === "done" ? (
                    <div className="alert eligibility-eligible">
                      Proces zakończony (100%).
                    </div>
                  ) : (
                    <div className="alert alert-warn">
                      Najpierw domknij ocenę na piśmie (etap 5).
                    </div>
                  )}
                </div>
              )}
            </section>

            <aside className="panel case-side">
              <h3 style={{ marginTop: 0 }}>Terminy</h3>
              <div className="deadline-list">
                <div>
                  <span>Rozmowa wstępna do</span>
                  <strong>{row.intro_talk_deadline || "—"}</strong>
                </div>
                <div>
                  <span>Sprawozdanie</span>
                  <strong>
                    {row.report_due_from || "—"} — {row.report_due_to || "—"}
                  </strong>
                </div>
                <div>
                  <span>Okno oceny do</span>
                  <strong>{row.assessment_window_to || "—"}</strong>
                </div>
                <div className="nearest">
                  <span>Najbliższy (dla etapu)</span>
                  <strong>{nearest || "—"}</strong>
                  <span className={`dot dot-${timeliness}`}>
                    {timelinessLabel(timeliness)}
                  </span>
                </div>
              </div>

              <h3>Kwalifikacja</h3>
              <p>
                {row.eligibility_result
                  ? eligibilityLabel(row.eligibility_result as EligibilityResult)
                  : "—"}
              </p>
              <p className="muted">
                Służba: {row.prep_service_status || "—"} · Egzamin wymagany:{" "}
                {row.exam_required ? "tak" : "nie"}
              </p>

              <div className="progress" style={{ marginTop: "1rem" }}>
                <div
                  className="progress-bar"
                  style={{ width: `${row.progress_percent ?? 0}%` }}
                />
                <span>Postęp procesu: {row.progress_percent ?? 0}%</span>
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
