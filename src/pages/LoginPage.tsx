import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("marek@example.com");
  const [password, setPassword] = useState("Test1234!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    navigate("/dashboard");
  }

  return (
    <div className="page narrow login-page">
      <div className="panel login-panel">
        <div className="login-brand">
          <img
            className="login-logo"
            src="/logo-kompas.png"
            alt=""
            width={72}
            height={72}
          />
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              Ministerstwo Cyfryzacji
            </p>
            <h1 className="login-title">Kompas Kompetencji</h1>
          </div>
        </div>

        <form className="form" onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            <span>Hasło</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Logowanie…" : "Zaloguj się"}
          </button>
        </form>

        <p className="hint">
          Demo przełożony: <code>marek@example.com</code> / <code>Test1234!</code>
          <br />
          Demo HR: <code>hr@example.com</code> / <code>Test1234!</code>
        </p>
      </div>
    </div>
  );
}
