import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Hackathon · Ministerstwo Cyfryzacji</p>
        <h1>Kompas Kompetencji</h1>
        <p className="lead">
          Panel przełożonego: lista procesów ocen, kreator nowego pracownika i
          prowadzenie pierwszej oceny krok po kroku.
        </p>
        <div className="actions">
          {user ? (
            <Link className="btn btn-primary" to="/dashboard">
              Lista procesów
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/login">
              Zaloguj się jako przełożony
            </Link>
          )}
        </div>
      </header>

      <section className="cards">
        <article className="card card-blue">
          <h2>Lista procesów</h2>
          <p>Pracownik, etap, terminy, status terminowości, postęp.</p>
        </article>
        <article className="card card-purple">
          <h2>Kreator</h2>
          <p>Dane → kwalifikacja → służba → role → terminy → utwórz.</p>
        </article>
        <article className="card card-green">
          <h2>Tylko przełożeni</h2>
          <p>Pracownik jest obiektem w procesie, bez konta.</p>
        </article>
      </section>
    </div>
  );
}
