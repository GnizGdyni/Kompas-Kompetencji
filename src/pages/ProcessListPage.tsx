import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  timelinessForDeadline,
  timelinessLabel,
} from "../lib/firstEvaluation";
import {
  capitalizeFirst,
  formatOrgUnitShort,
} from "../lib/formatOrgUnit";
import { hrSendCaseReminder } from "../lib/notifications";
import { removeReportFile } from "../lib/reportFile";
import { supabase } from "../lib/supabase";
import {
  EVAL_TYPE_LABELS,
  STATUS_LABELS,
  statusLabelForCase,
  canRunEvaluation,
  isHrRole,
  isStaffRole,
  type Employee,
  type EvaluationCase,
  type EvaluationStatus,
  type ProcessRow,
} from "../types";

function normalizeEmployee(
  emp: Employee | Employee[] | null | undefined,
): Employee | null {
  if (!emp) return null;
  return Array.isArray(emp) ? emp[0] ?? null : emp;
}

export function ProcessListPage() {
  const { loading, user, profile } = useAuth();
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"" | EvaluationStatus>("");
  const [timeliness, setTimeliness] = useState<"" | "green" | "yellow" | "red">(
    "",
  );
  const [year, setYear] = useState<string>("");
  const [deadlineTo, setDeadlineTo] = useState("");
  const [remindBusyId, setRemindBusyId] = useState<string | null>(null);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from("evaluation_cases")
      .select("*, employees(*)")
      .order("nearest_deadline", { ascending: true, nullsFirst: false });

    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }

    const mapped: ProcessRow[] = [];
    for (const raw of (data ?? []) as EvaluationCase[]) {
      const employee = normalizeEmployee(raw.employees);
      if (!employee) continue;
      mapped.push({ ...raw, employee });
    }
    setError(null);
    setRows(mapped);
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  const years = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => {
      if (r.year) set.add(r.year);
      if (r.created_at) set.add(new Date(r.created_at).getFullYear());
    });
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const last = (r.employee.last_name || r.employee.full_name || "").toLowerCase();
      const first = (r.employee.first_name || "").toLowerCase();
      const query = q.trim().toLowerCase();
      if (query && !last.includes(query) && !first.includes(query) && !r.employee.full_name.toLowerCase().includes(query)) {
        return false;
      }
      if (stage && r.status !== stage) return false;
      if (year && String(r.year || new Date(r.created_at || "").getFullYear()) !== year) {
        return false;
      }
      if (deadlineTo && r.nearest_deadline && r.nearest_deadline > deadlineTo) {
        return false;
      }
      const t = timelinessForDeadline(r.nearest_deadline, r.status);
      if (timeliness && t !== timeliness) return false;
      return true;
    });
  }, [rows, q, stage, year, deadlineTo, timeliness]);

  async function remindSupervisor(caseId: string) {
    setRemindBusyId(caseId);
    setRemindMsg(null);
    try {
      await hrSendCaseReminder(caseId);
      setRemindMsg("Przypomnienie wysłane do przełożonego (dzwonek).");
    } catch (e) {
      setRemindMsg(
        e instanceof Error ? e.message : "Nie udało się wysłać przypomnienia",
      );
    } finally {
      setRemindBusyId(null);
    }
  }

  async function deleteProcess(r: ProcessRow, name: string) {
    const ok = window.confirm(
      `Usunąć proces oceny: ${name}?\n\nTej operacji nie można cofnąć. Uwagi o pracowniku zostaną zachowane.`,
    );
    if (!ok) return;

    setDeleteBusyId(r.id);
    setRemindMsg(null);
    try {
      // Plik przed sprawą: polityka Storage sprawdza właściciela istniejącej sprawy
      if (r.report_file_path) {
        await removeReportFile(r.report_file_path).catch(() => undefined);
      }
      const { data, error: err } = await supabase
        .from("evaluation_cases")
        .delete()
        .eq("id", r.id)
        .select("id");
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) {
        throw new Error(
          "Baza nie pozwoliła usunąć procesu. Uruchom supabase/setup/01_schema.sql w Supabase.",
        );
      }
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setRemindMsg(`Usunięto proces: ${name}.`);
    } catch (e) {
      setRemindMsg(
        e instanceof Error ? e.message : "Nie udało się usunąć procesu",
      );
    } finally {
      setDeleteBusyId(null);
    }
  }

  function exportCsv() {
    const escapeCell = (value: string | number | null | undefined) => {
      const raw = value == null ? "" : String(value);
      return `"${raw.replaceAll('"', '""')}"`;
    };

    const header = [
      "Pracownik",
      "Komórka organizacyjna",
      "Stanowisko",
      "Typ oceny",
      "Etap",
      "Najbliższy termin",
      "Terminowość",
    ].map(escapeCell);

    const lines = filtered.map((r) => {
      const t = timelinessForDeadline(r.nearest_deadline, r.status);
      const name =
        [r.employee.first_name, r.employee.last_name].filter(Boolean).join(" ") ||
        r.employee.full_name;
      return [
        name,
        r.employee.org_unit || "",
        r.employee.job_title
          ? capitalizeFirst(r.employee.job_title)
          : "",
        EVAL_TYPE_LABELS[r.evaluation_type],
        statusLabelForCase(r.status, r.evaluation_type),
        r.nearest_deadline || "",
        timelinessLabel(t),
      ]
        .map(escapeCell)
        .join(";");
    });

    // BOM + CRLF → Excel (PL) poprawnie czyta polskie znaki i kolumny
    const csv = `\uFEFF${[header.join(";"), ...lines].join("\r\n")}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kompas-procesy-${new Date().toISOString().slice(0, 10)}.csv`;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  const hrMode = isHrRole(profile?.role);
  const canEval = canRunEvaluation(profile?.role);

  return (
    <AppShell title={hrMode ? "Nadzór HR — procesy" : "Procesy oceniania"}>
      {hrMode ? (
        <div className="hr-banner">
          <strong>Widok HR</strong>
          <span>
            Podgląd wszystkich procesów. Prowadzenie oceny (arkusz, rozmowy,
            werdykt) jest zablokowane — robi to przełożony. Przycisk
            „Przypomnij” wysyła powiadomienie na dzwonek przełożonego.
          </span>
        </div>
      ) : null}
      {remindMsg ? (
        <div className="alert alert-info" role="status">
          {remindMsg}
        </div>
      ) : null}
      <div className="toolbar">
        <div className="filters">
          <input
            className="toolbar-control"
            placeholder="Szukaj po nazwisku…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Szukaj po nazwisku"
          />
          <select
            className="toolbar-control"
            value={stage}
            onChange={(e) => setStage(e.target.value as "" | EvaluationStatus)}
            aria-label="Etap"
          >
            <option value="">Etap: wszystkie</option>
            {(Object.keys(STATUS_LABELS) as EvaluationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="toolbar-control"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="Rok"
          >
            <option value="">Rok: wszystkie</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input
            className="toolbar-control toolbar-control-date"
            type="date"
            value={deadlineTo}
            onChange={(e) => setDeadlineTo(e.target.value)}
            onFocus={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* browser bez showPicker / już otwarte */
              }
            }}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* ignore */
              }
            }}
            aria-label="Termin do"
            title="Termin do"
          />
          <select
            className="toolbar-control"
            value={timeliness}
            onChange={(e) =>
              setTimeliness(e.target.value as "" | "green" | "yellow" | "red")
            }
            aria-label="Status terminu"
          >
            <option value="">Status terminu: wszystkie</option>
            <option value="green">Zielony — w terminie</option>
            <option value="yellow">Żółty — zbliża się</option>
            <option value="red">Czerwony — po terminie</option>
          </select>
        </div>
        <div className="toolbar-actions">
          <button
            className="btn btn-pdf-glow toolbar-control btn-export"
            type="button"
            onClick={exportCsv}
          >
            Eksport listy
          </button>
          {canEval ? (
            <Link className="btn btn-primary toolbar-control" to="/procesy/nowy">
              Dodaj proces
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary toolbar-control"
              disabled
              title="Tylko przełożony może zakładać proces"
            >
              Dodaj proces
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="alert alert-error">
          {error}
          <div style={{ marginTop: 8 }}>
            Jeśli problem się powtarza, skontaktuj się z administratorem
            systemu.
          </div>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pracownik</th>
              <th>Stanowisko</th>
              <th>Typ oceny</th>
              <th>Etap</th>
              <th>Najbliższy termin</th>
              <th>Terminowość</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  {hrMode
                    ? "Brak procesów w systemie."
                    : "Brak procesów. Kliknij „Dodaj proces”, aby utworzyć pierwszy proces."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const t = timelinessForDeadline(r.nearest_deadline, r.status);
                const name =
                  [r.employee.first_name, r.employee.last_name]
                    .filter(Boolean)
                    .join(" ") || r.employee.full_name;
                return (
                  <tr key={r.id}>
                    <td className="cell-employee">
                      <strong>{name}</strong>
                      {r.employee.org_unit ? (
                        <div
                          className="cell-muted cell-org"
                          title={r.employee.org_unit}
                        >
                          {formatOrgUnitShort(r.employee.org_unit)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {r.employee.job_title
                        ? capitalizeFirst(r.employee.job_title)
                        : "—"}
                    </td>
                    <td>{EVAL_TYPE_LABELS[r.evaluation_type]}</td>
                    <td>
                      {statusLabelForCase(r.status, r.evaluation_type)}
                    </td>
                    <td>{r.nearest_deadline || "—"}</td>
                    <td>
                      <span className={`dot dot-${t}`}>
                        {timelinessLabel(t)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-small" to={`/procesy/${r.id}`}>
                          Otwórz proces
                        </Link>
                        {hrMode &&
                        r.status !== "completed" &&
                        r.status !== "cancelled" ? (
                          <button
                            type="button"
                            className="btn btn-success btn-small"
                            disabled={remindBusyId === r.id}
                            onClick={() => void remindSupervisor(r.id)}
                          >
                            {remindBusyId === r.id ? "…" : "Przypomnij"}
                          </button>
                        ) : null}
                        {canEval && r.supervisor_id === user.id ? (
                          <button
                            type="button"
                            className="btn btn-danger-soft btn-small"
                            disabled={deleteBusyId === r.id}
                            onClick={() => void deleteProcess(r, name)}
                          >
                            {deleteBusyId === r.id ? "Usuwanie…" : "Usuń"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
