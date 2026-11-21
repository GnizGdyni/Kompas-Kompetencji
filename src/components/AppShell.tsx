import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_COLORS, ROLE_LABELS, isStaffRole } from "../types";

export function AppShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { profile, user, signOut } = useAuth();
  const role = profile?.role;
  const roleColor =
    role && isStaffRole(role) ? ROLE_COLORS[role] : "#64748b";

  return (
    <div className="page wide">
      <header className="topbar">
        <div>
          <Link to="/dashboard" className="brand">
            Kompas Kompetencji
          </Link>
          {title ? <h1 className="topbar-title">{title}</h1> : null}
        </div>
        <div className="topbar-right">
          <div className="topbar-user">
            <strong>{profile?.full_name || user?.email}</strong>
            {role && isStaffRole(role) ? (
              <span className="role-badge" style={{ background: roleColor }}>
                {ROLE_LABELS[role]}
              </span>
            ) : null}
          </div>
          <button className="btn btn-danger" type="button" onClick={() => signOut()}>
            Wyloguj
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
