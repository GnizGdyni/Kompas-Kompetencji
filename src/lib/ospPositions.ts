/**
 * Nazwy stanowisk z formularza OSP (przykłady MC + typowe stanowiska SC).
 * Można wybrać z listy albo wpisać własną nazwę.
 */

/** Przykładowe OSP z paczki konkursowej — szybkie uzupełnienie danych. */
export type OspPreset = {
  id: string;
  symbol: string;
  jobTitle: string;
  orgUnit: string;
  label: string;
};

export const OSP_PRESETS: OspPreset[] = [
  {
    id: "dc-wzksoc-6",
    symbol: "DC WZKSOiC 6",
    jobTitle: "starszy specjalista",
    orgUnit:
      "Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa",
    label: "DC WZKSOiC 6 — starszy specjalista",
  },
  {
    id: "dsi-wwi-5",
    symbol: "DSI WWI 5",
    jobTitle: "radca",
    orgUnit:
      "Departament Rozwoju i Bezpieczeństwa Sztucznej Inteligencji / Wydział Wspierania Innowacyjności",
    label: "DSI WWI 5 — radca",
  },
  {
    id: "dwm-wkam-1",
    symbol: "DWM WKAM 1",
    jobTitle: "naczelnik wydziału",
    orgUnit:
      "Departament Współpracy Międzynarodowej / Wydział Koordynacji Aktywności Międzynarodowych",
    label: "DWM WKAM 1 — naczelnik wydziału",
  },
];

/**
 * Nazwy stanowisk pracy (pole „NAZWA STANOWISKA PRACY” w OSP).
 * Zawiera przykłady z materiałów + typowe stanowiska służby cywilnej.
 */
export const OSP_JOB_TITLES: string[] = [
  "asystent",
  "referent",
  "starszy referent",
  "specjalista",
  "starszy specjalista",
  "główny specjalista",
  "ekspert",
  "starszy ekspert",
  "główny ekspert",
  "radca",
  "starszy radca",
  "główny radca",
  "kierownik",
  "zastępca naczelnika wydziału",
  "naczelnik wydziału",
  "zastępca dyrektora",
  "dyrektor",
  "główny księgowy",
  "audytor wewnętrzny",
  "radca prawny",
];

export function findOspPreset(id: string): OspPreset | undefined {
  return OSP_PRESETS.find((p) => p.id === id);
}
