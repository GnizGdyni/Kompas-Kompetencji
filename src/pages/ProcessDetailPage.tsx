import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAssistantProcess } from "../auth/AssistantProcessContext";
import { useAuth } from "../auth/AuthContext";
import {
  eligibilityLabel,
  progressForStatus,
  timelinessForDeadline,
  timelinessLabel,
} from "../lib/firstEvaluation";
import {
  averagePartialScores,
  averageTone,
  competenciesForCase,
  extraCriteriaCandidates,
  levelsForEvaluationType,
  parseIndicatorAnswers,
  parsePartialScores,
  scoreTone,
  suggestedScoreForCompetency,
  type Competency,
  type IndicatorAnswers,
  type PartialScores,
} from "../lib/competencyModel";
import { downloadFilledSheetPdf } from "../lib/exportSheetPdf";
import {
  suggestExtraCriteria,
  type CriteriaSuggestion,
} from "../lib/groqSuggestCriteria";
import {
  suggestIntroQuestions,
  type QuestionsSuggestion,
} from "../lib/groqSuggestQuestions";
import {
  suggestEvidenceFromFacts,
  type EvidenceSuggestion,
} from "../lib/groqSuggestEvidence";
import {
  suggestDevelopmentActions,
  type DevelopmentSuggestion,
} from "../lib/groqSuggestDevelopment";
import {
  capitalizeFirst,
  formatOrgUnitShort,
} from "../lib/formatOrgUnit";
import { findOspPresetByJobAndUnit } from "../lib/ospPositions";
import {
  formatFileSize,
  removeReportFile,
  signedReportUrl,
  uploadReportFile,
} from "../lib/reportFile";
import {
  computePeriodicDeadlines,
  mandatoryCodesForSheet,
  overallLevelFromAverage,
  parseExtraCriteria,
  sheetLabel,
  type PeriodicSheet,
} from "../lib/periodicEvaluation";
import {
  EMPTY_INTRO_CHECKLIST,
  activeStageForStatus,
  introChecklistComplete,
  nearestDeadlineForCase,
  parseIntroChecklist,
  stageState,
  stagesForType,
  type IntroChecklist,
  type StageId,
} from "../lib/stages";
import { supabase } from "../lib/supabase";
import {
  EVAL_TYPE_LABELS,
  statusLabelForCase,
  canRunEvaluation,
  isHrRole,
  isStaffRole,
  type EligibilityResult,
  type Employee,
  type EmployeeNote,
  type EmployeeNoteTone,
  type EvaluationCase,
  type EvaluationStatus,
} from "../types";

type CaseRow = EvaluationCase & { employee: Employee };

export function ProcessDetailPage() {
  const { id } = useParams();
  const { loading, user, profile } = useAuth();
  const { setOpenProcess } = useAssistantProcess();
  const [row, setRow] = useState<CaseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageId | null>(null);

  const [notes, setNotes] = useState<EmployeeNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesAdding, setNotesAdding] = useState(false);
  const [noteTone, setNoteTone] = useState<EmployeeNoteTone>("positive");
  const [noteSubject, setNoteSubject] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);

  const [checklist, setChecklist] = useState<IntroChecklist>(EMPTY_INTRO_CHECKLIST);
  const [introDate, setIntroDate] = useState("");
  const [prepEnd, setPrepEnd] = useState("");
  const [examResult, setExamResult] = useState<"pass" | "fail" | "na" | "">("");
  const [reportDate, setReportDate] = useState("");
  const [reportOnTime, setReportOnTime] = useState(true);
  const [reportNotes, setReportNotes] = useState("");
  const [reportUploading, setReportUploading] = useState(false);
  const [aiSuggest, setAiSuggest] = useState<CriteriaSuggestion | null>(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null);
  const [aiSourcesOpen, setAiSourcesOpen] = useState(false);
  const aiSuggestKeyRef = useRef<string | null>(null);
  const [aiQuestions, setAiQuestions] = useState<QuestionsSuggestion | null>(
    null,
  );
  const [aiQuestionsLoading, setAiQuestionsLoading] = useState(false);
  const [aiQuestionsError, setAiQuestionsError] = useState<string | null>(null);
  const [aiQuestionsSourcesOpen, setAiQuestionsSourcesOpen] = useState(false);
  const [aiEvidence, setAiEvidence] = useState<EvidenceSuggestion | null>(null);
  const [aiEvidenceLoading, setAiEvidenceLoading] = useState(false);
  const [aiEvidenceError, setAiEvidenceError] = useState<string | null>(null);
  const [aiEvidenceSourcesOpen, setAiEvidenceSourcesOpen] = useState(false);
  const [aiDevelopment, setAiDevelopment] =
    useState<DevelopmentSuggestion | null>(null);
  const [aiDevelopmentLoading, setAiDevelopmentLoading] = useState(false);
  const [aiDevelopmentError, setAiDevelopmentError] = useState<string | null>(
    null,
  );
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [scores, setScores] = useState<PartialScores>({});
  const [answers, setAnswers] = useState<IndicatorAnswers>({});
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [allCompetencies, setAllCompetencies] = useState<Competency[]>([]);
  const [extraCriteria, setExtraCriteria] = useState<string[]>([]);
  const [criteriaTalkDate, setCriteriaTalkDate] = useState("");
  const [verdict, setVerdict] = useState<"positive" | "negative" | "">("");
  const [justification, setJustification] = useState("");
  const [developmentNotes, setDevelopmentNotes] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  /** Ponowne otwarcie już ocenionego wskaźnika w arkuszu sekwencyjnym */
  const [editingIndicatorId, setEditingIndicatorId] = useState<string | null>(
    null,
  );
  const [closingIndicatorId, setClosingIndicatorId] = useState<string | null>(
    null,
  );
  const [pendingPick, setPendingPick] = useState<{
    competency: Competency;
    indicatorId: string;
    points: number;
  } | null>(null);
  const [enteringIndicatorId, setEnteringIndicatorId] = useState<string | null>(
    null,
  );
  /** Ręcznie rozwinięte kompetencje (po auto-zwinięciu przy przejściu dalej). */
  const [sheetExpandedCodes, setSheetExpandedCodes] = useState<
    Record<string, boolean>
  >({});
  const [fieldToast, setFieldToast] = useState<string | null>(null);
  const [attentionField, setAttentionField] = useState<string | null>(null);
  const quizAnimRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const loadCompetencies = useCallback(async () => {
    const { data: comps, error: cErr } = await supabase
      .from("competencies")
      .select(
        "id, code, name, sort_order, max_level_points, for_first_evaluation",
      )
      .order("sort_order");
    if (cErr || !comps) {
      setError(cErr?.message || "Nie udało się wczytać modelu kompetencji");
      return;
    }
    const { data: inds, error: iErr } = await supabase
      .from("competency_indicators")
      .select("id, competency_id, sort_order, title")
      .order("sort_order");
    if (iErr || !inds) {
      setError(iErr?.message || "Nie udało się wczytać wskaźników");
      return;
    }
    const { data: levels, error: lErr } = await supabase
      .from("competency_indicator_levels")
      .select("id, indicator_id, level_index, points, label, description")
      .order("level_index");
    if (lErr || !levels) {
      setError(lErr?.message || "Nie udało się wczytać poziomów");
      return;
    }

    const levelsByInd = new Map<string, typeof levels>();
    for (const lv of levels) {
      const list = levelsByInd.get(lv.indicator_id) ?? [];
      list.push(lv);
      levelsByInd.set(lv.indicator_id, list);
    }
    const indsByComp = new Map<string, typeof inds>();
    for (const ind of inds) {
      const list = indsByComp.get(ind.competency_id) ?? [];
      list.push(ind);
      indsByComp.set(ind.competency_id, list);
    }

    setAllCompetencies(
      comps.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        sort_order: c.sort_order,
        max_level_points: c.max_level_points,
        for_first_evaluation: Boolean(c.for_first_evaluation),
        indicators: (indsByComp.get(c.id) ?? []).map((ind) => ({
          id: ind.id,
          sort_order: ind.sort_order,
          title: ind.title,
          levels: (levelsByInd.get(ind.id) ?? []).map((lv) => ({
            id: lv.id,
            level_index: lv.level_index,
            points: lv.points,
            label: lv.label,
            description: lv.description,
          })),
        })),
      })),
    );
  }, []);

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
    setPrepEnd(caseRow.prep_service_end_at || "");
    setExamResult(caseRow.exam_result || (caseRow.exam_required ? "" : "na"));
    setReportDate(caseRow.report_submitted_at || "");
    setReportOnTime(caseRow.report_on_time ?? true);
    setReportNotes(caseRow.report_notes || "");
    setInterviewDate(caseRow.assessment_interview_at || "");
    setInterviewNotes(caseRow.interview_notes || "");
    setScores(parsePartialScores(caseRow.partial_scores));
    setAnswers(parseIndicatorAnswers(caseRow.indicator_answers));
    setExtraCriteria(parseExtraCriteria(caseRow.extra_criteria));
    setCriteriaTalkDate(
      caseRow.criteria_talk_at ||
        caseRow.intro_talk_at ||
        new Date().toISOString().slice(0, 10),
    );
    setVerdict(caseRow.verdict || "");
    setJustification(caseRow.verdict_justification || "");
    setDevelopmentNotes(caseRow.development_notes || "");
    setSelectedStage(
      activeStageForStatus(caseRow.status, caseRow.progress_percent ?? 0),
    );
    setError(null);
  }, [id, user]);

  const loadNotes = useCallback(async (employeeId: string) => {
    const { data, error: err } = await supabase
      .from("employee_notes")
      .select("*")
      .eq("employee_id", employeeId)
      .order("noted_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (err) {
      setNotesError(err.message);
      setNotes([]);
      return;
    }
    setNotesError(null);
    setNotes((data ?? []) as EmployeeNote[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCompetencies();
  }, [loadCompetencies]);

  useEffect(() => {
    if (row?.employee.id) void loadNotes(row.employee.id);
  }, [row?.employee.id, loadNotes]);

  const activeStage = row
    ? activeStageForStatus(row.status, row.progress_percent ?? 0)
    : 1;
  const viewStage = selectedStage ?? activeStage;

  function st(stageId: StageId) {
    if (!row) return "locked" as const;
    return stageState(stageId, row.status, row.progress_percent ?? 0);
  }

  const hrMode = isHrRole(profile?.role);
  const canEval = canRunEvaluation(profile?.role);

  /** Etap aktywny i wolno prowadzić ocenę (nie HR). */
  function act(stageId: StageId) {
    return canEval && st(stageId) === "active";
  }

  const nearest = useMemo(() => {
    if (!row) return null;
    return nearestDeadlineForCase(row);
  }, [row]);

  const timeliness = row
    ? timelinessForDeadline(nearest, row.status)
    : "none";

  const isPeriodic = row?.evaluation_type === "periodic";
  const sheetType: PeriodicSheet | "first" =
    row?.sheet_type === "B" || row?.sheet_type === "C"
      ? row.sheet_type
      : isPeriodic
        ? "C"
        : "first";
  const stages = stagesForType(row?.evaluation_type ?? "first");

  const competencies = useMemo(
    () =>
      competenciesForCase(allCompetencies, {
        evaluationType: row?.evaluation_type ?? "first",
        sheetType,
        extraCriteria,
      }),
    [allCompetencies, row?.evaluation_type, sheetType, extraCriteria],
  );

  useEffect(() => {
    if (!row) {
      setOpenProcess(null);
      return;
    }
    const filled = competencies.filter((c) => scores[c.code] != null).length;
    setOpenProcess({
      caseId: row.id,
      evaluationType: row.evaluation_type,
      sheetType:
        row.sheet_type ||
        (row.evaluation_type === "periodic" ? "C" : "first"),
      status: row.status,
      viewStage,
      activeStage,
      employeeJobTitle:
        row.employee.job_title || row.employee_job_title || null,
      employeeOrgUnit: row.employee.org_unit || row.employee_org_unit || null,
      employeeDisplayName: null,
      nearestDeadline: nearestDeadlineForCase(row),
      introTalkAt: row.intro_talk_at,
      reportDueFrom: row.report_due_from,
      reportDueTo: row.report_due_to,
      reportSubmittedAt: row.report_submitted_at || reportDate || null,
      hasReportFile: Boolean(row.report_file_path),
      hasReportNotes: Boolean((reportNotes || row.report_notes || "").trim()),
      notesCount: notes.length,
      criteriaTalkAt: row.criteria_talk_at,
      cycleDueAt: row.cycle_due_at || row.next_cycle_due_at,
      verdict: verdict || row.verdict || null,
      hasJustification: Boolean(
        (justification || row.verdict_justification || "").trim(),
      ),
      scoresFilled: filled,
      scoresTotal: competencies.length,
    });
    return () => setOpenProcess(null);
  }, [
    row,
    viewStage,
    activeStage,
    notes.length,
    reportDate,
    reportNotes,
    scores,
    competencies,
    verdict,
    justification,
    setOpenProcess,
  ]);

  const extraCandidates = useMemo(() => {
    if (!isPeriodic || (sheetType !== "B" && sheetType !== "C")) return [];
    return extraCriteriaCandidates(allCompetencies, sheetType);
  }, [allCompetencies, isPeriodic, sheetType]);

  const matchedOsp = useMemo(() => {
    if (!row) return undefined;
    return findOspPresetByJobAndUnit(
      row.employee.job_title || row.employee_job_title,
      row.employee.org_unit || row.employee_org_unit,
    );
  }, [row]);

  useEffect(() => {
    if (!row || !isPeriodic) return;
    if (viewStage !== 1) return;
    if (sheetType !== "B" && sheetType !== "C") return;
    if (extraCandidates.length === 0) return;

    const key = `${row.id}:${sheetType}:${row.employee.job_title || ""}:${extraCandidates.map((c) => c.code).join(",")}`;
    // Po udanym fetchu nie powtarzaj; przy Strict Mode nie blokuj anulowanego pierwszego runu
    if (aiSuggestKeyRef.current === key) return;

    let cancelled = false;
    setAiSuggestLoading(true);
    setAiSuggestError(null);

    const mandatoryCodes = mandatoryCodesForSheet(sheetType);
    const mandatory = mandatoryCodes.map((code) => {
      const c = allCompetencies.find((x) => x.code === code);
      return { code, name: c?.name || code };
    });

    void suggestExtraCriteria({
      jobTitle: row.employee.job_title || "stanowisko nieznane",
      orgUnit: row.employee.org_unit || row.employee_org_unit,
      sheet: sheetType,
      mandatory,
      candidates: extraCandidates.map((c) => ({
        code: c.code,
        name: c.name,
      })),
    })
      .then((s) => {
        if (cancelled) return;
        aiSuggestKeyRef.current = key;
        setAiSuggest(s);
        setAiSuggestError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setAiSuggest(null);
        setAiSuggestError(
          e instanceof Error ? e.message : "Nie udało się pobrać sugestii AI",
        );
      })
      .finally(() => {
        if (!cancelled) setAiSuggestLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    row?.id,
    row?.employee.job_title,
    row?.employee.org_unit,
    row?.employee_org_unit,
    isPeriodic,
    viewStage,
    sheetType,
    extraCandidates,
    allCompetencies,
  ]);

  const avg = averagePartialScores(competencies, scores);
  const overallLevel =
    isPeriodic && avg !== null ? overallLevelFromAverage(avg) : null;

  function commitIndicatorAnswer(
    competency: Competency,
    indicatorId: string,
    points: number,
  ) {
    setAnswers((prev) => {
      const nextAnswers = { ...prev, [indicatorId]: points };

      let foundNext: string | null = null;
      for (const c of competencies) {
        for (const ind of c.indicators) {
          if (nextAnswers[ind.id] == null) {
            foundNext = ind.id;
            break;
          }
        }
        if (foundNext) break;
      }
      if (foundNext) {
        setEnteringIndicatorId(foundNext);
        window.setTimeout(() => setEnteringIndicatorId(null), 380);
      }

      if (!scoreOverrides[competency.code]) {
        const suggested = suggestedScoreForCompetency(
          competency,
          nextAnswers,
          row?.evaluation_type ?? "first",
        );
        if (suggested !== null) {
          setScores((s) => ({ ...s, [competency.code]: suggested }));
        }
      }

      return nextAnswers;
    });
    setEditingIndicatorId(null);
    setPendingPick(null);
    setClosingIndicatorId(null);
  }

  function pickIndicatorAnswer(
    competency: Competency,
    indicatorId: string,
    points: number,
  ) {
    if (closingIndicatorId) return;
    if (quizAnimRef.current != null) {
      window.clearTimeout(quizAnimRef.current);
    }
    setPendingPick({ competency, indicatorId, points });
    setClosingIndicatorId(indicatorId);
    quizAnimRef.current = window.setTimeout(() => {
      commitIndicatorAnswer(competency, indicatorId, points);
      quizAnimRef.current = null;
    }, 320);
  }

  function promptRequired(message: string, fieldId: string) {
    setError(null);
    setFieldToast(message);
    setAttentionField(fieldId);
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setFieldToast(null);
      toastTimerRef.current = null;
    }, 5000);
    window.requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-field="${fieldId}"]`,
      ) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus?.({ preventScroll: true });
    });
  }

  function dismissFieldToast() {
    setFieldToast(null);
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    window.setTimeout(() => setAttentionField(null), 1800);
  }

  const sheetItems = useMemo(() => {
    return competencies.flatMap((comp) =>
      comp.indicators.map((ind) => ({ comp, ind })),
    );
  }, [competencies]);

  const sheetProgress = useMemo(() => {
    const answered = sheetItems.filter((q) => answers[q.ind.id] != null).length;
    const currentIdx = sheetItems.findIndex((q) => answers[q.ind.id] == null);
    return {
      answered,
      total: sheetItems.length,
      currentIdx,
      done: sheetItems.length > 0 && answered === sheetItems.length,
    };
  }, [sheetItems, answers]);

  function overrideScore(code: string, value: number | "") {
    if (value === "") {
      setScores((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setScoreOverrides((prev) => ({ ...prev, [code]: false }));
      return;
    }
    setScores((prev) => ({ ...prev, [code]: value }));
    setScoreOverrides((prev) => ({ ...prev, [code]: true }));
  }

  function toggleExtraCriterion(code: string) {
    setExtraCriteria((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 3) return prev;
      return [...prev, code];
    });
  }

  async function patchCase(patch: Record<string, unknown>) {
    if (!row) return false;
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
    if (!introDate) {
      promptRequired("Ustal datę rozmowy wstępnej.", "intro-date");
      return;
    }
    if (!introChecklistComplete(checklist)) {
      promptRequired(
        "Zaznacz wszystkie punkty checklisty rozmowy wstępnej.",
        "intro-checklist",
      );
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

  async function completeCriteriaTalk() {
    if (!row || !isPeriodic) return;
    if (!criteriaTalkDate) {
      promptRequired("Ustal datę rozmowy o kryteriach.", "criteria-talk");
      return;
    }
    const nextStatus: EvaluationStatus = "intro_done";
    await patchCase({
      criteria_talk_at: criteriaTalkDate,
      intro_talk_at: criteriaTalkDate,
      extra_criteria: extraCriteria,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: row.cycle_due_at || row.assessment_window_to,
    });
  }

  async function savePeriod() {
    if (!row) return;
    const hasReport = Boolean(reportDate || row.report_file_path);
    const nextStatus: EvaluationStatus = hasReport
      ? "awaiting_report"
      : "intro_done";
    await patchCase({
      prep_service_end_at: prepEnd || null,
      exam_result: examResult || null,
      report_submitted_at: reportDate || null,
      report_on_time: reportDate ? reportOnTime : null,
      report_notes: reportNotes || null,
      assessment_interview_at: interviewDate || null,
      status: nextStatus,
      progress_percent: hasReport ? 45 : 25,
      nearest_deadline: nearestDeadlineForCase({
        ...row,
        status: nextStatus,
        prep_service_end_at: prepEnd || null,
        assessment_interview_at: interviewDate || null,
        report_due_to: row.report_due_to,
      }),
    });
  }

  async function handleReportUpload(file: File | null) {
    if (!row || !file) return;
    setReportUploading(true);
    setError(null);
    try {
      const prevPath = row.report_file_path;
      const meta = await uploadReportFile(row.id, file);
      const ok = await patchCase({
        ...meta,
        report_submitted_at:
          reportDate || new Date().toISOString().slice(0, 10),
      });
      if (!ok) {
        await removeReportFile(meta.report_file_path).catch(() => undefined);
        return;
      }
      if (prevPath && prevPath !== meta.report_file_path) {
        await removeReportFile(prevPath).catch(() => undefined);
      }
    if (!reportDate) {
        setReportDate(new Date().toISOString().slice(0, 10));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się wgrać pliku");
    } finally {
      setReportUploading(false);
    }
  }

  async function handleReportRemove() {
    if (!row?.report_file_path) return;
    setReportUploading(true);
    setError(null);
    try {
      const path = row.report_file_path;
      const ok = await patchCase({
        report_file_path: null,
        report_file_name: null,
        report_file_mime: null,
        report_file_size: null,
        report_file_uploaded_at: null,
      });
      if (ok) await removeReportFile(path).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się usunąć pliku");
    } finally {
      setReportUploading(false);
    }
  }

  async function openReportFile() {
    if (!row?.report_file_path) return;
    try {
      const url = await signedReportUrl(row.report_file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się otworzyć pliku");
    }
  }

  async function startInterview() {
    if (!interviewDate) {
      promptRequired(
        "Ustal najpierw termin rozmowy oceniającej.",
        "interview-date",
      );
      return;
    }
    if (!isPeriodic) {
      if (!reportDate) {
        promptRequired(
          "Dodaj datę złożenia sprawozdania przed rozmową.",
          "report-date",
        );
        return;
      }
      if (!row?.report_file_path) {
        promptRequired(
          "Wgraj plik sprawozdania przed rozpoczęciem rozmowy.",
          "report-file",
        );
        return;
      }
      if (row?.exam_required && !examResult) {
        promptRequired(
          "Uzupełnij wynik egzaminu (lub oznacz „Nie dotyczy”).",
          "exam-result",
        );
        return;
      }
    }
    const nextStatus: EvaluationStatus = "in_assessment";
    const ok = await patchCase(
      isPeriodic
        ? {
            assessment_interview_at: interviewDate,
            extra_criteria: extraCriteria,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: nearestDeadlineForCase({
        ...row!,
        status: nextStatus,
      }),
          }
        : {
            prep_service_end_at: prepEnd || null,
            exam_result:
              examResult || (!row?.exam_required ? "na" : examResult),
            report_submitted_at: reportDate,
            report_on_time: reportOnTime,
            report_notes: reportNotes || null,
      assessment_interview_at: interviewDate,
      status: nextStatus,
      progress_percent: progressForStatus(nextStatus),
      nearest_deadline: nearestDeadlineForCase({
        ...row!,
        status: nextStatus,
      }),
          },
    );
    if (ok) setSelectedStage(3);
  }

  async function saveInterviewDraft() {
    await patchCase({
      interview_notes: interviewNotes,
      indicator_answers: answers,
      partial_scores: scores,
      verdict: verdict || null,
      verdict_justification: justification || null,
      development_notes: developmentNotes || null,
      status: "in_assessment",
      progress_percent: 70,
    });
  }

  async function saveNote() {
    if (!user || !row) return;
    if (!noteSubject.trim()) {
      setNotesError("Podaj temat uwagi.");
      return;
    }
    if (!noteBody.trim()) {
      setNotesError("Wpisz treść uwagi.");
      return;
    }
    setNotesSaving(true);
    setNotesError(null);
    const { error: err } = await supabase.from("employee_notes").insert({
      employee_id: row.employee.id,
      case_id: row.id,
      author_id: user.id,
      tone: noteTone,
      subject: noteSubject.trim(),
      body: noteBody.trim(),
      noted_at: noteDate,
    });
    setNotesSaving(false);
    if (err) {
      setNotesError(err.message);
      return;
    }
    setNoteSubject("");
    setNoteBody("");
    setNoteTone("positive");
    setNoteDate(new Date().toISOString().slice(0, 10));
    setNotesAdding(false);
    await loadNotes(row.employee.id);
  }

  async function finishCase() {
    if (competencies.length === 0) {
      promptRequired(
        "Brak modelu kompetencji w bazie — odpal FIX_competency_model_now.sql.",
        "sheet",
      );
      return;
    }
    const firstUnanswered = sheetItems.find((q) => answers[q.ind.id] == null);
    if (firstUnanswered) {
      promptRequired(
        "Uzupełnij wszystkie pytania w arkuszu — brakuje odpowiedzi.",
        `ind-${firstUnanswered.ind.id}`,
      );
      return;
    }
    if (avg === null) {
      promptRequired(
        isPeriodic
          ? "Uzupełnij oceny cząstkowe (1/3/5/7/9) dla wszystkich kryteriów."
          : "Uzupełnij oceny cząstkowe (3/5/7) dla każdej kompetencji.",
        "sheet",
      );
      return;
    }
    if (!verdict) {
      promptRequired(
        "Wybierz werdykt: pozytywna albo negatywna.",
        "verdict",
      );
      return;
    }
    if (verdict === "negative" && !justification.trim()) {
      promptRequired(
        "Przy ocenie negatywnej uzasadnienie jest obowiązkowe.",
        "justification",
      );
      return;
    }
    if (verdict === "positive") {
      if (isPeriodic) {
        const hasOne = competencies.some((c) => scores[c.code] === 1);
        if (hasOne || avg <= 4) {
          promptRequired(
            "Ocena okresowa pozytywna: średnia z kryteriów musi być > 4 oraz żadne kryterium nie może mieć 1 pkt.",
            "verdict",
          );
          return;
        }
      } else {
        const threes = competencies.filter((c) => scores[c.code] === 3).length;
        if (threes > 1 || avg < 5) {
          promptRequired(
            "Warunki pozytywnej oceny: max jedna ocena 3 pkt oraz średnia ≥ 5.",
            "verdict",
          );
          return;
        }
      }
    }

    const nextCycle = isPeriodic
      ? computePeriodicDeadlines({
          cycleAnchorAt: row!.cycle_due_at || interviewDate || criteriaTalkDate,
        }).cycleDueAt
      : null;

    await patchCase({
      interview_notes: interviewNotes,
      indicator_answers: answers,
      partial_scores: scores,
      extra_criteria: isPeriodic ? extraCriteria : undefined,
      verdict,
      verdict_justification: justification || null,
      development_notes: developmentNotes || null,
      status: "completed",
      progress_percent: 100,
      nearest_deadline: null,
      ...(isPeriodic
        ? {
            next_cycle_due_at: nextCycle,
          }
        : {}),
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

  const hrLockNote = (
    <div className="alert alert-warn hr-lock-note">
      Niedostępne w widoku HR — ocenę prowadzi przełożony.
    </div>
  );

  return (
    <AppShell>
      {hrMode ? (
        <div className="hr-banner">
          <strong>Widok HR — nadzór</strong>
          <span>
            Pełny podgląd procesu. Prowadzenie oceny (rozmowy, arkusz, werdykt,
            uwagi) jest zablokowane.
          </span>
        </div>
      ) : null}
      {fieldToast ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onClick={() => dismissFieldToast()}
        >
          <div
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-toast-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="field-toast-title">Uzupełnij wymagane pole</h3>
            <p>{fieldToast}</p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => dismissFieldToast()}
              >
                OK
              </button>
      </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="alert alert-error">{error}</div> : null}

      {!row && !error ? <div className="panel">Ładowanie procesu…</div> : null}

      {row ? (
        <>
          <div className="case-back-row">
            <Link className="text-link case-back" to="/dashboard">
              Lista procesów
            </Link>
          </div>
          <header className="case-header">
            <div className="case-header-main">
              <div className="case-header-top">
                <span className="case-type-badge">
                  {EVAL_TYPE_LABELS[row.evaluation_type]}
                  {isPeriodic && (sheetType === "B" || sheetType === "C")
                    ? ` · ${sheetLabel(sheetType)}`
                    : ""}
                </span>
              </div>
              <h2 className="case-employee-name">{name}</h2>
              <dl className="case-employee-facts">
            <div>
                  <dt>Stanowisko:</dt>
                  <dd>
                    {row.employee.job_title
                      ? capitalizeFirst(row.employee.job_title)
                      : "—"}
                  </dd>
            </div>
              <div>
                  <dt>Komórka:</dt>
                  <dd
                    className="case-org"
                    title={row.employee.org_unit || undefined}
                  >
                    {row.employee.org_unit
                      ? formatOrgUnitShort(row.employee.org_unit)
                      : "—"}
                  </dd>
                </div>
              </dl>
              <div className="notes-actions">
                <button
                  className="btn btn-notes"
                  type="button"
                  onClick={() => {
                    setNotesError(null);
                    setNotesAdding(false);
                    setNotesOpen((open) => {
                      const next = !open;
                      if (next) void loadNotes(row.employee.id);
                      return next;
                    });
                  }}
                >
                  Dodaj/Czytaj Uwagi
                  {notes.length > 0 ? ` (${notes.length})` : ""}
                </button>
              </div>
            </div>
            <div className="case-header-meta">
              <div className="case-meta-card">
                <span className="meta-label">Etap</span>
                <strong>
                  {statusLabelForCase(row.status, row.evaluation_type)}
                </strong>
              </div>
              <div className="case-meta-card">
                <span className="meta-label">Terminowość</span>
                <span className={`dot dot-${timeliness}`}>
                  {timelinessLabel(timeliness)}
                </span>
              </div>
              {isPeriodic ? (
                <>
                  <div className="case-meta-card">
                    <span className="meta-label">Kotwica</span>
                    <strong>{row.cycle_anchor_at || "—"}</strong>
                  </div>
                  <div className="case-meta-card">
                    <span className="meta-label">Sporządzenie</span>
                    <strong>{row.cycle_due_at || "—"}</strong>
                  </div>
                  <div className="case-meta-card">
                    <span className="meta-label">Kolejny cykl</span>
                    <strong>{row.next_cycle_due_at || "—"}</strong>
                  </div>
                </>
              ) : (
                <div className="case-meta-card">
                  <span className="meta-label">Kwalifikacja</span>
                  <strong>
                    {row.eligibility_result
                      ? eligibilityLabel(
                          row.eligibility_result as EligibilityResult,
                        )
                      : "—"}
                  </strong>
                </div>
              )}
            </div>
          </header>

          {notesOpen ? (
            <div className="notes-panel">
              <div className="notes-panel-head">
                <h3 style={{ margin: 0 }}>Uwagi o pracowniku</h3>
                <div className="actions">
                  {canEval && !notesAdding ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => {
                        setNotesError(null);
                        setNotesAdding(true);
                      }}
                    >
                      + Dodaj uwagę
                    </button>
                  ) : null}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setNotesOpen(false);
                      setNotesAdding(false);
                    }}
                  >
                    Zamknij
                  </button>
                </div>
              </div>

              {notesError ? (
                <div className="alert alert-error">{notesError}</div>
              ) : null}

              {notesAdding ? (
                <div className="form" style={{ marginBottom: "1rem" }}>
                  <div className="actions">
                    <label
                      className={`check verdict-chip verdict-pos ${
                        noteTone === "positive" ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="noteTone"
                        checked={noteTone === "positive"}
                        onChange={() => setNoteTone("positive")}
                      />
                      <span>Pozytywna</span>
                    </label>
                    <label
                      className={`check verdict-chip verdict-neg ${
                        noteTone === "negative" ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="noteTone"
                        checked={noteTone === "negative"}
                        onChange={() => setNoteTone("negative")}
                      />
                      <span>Negatywna</span>
                    </label>
                  </div>
                  <label>
                    <span>Temat</span>
                    <input
                      value={noteSubject}
                      onChange={(e) => setNoteSubject(e.target.value)}
                      placeholder="np. Terminowość zadania X"
                      required
                    />
                  </label>
                  <label>
                    <span>Data uwagi</span>
                    <input
                      type="date"
                      value={noteDate}
                      onChange={(e) => setNoteDate(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Treść</span>
                    <textarea
                      className="textarea"
                      rows={4}
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Opisz obserwację / zdarzenie…"
                    />
                  </label>
                  <div className="actions">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setNotesAdding(false);
                        setNotesError(null);
                      }}
                    >
                      Anuluj
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={notesSaving}
                      onClick={() => void saveNote()}
                    >
                      {notesSaving ? "Zapisywanie…" : "Zapisz uwagę"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="notes-list">
                {notes.length === 0 ? (
                  <p className="muted">Brak uwag — dodaj pierwszą.</p>
                ) : (
                  notes.map((n) => (
                    <article
                      key={n.id}
                      className={`note-card note-${n.tone}`}
                    >
                      <div className="note-card-head">
                        <span
                          className={`role-badge note-badge note-badge-${n.tone}`}
                        >
                          {n.tone === "positive" ? "Pozytywna" : "Negatywna"}
                        </span>
                        <strong>{n.noted_at}</strong>
                      </div>
                      <h4 className="note-subject">
                        {n.subject || "(bez tematu)"}
                      </h4>
                      <p style={{ margin: "0.35rem 0 0" }}>{n.body}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <ol className="stage-timeline stages-3">
            {stages.map((s) => {
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

          <div className="case-layout">
            <section className="case-main">
              <h2 style={{ marginTop: 0 }}>
                {stages[viewStage - 1].title}
              </h2>
              {stages[viewStage - 1].description ? (
                <p className="muted">{stages[viewStage - 1].description}</p>
              ) : null}

              {st(viewStage) === "locked" ? (
                <div className="alert alert-warn">
                  Ten etap jest jeszcze zablokowany. Najpierw domknij etap{" "}
                  {activeStage}.
                </div>
              ) : null}

              {/* —— 1. Rozmowa wstępna / Kryteria (okresowa) —— */}
              {viewStage === 1 && isPeriodic && (
                <div className="form">
                  <div className="period-banner">
                    <strong>Cykl 24 miesięcy</strong>
                    <span>
                      Kotwica: {row.cycle_anchor_at || "—"} · Sporządzenie:{" "}
                      {row.cycle_due_at || "—"} · Kolejny cykl:{" "}
                      {row.next_cycle_due_at || "—"}
                    </span>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      Rozmowa o kryteriach w ciągu 30 dni. Obowiązkowe zależą od
                      arkusza B/C; możesz dodać max 3 kryteria dodatkowe.
                    </p>
                  </div>
                  <label
                    data-field="criteria-talk"
                    className={
                      attentionField === "criteria-talk"
                        ? "field-attention"
                        : ""
                    }
                  >
                    <span>Data rozmowy o kryteriach</span>
                    <input
                      type="date"
                      value={criteriaTalkDate}
                      disabled={!act(1)}
                      onChange={(e) => setCriteriaTalkDate(e.target.value)}
                    />
                  </label>
                  <h3>Kryteria obowiązkowe</h3>
                  <ul className="muted" style={{ marginTop: 0 }}>
                    {(sheetType === "B" || sheetType === "C"
                      ? mandatoryCodesForSheet(sheetType)
                      : []
                    ).map((code) => {
                      const c = allCompetencies.find((x) => x.code === code);
                      return <li key={code}>{c?.name || code}</li>;
                    })}
                  </ul>
                  <h3>Kryteria dodatkowe (max 3)</h3>

                  <div className="ai-suggest-panel">
                    <div className="ai-suggest-head">
                      <strong>Sugestia AI (OSP → kryteria)</strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        disabled={aiSuggestLoading || !act(1)}
                        onClick={() => {
                          aiSuggestKeyRef.current = null;
                          setAiSuggest(null);
                          setAiSuggestError(null);
                          // wymuszenie ponownego fetch przez zmianę ref + effect deps
                          setAiSuggestLoading(true);
                          const mandatoryCodes =
                            sheetType === "B" || sheetType === "C"
                              ? mandatoryCodesForSheet(sheetType)
                              : [];
                          const mandatory = mandatoryCodes.map((code) => {
                            const c = allCompetencies.find(
                              (x) => x.code === code,
                            );
                            return { code, name: c?.name || code };
                          });
                          void suggestExtraCriteria({
                            jobTitle:
                              row.employee.job_title || "stanowisko nieznane",
                            orgUnit:
                              row.employee.org_unit || row.employee_org_unit,
                            sheet: sheetType === "B" || sheetType === "C"
                              ? sheetType
                              : "C",
                            mandatory,
                            candidates: extraCandidates.map((c) => ({
                              code: c.code,
                              name: c.name,
                            })),
                          })
                            .then((s) => {
                              setAiSuggest(s);
                              setAiSuggestError(null);
                            })
                            .catch((e: unknown) => {
                              setAiSuggest(null);
                              setAiSuggestError(
                                e instanceof Error
                                  ? e.message
                                  : "Nie udało się pobrać sugestii AI",
                              );
                            })
                            .finally(() => setAiSuggestLoading(false));
                        }}
                      >
                        Odśwież
                      </button>
                    </div>
                    {aiSuggestLoading ? (
                      <p className="muted">Dobieram kryteria na podstawie OSP…</p>
                    ) : null}
                    {aiSuggestError ? (
                      <div className="alert alert-warn">{aiSuggestError}</div>
                    ) : null}
                    {!aiSuggestLoading && !aiSuggestError && !aiSuggest ? (
                      <p className="muted">
                        Brak sugestii — kliknij <strong>Odśwież</strong>.
                      </p>
                    ) : null}
                    {aiSuggest && !aiSuggestLoading ? (
                      <>
                        {aiSuggest.codes.length > 0 ? (
                          <ul className="ai-suggest-list">
                            {aiSuggest.codes.map((code) => {
                              const c = extraCandidates.find(
                                (x) => x.code === code,
                              );
                              return (
                                <li key={code}>
                                  <strong>{c?.name || code}</strong>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="muted">
                            Brak pewnych propozycji z listy kompetencji — wybierz
                            ręcznie albo doprecyzuj stanowisko.
                          </p>
                        )}
                        {(matchedOsp || aiSuggest.sources.length > 0) && (
                          <div className="ai-suggest-sources">
                            <button
                              type="button"
                              className="ai-sources-toggle"
                              aria-expanded={aiSourcesOpen}
                              onClick={() => setAiSourcesOpen((o) => !o)}
                            >
                              Źródła…
                              <span aria-hidden="true">
                                {aiSourcesOpen ? " ▾" : " ▸"}
                              </span>
                            </button>
                            {aiSourcesOpen ? (
                              <ul>
                                {matchedOsp ? (
                                  <li>
                                    {matchedOsp.label} ·{" "}
                                    <a
                                      href={matchedOsp.pdf}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      PDF OSP
                                    </a>
                                  </li>
                                ) : null}
                                {aiSuggest.sources
                                  .filter(
                                    (s) =>
                                      !matchedOsp ||
                                      !s.includes(matchedOsp.pdf),
                                  )
                                  .map((s) => (
                                    <li key={s}>{s}</li>
                                  ))}
                              </ul>
                            ) : null}
                          </div>
                        )}
                        {act(1) && aiSuggest.codes.length > 0 ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            onClick={() =>
                              setExtraCriteria(aiSuggest.codes.slice(0, 3))
                            }
                          >
                            Zastosuj sugestię
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="form">
                    {extraCandidates.map((c) => (
                      <label
                        key={c.id}
                        className={`check${
                          aiSuggest?.codes.includes(c.code)
                            ? " ai-suggested"
                            : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={
                            !act(1) ||
                            (!extraCriteria.includes(c.code) &&
                              extraCriteria.length >= 3)
                          }
                          checked={extraCriteria.includes(c.code)}
                          onChange={() => toggleExtraCriterion(c.code)}
                        />
                        <span>
                          {c.name}
                          {aiSuggest?.codes.includes(c.code) ? (
                            <span className="ai-tag"> AI</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  {act(1) ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeCriteriaTalk()}
                    >
                      {saving
                        ? "Zapisywanie…"
                        : "Potwierdź kryteria i termin"}
                    </button>
                  ) : st(1) === "active" ? (
                    hrLockNote
                  ) : (
                    <div className="alert eligibility-eligible">
                      Kryteria i termin potwierdzone
                      {row.criteria_talk_at
                        ? ` (${row.criteria_talk_at})`
                        : ""}
                      .
                    </div>
                  )}
                </div>
              )}

              {viewStage === 1 && !isPeriodic && (
                <div className="form">
                  <label
                    data-field="intro-date"
                    className={
                      attentionField === "intro-date" ? "field-attention" : ""
                    }
                  >
                    <span>Data rozmowy wstępnej</span>
                    <input
                      type="date"
                      value={introDate}
                      disabled={!act(1)}
                      onChange={(e) => setIntroDate(e.target.value)}
                    />
                  </label>

                  <div className="ai-suggest-panel">
                    <div className="ai-suggest-head">
                      <strong>Sugestia AI (OSP → pytania)</strong>
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        disabled={aiQuestionsLoading}
                        onClick={() => {
                          setAiQuestionsLoading(true);
                          setAiQuestionsError(null);
                          setAiQuestionsSourcesOpen(false);
                          void suggestIntroQuestions({
                            jobTitle:
                              row.employee.job_title ||
                              row.employee_job_title ||
                              "stanowisko",
                            orgUnit:
                              row.employee.org_unit || row.employee_org_unit,
                            kind: "first_intro",
                          })
                            .then((s) => {
                              setAiQuestions(s);
                              setAiQuestionsError(null);
                            })
                            .catch((e: unknown) => {
                              setAiQuestions(null);
                              setAiQuestionsError(
                                e instanceof Error
                                  ? e.message
                                  : "Nie udało się zasugerować pytań",
                              );
                            })
                            .finally(() => setAiQuestionsLoading(false));
                        }}
                      >
                        {aiQuestionsLoading
                          ? "Generuję…"
                          : aiQuestions
                            ? "Odśwież pytania"
                            : "Zasugeruj pytania AI"}
                      </button>
                    </div>
                    {aiQuestionsLoading ? (
                      <p className="muted">
                        Dobieram pytania na podstawie OSP…
                      </p>
                    ) : null}
                    {aiQuestionsError ? (
                      <div className="alert alert-warn">{aiQuestionsError}</div>
                    ) : null}
                    {!aiQuestionsLoading && !aiQuestions && !aiQuestionsError ? (
                      <p className="muted">
                        Pytania do omówienia obowiązków i oczekiwań — na
                        podstawie opisu stanowiska.
                      </p>
                    ) : null}
                    {aiQuestions && !aiQuestionsLoading ? (
                      <>
                        <ol className="ai-suggest-list ai-questions-list">
                          {aiQuestions.questions.map((q, i) => (
                            <li key={`${i}-${q.question.slice(0, 24)}`}>
                              <strong>{q.question}</strong>
                              {q.focus ? (
                                <span className="cell-muted">
                                  {" "}
                                  · {q.focus}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                        {(matchedOsp || aiQuestions.sources.length > 0) && (
                          <div className="ai-suggest-sources">
                            <button
                              type="button"
                              className="ai-sources-toggle"
                              aria-expanded={aiQuestionsSourcesOpen}
                              onClick={() =>
                                setAiQuestionsSourcesOpen((o) => !o)
                              }
                            >
                              Źródła…
                              <span aria-hidden="true">
                                {aiQuestionsSourcesOpen ? " ▾" : " ▸"}
                              </span>
                            </button>
                            {aiQuestionsSourcesOpen ? (
                              <ul>
                                {matchedOsp ? (
                                  <li>
                                    {matchedOsp.label} ·{" "}
                                    <a
                                      href={matchedOsp.pdf}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      PDF OSP
                                    </a>
                                  </li>
                                ) : null}
                                {aiQuestions.sources
                                  .filter(
                                    (s) =>
                                      !matchedOsp ||
                                      !s.includes(matchedOsp.pdf),
                                  )
                                  .map((s) => (
                                    <li key={s}>{s}</li>
                                  ))}
                              </ul>
                            ) : null}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>

                  <div
                    data-field="intro-checklist"
                    className={`intro-checklist${
                      attentionField === "intro-checklist"
                        ? " field-attention"
                        : ""
                    }`}
                  >
                    {(
                      [
                        [
                          "procedure",
                          "Omówiono procedurę i etapy pierwszej oceny",
                        ],
                        ["elements", "Omówiono 5 elementów oceny"],
                        [
                          "expectations",
                          "Omówiono oczekiwania przełożonego",
                        ],
                        [
                          "jobDesc",
                          "Omówiono obowiązki z opisu stanowiska",
                        ],
                        [
                          "reportDeadline",
                          "Wyznaczono termin sprawozdania",
                        ],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="intro-check">
                        <input
                          type="checkbox"
                          checked={checklist[key]}
                          disabled={!act(1)}
                          onChange={(e) =>
                            setChecklist({
                              ...checklist,
                              [key]: e.target.checked,
                            })
                          }
                        />
                        <span className="intro-check-box" aria-hidden="true" />
                        <span className="intro-check-label">{label}</span>
                      </label>
                    ))}
                  </div>
                  {act(1) ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeIntro()}
                    >
                      {saving ? "Zapisywanie…" : "Potwierdź rozmowę wstępną"}
                    </button>
                  ) : st(1) === "active" ? (
                    hrLockNote
                  ) : (
                    <div className="alert eligibility-eligible">
                      Rozmowa wstępna potwierdzona
                      {row.intro_talk_at ? ` (${row.intro_talk_at})` : ""}.
                    </div>
                  )}
                </div>
              )}

              {/* —— 2. Okres oceny okresowej —— */}
              {viewStage === 2 && isPeriodic && (
                <div className="form">
                  <div className="period-banner">
                    <strong>Okres podlegający ocenie</strong>
                    <span>
                      Od {row.cycle_anchor_at || row.assessment_window_from || "—"}{" "}
                      do {row.cycle_due_at || row.assessment_window_to || "—"}
                    </span>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      Obserwujesz kryteria obowiązkowe i dodatkowe. Gdy cykl dobiega
                      końca — ustal rozmowę i otwórz arkusz.
                    </p>
                  </div>
                  <label
                    data-field="interview-date"
                    className={
                      attentionField === "interview-date"
                        ? "field-attention"
                        : ""
                    }
                  >
                    <span>Data rozmowy oceniającej</span>
                    <input
                      type="date"
                      value={interviewDate}
                      disabled={!act(2)}
                      onChange={(e) => setInterviewDate(e.target.value)}
                    />
                  </label>
                  {act(2) ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving}
                      onClick={() => void startInterview()}
                    >
                      Rozpocznij rozmowę i arkusz
                    </button>
                  ) : st(2) === "active" ? (
                    hrLockNote
                  ) : (
                    <div className="alert eligibility-eligible">
                      Okres domknięty — jesteś w etapie rozmowy i arkusza.
                    </div>
                  )}
                </div>
              )}

              {/* —— 2. Okres oceny (pierwsza — służba w tle) —— */}
              {viewStage === 2 && !isPeriodic && (
                <div className="form">
                  <div className="period-banner">
                    <strong>Służba przygotowawcza</strong>
                    <span>
                      Status: {row.prep_service_status || "—"} · Egzamin:{" "}
                      {row.exam_required ? "wymagany" : "nie dotyczy"}
                    </span>
                    <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                      To toczy się w tle urzędu — tu tylko pilnujesz daty
                      zakończenia i formalności przed rozmową.
                    </p>
                  </div>

                  <div className="grid-2">
                  <label>
                      <span>Data zakończenia służby przygotowawczej</span>
                      <input
                        type="date"
                        value={prepEnd}
                        disabled={!act(2)}
                        onChange={(e) => setPrepEnd(e.target.value)}
                      />
                    </label>
                    <label
                      data-field="exam-result"
                      className={
                        attentionField === "exam-result"
                          ? "field-attention"
                          : ""
                      }
                    >
                    <span>Wynik egzaminu</span>
                    <select
                      value={examResult}
                      disabled={!act(2)}
                      onChange={(e) =>
                        setExamResult(
                          e.target.value as "pass" | "fail" | "na" | "",
                        )
                      }
                    >
                      <option value="">— wybierz —</option>
                        <option value="pass">Zaliczony</option>
                        <option value="fail">Niezaliczony</option>
                      <option value="na">Nie dotyczy</option>
                    </select>
                  </label>
                    </div>

                  <h3 className="case-section-title">Sprawozdanie</h3>
                  <div
                    data-field="report-file"
                    className={`report-upload${
                      attentionField === "report-file" ? " field-attention" : ""
                    }`}
                  >
                    <span className="report-upload-label">
                      Plik sprawozdania
                    </span>
                    <p className="muted" style={{ margin: "0.15rem 0 0.55rem" }}>
                      PDF, DOC/DOCX lub obraz (max 10 MB). Zapis w bazie i
                      Storage.
                    </p>
                    {row.report_file_path ? (
                      <div className="report-file-row">
                        <div>
                          <strong>{row.report_file_name || "Plik"}</strong>
                          <div className="cell-muted">
                            {formatFileSize(row.report_file_size)}
                            {row.report_file_uploaded_at
                              ? ` · ${row.report_file_uploaded_at.slice(0, 10)}`
                              : ""}
                          </div>
                        </div>
                        <div className="actions" style={{ marginTop: 0 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => void openReportFile()}
                          >
                            Otwórz
                          </button>
                          {act(2) ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              disabled={reportUploading}
                              onClick={() => void handleReportRemove()}
                            >
                              Usuń
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {act(2) ? (
                      <label className="report-file-input">
                        <span className="btn btn-ghost">
                          {reportUploading
                            ? "Wgrywanie…"
                            : row.report_file_path
                              ? "Zamień plik"
                              : "Wybierz plik"}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf"
                          disabled={reportUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            e.target.value = "";
                            void handleReportUpload(f);
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className="report-date-row">
                    <label
                      data-field="report-date"
                      className={
                        attentionField === "report-date"
                          ? "field-attention"
                          : ""
                      }
                    >
                      <span>Data złożenia sprawozdania</span>
                      <input
                        type="date"
                        value={reportDate}
                        disabled={!act(2)}
                        onChange={(e) => setReportDate(e.target.value)}
                      />
                    </label>
                    <label className="report-ontime-check">
                      <input
                        type="checkbox"
                        checked={reportOnTime}
                        disabled={!act(2) || !reportDate}
                        onChange={(e) => setReportOnTime(e.target.checked)}
                      />
                      <span className="intro-check-label">
                        W wyznaczonym terminie
                      </span>
                    </label>
                  </div>
                  <label>
                    <span>Notatka / opis sprawozdania</span>
                    <input
                      value={reportNotes}
                      disabled={!act(2)}
                      onChange={(e) => setReportNotes(e.target.value)}
                      placeholder="np. złożone w EZD / skrót treści"
                    />
                  </label>

                  <h3 className="case-section-title">
                    Termin rozmowy oceniającej
                  </h3>
                  <label
                    data-field="interview-date"
                    className={
                      attentionField === "interview-date"
                        ? "field-attention"
                        : ""
                    }
                  >
                    <span>Ustal datę rozmowy</span>
                    <input
                      type="date"
                      value={interviewDate}
                      disabled={!act(2)}
                      onChange={(e) => setInterviewDate(e.target.value)}
                    />
                  </label>

                  {act(2) ? (
                    <div className="actions">
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={saving}
                        onClick={() => void savePeriod()}
                      >
                        Zapisz okres
                      </button>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={saving}
                        onClick={() => void startInterview()}
                      >
                        Rozpocznij rozmowę
                      </button>
                    </div>
                  ) : st(2) === "active" ? (
                    hrLockNote
                  ) : (
                    <div className="alert eligibility-eligible">
                      Okres domknięty — jesteś w etapie rozmowy i arkusza.
                    </div>
                  )}
                </div>
              )}

              {/* —— 3. Rozmowa + arkusz —— */}
              {viewStage === 3 && (
                <div className="form">
                  <div className="ai-suggest-panel">
                    <div className="ai-suggest-head">
                      <strong>Podsumowanie / sugestia AI</strong>
                    <button
                      type="button"
                        className="btn btn-primary btn-small"
                        disabled={aiEvidenceLoading}
                        onClick={() => {
                          setAiEvidenceLoading(true);
                          setAiEvidenceError(null);
                          setAiEvidenceSourcesOpen(false);
                          void (async () => {
                            // odśwież uwagi tuż przed analizą
                            let freshNotes = notes;
                            if (row.employee.id) {
                              const { data } = await supabase
                                .from("employee_notes")
                                .select("*")
                                .eq("employee_id", row.employee.id)
                                .order("noted_at", { ascending: false })
                                .order("created_at", { ascending: false });
                              if (data) {
                                freshNotes = data as EmployeeNote[];
                                setNotes(freshNotes);
                              }
                            }
                            return suggestEvidenceFromFacts({
                              jobTitle:
                                row.employee.job_title ||
                                row.employee_job_title ||
                                "stanowisko",
                              reportNotes: reportNotes || row.report_notes,
                              reportFileName: row.report_file_name || null,
                              interviewNotes: interviewNotes || null,
                              notes: freshNotes.map((n) => ({
                                tone: n.tone,
                                subject: n.subject,
                                body: n.body,
                                noted_at: n.noted_at,
                              })),
                              competencies: competencies.map((c) => ({
                                code: c.code,
                                name: c.name,
                                indicators: c.indicators.map((i) => ({
                                  id: i.id,
                                  title: i.title,
                                })),
                              })),
                            });
                          })()
                            .then((s) => {
                              setAiEvidence(s);
                              setAiEvidenceError(null);
                            })
                            .catch((e: unknown) => {
                              setAiEvidence(null);
                              setAiEvidenceError(
                                e instanceof Error
                                  ? e.message
                                  : "Nie udało się przygotować podsumowania",
                              );
                            })
                            .finally(() => setAiEvidenceLoading(false));
                        }}
                      >
                        {aiEvidenceLoading
                          ? "Analizuję…"
                          : aiEvidence
                            ? "Odśwież podsumowanie"
                            : "Podsumowanie / sugestia"}
                    </button>
                    </div>
                    <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                      Porównuje fakty (uwagi → sprawozdanie → rozmowa) z{" "}
                      <strong>wszystkimi kompetencjami tego arkusza</strong> i ich
                      wskaźnikami (małymi pytaniami) — bez domysłów AI.
                    </p>
                    {aiEvidenceLoading ? (
                      <p className="muted">
                        Przechodzę model kompetencji i wskaźniki…
                      </p>
                  ) : null}
                    {aiEvidenceError ? (
                      <div className="alert alert-warn">{aiEvidenceError}</div>
                    ) : null}
                    {aiEvidence?.emptyReason ? (
                      <div className="alert alert-warn">
                        {aiEvidence.emptyReason}
                </div>
                    ) : null}
                    {aiEvidence && !aiEvidence.emptyReason && !aiEvidenceLoading ? (
                      <>
                        <div className="evidence-summary-grid">
                          <div>
                            <h4 className="evidence-heading evidence-plus">
                              Plusy (fakty)
                            </h4>
                            {aiEvidence.summaryPlus.length === 0 ? (
                              <p className="muted">Brak istotnych informacji.</p>
                            ) : (
                              <ul className="ai-suggest-list">
                                {aiEvidence.summaryPlus.map((c) => (
                                  <li key={`p-${c.code}`}>
                                    <strong>{c.name}</strong>
                                    <div className="evidence-hint">{c.hint}</div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h4 className="evidence-heading evidence-minus">
                              Minusy (fakty)
                            </h4>
                            {aiEvidence.summaryMinus.length === 0 ? (
                              <p className="muted">Brak istotnych informacji.</p>
                            ) : (
                              <ul className="ai-suggest-list">
                                {aiEvidence.summaryMinus.map((c) => (
                                  <li key={`m-${c.code}`}>
                                    <strong>{c.name}</strong>
                                    <div className="evidence-hint">{c.hint}</div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        {aiEvidence.sourcesUsed.length > 0 ? (
                          <div className="ai-suggest-sources">
                    <button
                      type="button"
                              className="ai-sources-toggle"
                              aria-expanded={aiEvidenceSourcesOpen}
                              onClick={() =>
                                setAiEvidenceSourcesOpen((o) => !o)
                              }
                            >
                              Źródła…
                              <span aria-hidden="true">
                                {aiEvidenceSourcesOpen ? " ▾" : " ▸"}
                              </span>
                    </button>
                            {aiEvidenceSourcesOpen ? (
                              <ul>
                                {aiEvidence.sourcesUsed.map((s) => (
                                  <li key={s}>{s}</li>
                                ))}
                              </ul>
                            ) : null}
                    </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <label>
                    <span>Notatki z rozmowy</span>
                    <textarea
                      className="textarea"
                      rows={5}
                      value={interviewNotes}
                      disabled={row.status === "completed" || !canEval}
                      onChange={(e) => setInterviewNotes(e.target.value)}
                      placeholder="Mocne strony, obszary do rozwoju, ustalenia…"
                    />
                  </label>

                  <h3
                    data-field="sheet"
                    className={`case-section-title${
                      attentionField === "sheet" ? " field-attention" : ""
                    }`}
                  >
                    Arkusz — model kompetencji
                  </h3>

                  {competencies.length === 0 ? (
                    <div className="alert alert-warn">
                      Brak modelu w bazie. Odpal w Supabase:{" "}
                      <code>FIX_competency_model_now.sql</code>
                    </div>
                  ) : (
                    <p className="sheet-progress">
                      {sheetProgress.done
                        ? `Uzupełniono wszystkie pytania (${sheetProgress.total})`
                        : `Pytanie ${Math.min(sheetProgress.answered + 1, sheetProgress.total)} z ${sheetProgress.total}`}
                    </p>
                  )}

                  {competencies.map((comp) => {
                    const suggested = suggestedScoreForCompetency(
                      comp,
                      answers,
                      row.evaluation_type,
                    );
                    const indDone = comp.indicators.every(
                      (ind) => answers[ind.id] != null,
                    );
                    const hasVisible = comp.indicators.some((ind) => {
                      const answered = answers[ind.id] != null;
                      const isCurrent =
                        sheetProgress.currentIdx >= 0 &&
                        sheetItems[sheetProgress.currentIdx]?.ind.id === ind.id;
                      const isEditing = editingIndicatorId === ind.id;
                      return (
                        answered ||
                        isCurrent ||
                        isEditing ||
                        row.status === "completed"
                      );
                    });
                    if (!hasVisible && !indDone) return null;

                    const currentCompCode =
                      sheetProgress.currentIdx >= 0
                        ? sheetItems[sheetProgress.currentIdx]?.comp.code
                        : null;
                    const editingCompCode = editingIndicatorId
                      ? competencies.find((c) =>
                          c.indicators.some((i) => i.id === editingIndicatorId),
                        )?.code
                      : null;
                    const isActiveSection =
                      currentCompCode === comp.code ||
                      editingCompCode === comp.code;
                    const autoCollapsed =
                      indDone &&
                      !isActiveSection &&
                      (Boolean(currentCompCode) || sheetProgress.done) &&
                      row.status !== "completed";
                    const collapsed =
                      autoCollapsed && sheetExpandedCodes[comp.code] !== true;

                    // Jedna podpowiedź AI na całą kompetencję (nie przy każdym pytaniu)
                    let compEvidence = aiEvidence?.byCompetency[comp.code];
                    if (
                      !compEvidence ||
                      compEvidence.lean === "brak_danych"
                    ) {
                      const fromInd = comp.indicators
                        .map((i) => aiEvidence?.byIndicator[i.id])
                        .find(
                          (e) =>
                            e &&
                            (e.lean === "plus" ||
                              e.lean === "minus" ||
                              e.lean === "neutral"),
                        );
                      if (fromInd) {
                        compEvidence = {
                          code: comp.code,
                          name: comp.name,
                          lean: fromInd.lean,
                          hint: fromInd.hint,
                          sources: fromInd.sources,
                        };
                      }
                    }
                    const showCompEvidence =
                      compEvidence &&
                      (compEvidence.lean === "plus" ||
                        compEvidence.lean === "minus" ||
                        compEvidence.lean === "neutral");

                    return (
                      <div
                        key={comp.id}
                        className={`competency-block${
                          collapsed ? " competency-collapsed" : ""
                        }`}
                      >
                        <div className="competency-title-row">
                          <h4 className="competency-title">{comp.name}</h4>
                          {indDone && !isActiveSection ? (
                            <button
                              type="button"
                              className="btn btn-small competency-toggle"
                              onClick={() =>
                                setSheetExpandedCodes((prev) => ({
                                  ...prev,
                                  [comp.code]: !prev[comp.code],
                                }))
                              }
                            >
                              {collapsed ? "Rozwiń" : "Zwiń"}
                            </button>
                          ) : null}
                        </div>
                        {collapsed ? (
                          <p className="competency-collapsed-summary">
                            Uzupełniono · ocena cząstkowa:{" "}
                            {scores[comp.code] != null
                              ? `${scores[comp.code]} pkt`
                              : suggested != null
                                ? `${suggested} pkt`
                                : "—"}
                          </p>
                        ) : null}
                        {!collapsed ? (
                          <>
                        {showCompEvidence && compEvidence ? (
                          <div className="ai-suggest-panel ai-evidence-comp">
                            <div className="ai-suggest-head">
                              <strong>
                                Sugestia AI
                                {compEvidence.lean === "plus"
                                  ? " · plus"
                                  : compEvidence.lean === "minus"
                                    ? " · minus"
                                    : ""}
                              </strong>
                </div>
                            <p className="ai-suggest-rationale">
                              {compEvidence.hint}
                            </p>
                            {compEvidence.sources.length > 0 ? (
                              <details className="evidence-src">
                                <summary>Źródło</summary>
                                <ul>
                                  {compEvidence.sources.map((s, si) => (
                                    <li key={si}>
                                      <em>{s.kind}</em>: {s.quote}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}
                          </div>
                        ) : null}
                        {comp.indicators.map((ind) => {
                          const levels = levelsForEvaluationType(
                            ind.levels,
                            row.evaluation_type,
                          );
                          const selectedPoints = answers[ind.id];
                          const answered = selectedPoints != null;
                          const pendingPoints =
                            pendingPick?.indicatorId === ind.id
                              ? pendingPick.points
                              : null;
                          const displayPoints =
                            pendingPoints ?? selectedPoints;
                          const selectedLevel = levels.find(
                            (lv) => lv.points === displayPoints,
                          );
                          const isCurrent =
                            sheetProgress.currentIdx >= 0 &&
                            sheetItems[sheetProgress.currentIdx]?.ind.id ===
                              ind.id;
                          const isEditing = editingIndicatorId === ind.id;
                          const isClosing = closingIndicatorId === ind.id;
                          const isEntering = enteringIndicatorId === ind.id;
                          const showOptions =
                            canEval &&
                            row.status !== "completed" &&
                            ((!answered && isCurrent) ||
                              isEditing ||
                              isClosing);

                          if (
                            !answered &&
                            !isCurrent &&
                            !isEditing &&
                            !isClosing &&
                            row.status !== "completed"
                          ) {
                            return null;
                          }

                          if (answered && !showOptions) {
                            return (
                              <div
                                key={ind.id}
                                data-field={`ind-${ind.id}`}
                                className={`indicator-block indicator-answered${
                                  attentionField === `ind-${ind.id}`
                                    ? " field-attention"
                                    : ""
                                }`}
                              >
                                <p className="indicator-title">{ind.title}</p>
                                <div
                                  className={`indicator-picked score-tone-${scoreTone(selectedPoints) ?? "mid"}`}
                                >
                  <strong>
                                    {selectedLevel
                                      ? `${selectedLevel.points} pkt — ${selectedLevel.label}`
                                      : `${selectedPoints} pkt`}
                  </strong>
                                  {canEval && row.status !== "completed" ? (
                                    <button
                                      type="button"
                                      className="btn btn-pdf-glow btn-small"
                                      onClick={() =>
                                        setEditingIndicatorId(ind.id)
                                      }
                                    >
                                      Zmień
                                    </button>
                                  ) : null}
                </div>
                </div>
                            );
                          }

                          return (
                            <div
                              key={ind.id}
                              data-field={`ind-${ind.id}`}
                              className={[
                                "indicator-block",
                                "indicator-active",
                                isClosing ? "sheet-closing" : "",
                                isEntering ? "sheet-entering" : "",
                                attentionField === `ind-${ind.id}`
                                  ? "field-attention"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <p className="indicator-title">{ind.title}</p>
                              <div className="level-options">
                                {levels.map((lv) => (
                                  <label
                                    key={lv.id}
                                    className={`level-option score-tone-${scoreTone(lv.points) ?? "mid"} ${
                                      displayPoints === lv.points
                                        ? "selected"
                                        : ""
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`ind-${ind.id}`}
                                      disabled={
                                        !canEval ||
                                        row.status === "completed" ||
                                        Boolean(closingIndicatorId)
                                      }
                                      checked={displayPoints === lv.points}
                                      onChange={() =>
                                        pickIndicatorAnswer(
                                          comp,
                                          ind.id,
                                          lv.points,
                                        )
                                      }
                                    />
                                    <span className="level-meta">
                                      <strong>
                                        {lv.points} pkt — {lv.label}
                                      </strong>
                                      <span>{lv.description}</span>
                  </span>
                                  </label>
                                ))}
                </div>
                              {isEditing && !isClosing ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-small"
                                  onClick={() => setEditingIndicatorId(null)}
                                >
                                  Anuluj
                                </button>
                              ) : null}
              </div>
                          );
                        })}
                        {indDone ? (
                          <label
                            className={`score-override${
                              scores[comp.code] != null
                                ? ` score-tone-${scoreTone(scores[comp.code])}`
                                : ""
                            }`}
                          >
                            <span>
                              Ocena cząstkowa{" "}
                              {isPeriodic
                                ? "(1 / 3 / 5 / 7 / 9)"
                                : "(3 / 5 / 7)"}
                              {suggested !== null
                                ? ` · sugerowane: ${suggested}`
                                : ""}
                              {scoreOverrides[comp.code] ? " · nadpisane" : ""}
                            </span>
                            <select
                              value={scores[comp.code] ?? ""}
                              disabled={row.status === "completed" || !canEval}
                              onChange={(e) => {
                                const v = e.target.value;
                                overrideScore(
                                  comp.code,
                                  v === "" ? "" : Number(v),
                                );
                              }}
                            >
                              <option value="">—</option>
                              {isPeriodic ? (
                                <>
                                  <option value="1">
                                    1 — znacznie poniżej oczekiwań
                                  </option>
                                  <option value="3">
                                    3 — poniżej oczekiwań
                                  </option>
                                  <option value="5">
                                    5 — na poziomie oczekiwań
                                  </option>
                                  <option value="7">
                                    7 — powyżej oczekiwań
                                  </option>
                                  <option value="9">
                                    9 — znacznie powyżej oczekiwań
                                  </option>
                                </>
                              ) : (
                                <>
                                  <option value="3">
                                    3 — poniżej oczekiwań
                                  </option>
                                  <option value="5">
                                    5 — na poziomie oczekiwań
                                  </option>
                                  <option value="7">
                                    7 — powyżej oczekiwań
                                  </option>
                                </>
                              )}
                            </select>
                          </label>
                        ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}

                  <p
                    className={`score-summary${
                      avg != null ? ` score-tone-${averageTone(avg)}` : ""
                    }`}
                  >
                    <strong>Średnia ocen cząstkowych:</strong>{" "}
                    {avg !== null
                      ? avg.toFixed(2)
                      : "uzupełnij wszystkie kompetencje"}
                    {overallLevel
                      ? ` · poziom ogólny: ${overallLevel.label} (${overallLevel.band})`
                      : ""}
                  </p>
                  {row.status === "completed" && row.next_cycle_due_at ? (
                    <div className="alert eligibility-eligible">
                      Kolejny cykl oceny okresowej:{" "}
                      <strong>{row.next_cycle_due_at}</strong> (kotwica + 24
                      mies. od tej oceny).
                    </div>
                  ) : null}

                  <h3
                    data-field="verdict"
                    className={
                      attentionField === "verdict" ? "field-attention" : ""
                    }
                  >
                    Werdykt
                  </h3>
                  {isPeriodic ? (
              <p className="muted">
                      Pozytywna wymaga: średnia &gt; 4 oraz brak oceny 1 pkt na
                      żadnym kryterium.
                    </p>
                  ) : null}
                  <div className="actions verdict-actions">
                    <label
                      className={`check verdict-chip verdict-pos ${
                        verdict === "positive" ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="verdict"
                        checked={verdict === "positive"}
                        disabled={row.status === "completed" || !canEval}
                        onChange={() => setVerdict("positive")}
                      />
                      <span>Pozytywna</span>
                    </label>
                    <label
                      className={`check verdict-chip verdict-neg ${
                        verdict === "negative" ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="verdict"
                        checked={verdict === "negative"}
                        disabled={row.status === "completed" || !canEval}
                        onChange={() => setVerdict("negative")}
                      />
                      <span>Negatywna</span>
                    </label>
                  </div>

                  <label
                    data-field="justification"
                    className={
                      attentionField === "justification"
                        ? "field-attention"
                        : ""
                    }
                  >
                    <span>
                      Uzasadnienie
                      {verdict === "negative" ? " (obowiązkowe)" : ""}
                    </span>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={justification}
                      disabled={row.status === "completed" || !canEval}
                      onChange={(e) => setJustification(e.target.value)}
                    />
                  </label>

                  <div className="ai-suggest-panel">
                    <div className="ai-suggest-head">
                      <strong>Podpowiedź AI — wnioski rozwojowe</strong>
                      <button
                        type="button"
                        className={`btn btn-small ${
                          aiDevelopment && !aiDevelopmentLoading
                            ? "btn-primary"
                            : "btn-pdf-glow"
                        }`}
                        disabled={
                          aiDevelopmentLoading ||
                          row.status === "completed" ||
                          !canEval
                        }
                        onClick={() => {
                          const scored = competencies
                            .map((c) => {
                              const score = scores[c.code];
                              return score == null
                                ? null
                                : {
                                    code: c.code,
                                    name: c.name,
                                    score: Number(score),
                                  };
                            })
                            .filter(
                              (
                                x,
                              ): x is {
                                code: string;
                                name: string;
                                score: number;
                              } => x != null,
                            );
                          setAiDevelopmentLoading(true);
                          setAiDevelopmentError(null);
                          void suggestDevelopmentActions({
                            jobTitle:
                              row.employee.job_title ||
                              row.employee_job_title ||
                              "stanowisko",
                            orgUnit:
                              row.employee.org_unit ||
                              row.employee_org_unit ||
                              null,
                            evaluationType: row.evaluation_type,
                            verdict,
                            scoredCompetencies: scored,
                            justification,
                            notesSummary: notes
                              .slice(0, 8)
                              .map(
                                (n) =>
                                  `[${n.tone === "positive" ? "+" : "−"} ${n.subject}] ${n.body}`,
                              )
                              .join("\n"),
                          })
                            .then((s) => {
                              setAiDevelopment(s);
                              setAiDevelopmentError(null);
                            })
                            .catch((e: unknown) => {
                              setAiDevelopment(null);
                              setAiDevelopmentError(
                                e instanceof Error
                                  ? e.message
                                  : "Nie udało się przygotować wniosków rozwojowych",
                              );
                            })
                            .finally(() => setAiDevelopmentLoading(false));
                        }}
                      >
                        {aiDevelopmentLoading
                          ? "Analizuję…"
                          : aiDevelopment
                            ? "Odśwież podpowiedź"
                            : "Podpowiedź AI"}
                      </button>
                    </div>
                    <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                      Na podstawie najsłabszych ocen w arkuszu ogólnie wskazuje,
                      nad czym warto popracować.
                    </p>
                    {aiDevelopmentLoading ? (
                      <p className="muted">
                        Sprawdzam słabsze obszary…
                      </p>
                    ) : null}
                    {aiDevelopmentError ? (
                      <div className="alert alert-warn">{aiDevelopmentError}</div>
                    ) : null}
                    {aiDevelopment?.emptyReason ? (
                      <div className="alert alert-warn">
                        {aiDevelopment.emptyReason}
                      </div>
                    ) : null}
                    {aiDevelopment &&
                    !aiDevelopment.emptyReason &&
                    !aiDevelopmentLoading ? (
                      <>
                        {aiDevelopment.weakCompetencies.length ? (
                          <p className="muted" style={{ marginTop: "0.5rem" }}>
                            Słabsze obszary:{" "}
                            <strong>
                              {aiDevelopment.weakCompetencies
                                .map(
                                  (c) =>
                                    `${c.name} (${c.score} pkt)`,
                                )
                                .join(", ")}
                            </strong>
                          </p>
                        ) : null}
                        <ol className="ai-suggest-list ai-questions-list">
                          {aiDevelopment.actions.map((a, i) => (
                            <li key={`${a.competencyCode || a.kind}-${i}`}>
                              <strong>
                                {a.competencyName
                                  ? `Nad czym popracować · ${a.competencyName}`
                                  : "Nad czym popracować"}
                              </strong>
                              <div>{a.action}</div>
                            </li>
                          ))}
                        </ol>
                        {canEval && row.status !== "completed" ? (
                          <div className="actions" style={{ marginTop: "0.5rem" }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-small"
                              onClick={() => {
                                setDevelopmentNotes(aiDevelopment.text);
                              }}
                            >
                              Zastosuj do wniosków rozwojowych
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <label>
                    <span>Wnioski rozwojowe (opcjonalnie)</span>
                    <textarea
                      className="textarea"
                      rows={4}
                      value={developmentNotes}
                      disabled={row.status === "completed" || !canEval}
                      onChange={(e) => setDevelopmentNotes(e.target.value)}
                      placeholder="Po podpowiedzi AI możesz tu wkleić lub dopisać wnioski…"
                    />
                  </label>

                  {canEval && row.status !== "completed" ? (
                    <div className="actions">
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={saving}
                        onClick={() => void saveInterviewDraft()}
                      >
                        Zapisz roboczo
                      </button>
                      <button
                        className="btn btn-pdf-glow"
                        type="button"
                        disabled={pdfBusy}
                        onClick={() => {
                          setPdfBusy(true);
                          setError(null);
                          void downloadFilledSheetPdf({
                            caseRow: {
                              ...row,
                              interview_notes: interviewNotes,
                              partial_scores: scores,
                              indicator_answers: answers,
                              extra_criteria: extraCriteria,
                              verdict: (verdict || row.verdict) as
                                | "positive"
                                | "negative"
                                | null,
                              verdict_justification:
                                justification ||
                                row.verdict_justification ||
                                null,
                              development_notes:
                                developmentNotes ||
                                row.development_notes ||
                                null,
                            },
                            employee: row.employee,
                            competencies,
                            scores,
                            average: avg,
                            supervisor: profile,
                          })
                            .catch((err: unknown) => {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Nie udało się wygenerować PDF",
                              );
                            })
                            .finally(() => setPdfBusy(false));
                        }}
                      >
                        {pdfBusy
                          ? "Generowanie PDF…"
                          : "Pobierz wypełniony arkusz (PDF)"}
                      </button>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={saving}
                        onClick={() => void finishCase()}
                      >
                        Zakończ ocenę i proces
                      </button>
                    </div>
                  ) : (
                    <>
                      {row.status === "completed" ? (
                        <div className="alert eligibility-eligible">
                          Proces zakończony
                          {row.verdict
                            ? ` — ocena ${
                                row.verdict === "positive"
                                  ? "pozytywna"
                                  : "negatywna"
                              }`
                            : ""}
                          .
                        </div>
                      ) : (
                        hrLockNote
                      )}
                      <div className="actions" style={{ marginTop: "0.85rem" }}>
                        <button
                          className="btn btn-pdf-glow"
                          type="button"
                          disabled={pdfBusy}
                          onClick={() => {
                            setPdfBusy(true);
                            setError(null);
                            void downloadFilledSheetPdf({
                              caseRow: {
                                ...row,
                                interview_notes: interviewNotes,
                                partial_scores: scores,
                                indicator_answers: answers,
                                extra_criteria: extraCriteria,
                                verdict: (verdict || row.verdict) as
                                  | "positive"
                                  | "negative"
                                  | null,
                                verdict_justification:
                                  justification ||
                                  row.verdict_justification ||
                                  null,
                                development_notes:
                                  developmentNotes ||
                                  row.development_notes ||
                                  null,
                              },
                              employee: row.employee,
                              competencies,
                              scores,
                              average: avg,
                              supervisor: profile,
                            })
                              .catch((err: unknown) => {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Nie udało się wygenerować PDF",
                                );
                              })
                              .finally(() => setPdfBusy(false));
                          }}
                        >
                          {pdfBusy
                            ? "Generowanie PDF…"
                            : "Pobierz wypełniony arkusz (PDF)"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
