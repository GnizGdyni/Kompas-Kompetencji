import { Link } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";

export function LegalInfoPage() {
  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-inner">
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
          <Link className="text-link" to="/dashboard">
            ← Wróć do procesów
          </Link>
        </div>
      </header>

      <main className="page-main legal-page">
        <h1 className="page-title">Polityka prywatności</h1>

        <div className="panel legal-panel">
          <p>
            Aplikacja <strong>Kompas Kompetencji</strong> jest narzędziem
            wewnętrznym Ministerstwa Cyfryzacji służącym do obsługi procesów
            pierwszej oceny i oceny okresowej.
          </p>
          <h2>Administrator danych</h2>
          <p>
            Administratorem danych osobowych przetwarzanych w aplikacji jest
            Minister Cyfryzacji.
          </p>
          <h2>Zakres i cel</h2>
          <p>
            Przetwarzane są dane niezbędne do przeprowadzenia oceny
            (identyfikacja pracownika, stanowisko, komórka organizacyjna,
            notatki i wyniki oceny) — w celu realizacji obowiązków pracodawcy w
            służbie cywilnej.
          </p>
          <h2>Pliki cookies</h2>
          <p>
            Aplikacja wykorzystuje pliki niezbędne do utrzymania sesji
            logowania. Nie stosujemy reklamowych plików cookies.
          </p>
          <p className="muted">
            Treść należy doprecyzować z IOD ministerstwa przed wdrożeniem
            produkcyjnym.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
