import { Link } from "react-router-dom";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong>Kompas Kompetencji</strong>
          <span>Ministerstwo Cyfryzacji · Biuro Dyrektora Generalnego</span>
        </div>
        <nav className="site-footer-nav" aria-label="Stopka">
          <Link to="/prywatnosc">Polityka prywatności</Link>
        </nav>
        <p className="site-footer-meta">© {year} Ministerstwo Cyfryzacji</p>
      </div>
    </footer>
  );
}
