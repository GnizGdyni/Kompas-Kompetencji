/** Pierwsza litera duża (stanowisko w tabeli). */
export function capitalizeFirst(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  return s.charAt(0).toLocaleUpperCase("pl-PL") + s.slice(1);
}

/** Skraca nazwę komórki org. do czytelnej formy w tabeli. */
export function formatOrgUnitShort(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";

  return s
    .replace(/\bDepartament(u|em|cie|owi)?\b/gi, "Dep.")
    .replace(/\bWydział(u|em|owi|e)?\b/gi, "Wyd.")
    .replace(/\bBiuro\b/gi, "B.")
    .replace(/\bSekcja\b/gi, "Sek.")
    .replace(/\s*\/\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
