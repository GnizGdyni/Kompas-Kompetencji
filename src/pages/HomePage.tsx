import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** Wejście: zalogowany → procesy, niezalogowany → logowanie. */
export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page narrow">
        <div className="panel login-panel">
          <p className="muted" style={{ margin: 0, textAlign: "center" }}>
            Ładowanie…
          </p>
        </div>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/login" replace />;
}
