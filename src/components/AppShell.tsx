import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABELS, isStaffRole } from "../types";

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
  const org = profile?.org_unit;

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <Link to="/dashboard" className="brand">
              Kompas Kompetencji
            </Link>
            <nav className="topbar-nav">
              <NavLink to="/dashboard" end>
                Procesy
              </NavLink>
              <NavLink to="/procesy/nowy">Nowy proces</NavLink>
            </nav>
          </div>

          <div className="topbar-right">
            <div className="topbar-user">
              <div className="topbar-user-text">
                <strong>{displayName}</strong>
                <span className="topbar-user-meta">
                  {role && isStaffRole(role) ? ROLE_LABELS[role] : "Konto"}
                  {org ? ` · ${org}` : ""}
                  {email && email !== displayName ? ` · ${email}` : ""}
                </span>
              </div>
            </div>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => signOut()}
            >
              Wyloguj
            </button>
          </div>
        </div>
      </header>

      <main className="page-main">
        {title ? <h1 className="page-title">{title}</h1> : null}
        {children}
      </main>
    </div>
  );
}
