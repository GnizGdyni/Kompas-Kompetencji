import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
    <div className="page narrow">
      <div className="panel">
        <p className="eyebrow">Logowanie</p>
        <h1>Panel przełożonego</h1>
        <p className="muted">
          Aplikacja jest tylko dla przełożonych (i HR). Pracowników dodajesz
          później jako obiekty — bez konta.
        </p>

        <form className="form" onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Hasło</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Logowanie…" : "Zaloguj się"}
          </button>
        </form>

        <p className="hint">
          Demo: <code>marek@example.com</code> / <code>Test1234!</code>
        </p>
        <Link className="text-link" to="/">
          ← Strona startowa
        </Link>
      </div>
    </div>
  );
}
