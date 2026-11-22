import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncDeadlineNotifications,
  unreadCount,
  type AppNotification,
} from "../lib/notifications";
import { isHrRole } from "../types";

function kindLabel(kind: AppNotification["kind"]): string {
  switch (kind) {
    case "deadline_red":
      return "Po terminie";
    case "deadline_yellow":
      return "Zbliża się";
    case "hr_reminder":
      return "HR";
    default:
      return "Info";
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      if (!isHrRole(profile?.role)) {
        await syncDeadlineNotifications().catch(() => 0);
      }
      const list = await fetchMyNotifications();
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd powiadomień");
    }
  }, [user, profile?.role]);

  useEffect(() => {
    if (!user) return;
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [user, load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = unreadCount(items);

  async function onOpenItem(n: AppNotification) {
    if (!n.read_at) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
          ),
        );
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }

  async function onMarkAll() {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || now })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się oznaczyć");
    }
  }

  if (!user) return null;

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className="btn notif-bell-btn"
        aria-label={
          unread > 0
            ? `Powiadomienia, ${unread} nieprzeczytanych`
            : "Powiadomienia"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="34"
          height="34"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 20a1.7 1.7 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="notif-bell-badge">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Powiadomienia">
          <div className="notif-panel-head">
            <strong>Powiadomienia</strong>
            {unread > 0 ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void onMarkAll()}
              >
                Oznacz przeczytane
              </button>
            ) : null}
          </div>
          {error ? <div className="notif-panel-error">{error}</div> : null}
          {items.length === 0 ? (
            <div className="notif-empty">Brak powiadomień.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item${n.read_at ? "" : " is-unread"}`}
                >
                  {n.case_id ? (
                    <Link
                      to={`/procesy/${n.case_id}`}
                      className="notif-item-link"
                      onClick={() => void onOpenItem(n)}
                    >
                      <span className={`notif-kind notif-kind-${n.kind}`}>
                        {kindLabel(n.kind)}
                      </span>
                      <span className="notif-title">{n.title}</span>
                      {n.body ? (
                        <span className="notif-body">{n.body}</span>
                      ) : null}
                      <span className="notif-when">
                        {formatWhen(n.created_at)}
                      </span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="notif-item-link"
                      onClick={() => void onOpenItem(n)}
                    >
                      <span className={`notif-kind notif-kind-${n.kind}`}>
                        {kindLabel(n.kind)}
                      </span>
                      <span className="notif-title">{n.title}</span>
                      {n.body ? (
                        <span className="notif-body">{n.body}</span>
                      ) : null}
                      <span className="notif-when">
                        {formatWhen(n.created_at)}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
