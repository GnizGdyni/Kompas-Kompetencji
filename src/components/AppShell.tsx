import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { formatOrgUnitShort } from "../lib/formatOrgUnit";
import { ROLE_LABELS, isHrRole, isStaffRole } from "../types";
import { AssistantChatbot } from "./AssistantChatbot";
import { NotificationBell } from "./NotificationBell";
import { SiteFooter } from "./SiteFooter";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("pl-PL");
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toLocaleUpperCase("pl-PL");
}

export function AppShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { profile, user, signOut } = useAuth();
  const role = profile?.role;
  const displayName = profile?.full_name || user?.email || "Użytkownik";
  const email = profile?.email || user?.email || "";
  const orgShort = formatOrgUnitShort(profile?.org_unit);
  const roleLabel =
    role && isStaffRole(role) ? ROLE_LABELS[role] : "Konto";
  const tip = [profile?.org_unit, email].filter(Boolean).join(" · ");
  const hrMode = isHrRole(role);

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <Link to="/dashboard" className="brand">
              <img
                className="brand-logo"
                src="/logo-kompas.png"
                alt=""
                width={46}
                height={46}
              />
              <span>Kompas Kompetencji</span>
            </Link>
            <nav className="topbar-nav">
              <NavLink to="/dashboard" end>
                Procesy
              </NavLink>
              {!hrMode ? (
                <NavLink to="/procesy/nowy">Nowy proces</NavLink>
              ) : null}
            </nav>
          </div>

          <div className="topbar-right">
            <NotificationBell />
            <div className="user-chip" title={tip || undefined}>
              <div className="user-chip-body">
                <div className="user-chip-line">
                  <strong className="user-chip-name">{displayName}</strong>
                  <span className="user-chip-role">{roleLabel}</span>
                </div>
                {orgShort ? (
                  <span className="user-chip-org">{orgShort}</span>
                ) : email && email !== displayName ? (
                  <span className="user-chip-org">{email}</span>
                ) : null}
              </div>
              <span className="user-chip-avatar" aria-hidden="true">
                {initialsFromName(displayName)}
              </span>
            </div>
            <button
              className="btn topbar-logout"
              type="button"
              onClick={() => signOut()}
              aria-label="Wyloguj"
              title="Wyloguj"
            >
              <svg
                className="topbar-logout-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v9" />
                <path d="M6.2 6.8a7.5 7.5 0 1 0 11.6 0" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="page-main">
        {title ? <h1 className="page-title">{title}</h1> : null}
        {children}
      </main>

      <SiteFooter />
      <AssistantChatbot
        context={{
          jobTitle: profile?.job_title,
          orgUnit: profile?.org_unit,
        }}
      />
    </div>
  );
}
