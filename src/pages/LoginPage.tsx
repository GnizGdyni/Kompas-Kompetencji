import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const DEMO_ACCOUNTS = [
  { label: "Przełożony", email: "marek@example.com", password: "Test1234!" },
  { label: "HR", email: "hr@example.com", password: "Test1234!" },
] as const;

export function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState<string>(DEMO_ACCOUNTS[0].password);
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

        <div className="login-demo">
          <p className="login-demo-title">Konta demo</p>
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              className="login-demo-row"
              onClick={() => {
                setEmail(a.email);
                setPassword(a.password);
                setError(null);
              }}
              title="Kliknij, aby wpisać dane"
            >
              <strong>{a.label}:</strong> <code>{a.email}</code> /{" "}
              <code>{a.password}</code>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
