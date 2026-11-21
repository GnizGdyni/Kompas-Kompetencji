import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  timelinessForDeadline,
  timelinessLabel,
} from "../lib/firstEvaluation";
import { supabase } from "../lib/supabase";
import {
  EVAL_TYPE_LABELS,
  STATUS_LABELS,
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

  function exportCsv() {
    const header = [
      "Pracownik",
      "Stanowisko",
      "Typ oceny",
      "Etap",
      "Najbliższy termin",
      "Terminowość",
      "Postęp %",
    ];
    const lines = filtered.map((r) => {
      const t = timelinessForDeadline(r.nearest_deadline, r.status);
      const name =
        [r.employee.first_name, r.employee.last_name].filter(Boolean).join(" ") ||
        r.employee.full_name;
      return [
        name,
        r.employee.job_title || "",
        EVAL_TYPE_LABELS[r.evaluation_type],
        STATUS_LABELS[r.status],
        r.nearest_deadline || "",
        timelinessLabel(t),
        String(r.progress_percent ?? 0),
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(";");
    });
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kompas-procesy-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
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

  return (
    <AppShell title="Moi pracownicy (lista procesów)">
      <div className="toolbar">
        <div className="filters">
          <input
            className="filter-input"
            placeholder="Szukaj po nazwisku…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="filter-input"
            value={stage}
            onChange={(e) => setStage(e.target.value as "" | EvaluationStatus)}
          >
            <option value="">Etap: wszystkie</option>
            {(Object.keys(STATUS_LABELS) as EvaluationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="filter-input"
            value={timeliness}
            onChange={(e) =>
              setTimeliness(e.target.value as "" | "green" | "yellow" | "red")
            }
          >
            <option value="">Status terminu: wszystkie</option>
            <option value="green">Zielony — w terminie</option>
            <option value="yellow">Żółty — zbliża się</option>
            <option value="red">Czerwony — po terminie</option>
          </select>
          <select
            className="filter-input"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">Rok: wszystkie</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label className="filter-date">
            <span>Termin do</span>
            <input
              type="date"
              value={deadlineTo}
              onChange={(e) => setDeadlineTo(e.target.value)}
            />
          </label>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" type="button" onClick={exportCsv}>
            Eksport listy
          </button>
          <Link className="btn btn-primary" to="/procesy/nowy">
            + Dodaj pracownika
          </Link>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error">
          {error}
          <div style={{ marginTop: 8 }}>
            Upewnij się, że odpaliłeś migracje SQL (004 i 005).
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
              <th>Postęp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-cell">
                  Brak procesów. Kliknij „+ Dodaj pracownika”, aby utworzyć
                  pierwszą sprawę.
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
                    <td>
                      <strong>{name}</strong>
                      <div className="cell-muted">{r.employee.org_unit}</div>
                    </td>
                    <td>{r.employee.job_title || "—"}</td>
                    <td>{EVAL_TYPE_LABELS[r.evaluation_type]}</td>
                    <td>{STATUS_LABELS[r.status]}</td>
                    <td>{r.nearest_deadline || "—"}</td>
                    <td>
                      <span className={`dot dot-${t}`}>
                        {timelinessLabel(t)}
                      </span>
                    </td>
                    <td>
                      <div className="progress">
                        <div
                          className="progress-bar"
                          style={{ width: `${r.progress_percent ?? 0}%` }}
                        />
                        <span>{r.progress_percent ?? 0}%</span>
                      </div>
                    </td>
                    <td>
                      <Link className="btn btn-small" to={`/procesy/${r.id}`}>
                        Otwórz proces
                      </Link>
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
