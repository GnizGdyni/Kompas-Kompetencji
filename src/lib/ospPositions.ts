/**
 * Katalog OSP z paczki MC (PDF w /public/osp).
 * Stanowisko + komórka pochodzą z opisów stanowisk pracy.
 */

export type OspPreset = {
  id: string;
  symbol: string;
  jobTitle: string;
  orgUnit: string;
  label: string;
  pdf: string;
  textFile: string;
  suggestedSheet: "B" | "C";
  managesPeople: boolean;
  purpose: string;
  softCompetenciesHint: string;
  /** Skrót OSP dla promptu AI (cel + zadania + kompetencje miękkie z OSP). */
  ospExcerpt: string;
};

export const OSP_PRESETS: OspPreset[] = [
  {
    id: "dc-wzksoc-6",
    symbol: "DC WZKSOiC 6",
    jobTitle: "starszy specjalista",
    orgUnit:
      "Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa",
    label: "DC WZKSOiC 6 — starszy specjalista",
    pdf: "/osp/starszy_specjalista.pdf",
    textFile: "/osp/dc-wzksoc-6.txt",
    suggestedSheet: "C",
    managesPeople: false,
    purpose:
      "Prowadzenie spraw dotyczących zarządzania kryzysowego w cyberprzestrzeni pozostających w zakresie ministra właściwego ds. informatyzacji.",
    softCompetenciesHint:
      "organizacja pracy i orientacja na osiąganie celów; współpraca; myślenie analityczne; wykorzystywanie wiedzy i doskonalenie zawodowe",
    ospExcerpt:
      "CEL: Prowadzenie spraw dotyczących zarządzania kryzysowego w cyberprzestrzeni. ZADANIA: udział w dokumentacji zarządzania kryzysowego (m.in. krajowy plan reagowania); zadania NATO/UE/ONZ w cyber; współpraca z CSIRT; integracja systemów cyber i zarządzania kryzysowego; ocena infrastruktury krytycznej; kontrole podmiotów krytycznych. KOMPETENCJE MIĘKKIE Z OSP: organizacja pracy i orientacja na cele, współpraca, myślenie analityczne, wykorzystywanie wiedzy i doskonalenie zawodowe. Brak podległych pracowników.",
  },
  {
    id: "dsi-wwi-5",
    symbol: "DSI WWI 5",
    jobTitle: "radca",
    orgUnit:
      "Departament Rozwoju i Bezpieczeństwa Sztucznej Inteligencji / Wydział Wspierania Innowacyjności",
    label: "DSI WWI 5 — radca",
    pdf: "/osp/radca.pdf",
    textFile: "/osp/dsi-wwi-5.txt",
    suggestedSheet: "C",
    managesPeople: false,
    purpose:
      "Wsparcie merytoryczne rozwoju innowacyjnych rozwiązań opartych na SI: zgodność z prawem i identyfikacja barier innowacyjności.",
    softCompetenciesHint:
      "organizacja pracy i orientacja na osiąganie celów; wykorzystywanie wiedzy i doskonalenie zawodowe; współpraca",
    ospExcerpt:
      "CEL: wsparcie rozwoju innowacji opartych na SI, zgodność z prawem, bariery innowacyjności. ZADANIA: analiza prawa PL/UE i orzecznictwa w obszarze SI; opinie i wyjaśnienia stosowania przepisów SI; projekty informacji/stanowisk Komisji; analiza barier prawnych; odpowiedzi na pisma. KOMPETENCJE MIĘKKIE Z OSP: organizacja pracy i orientacja na cele, wykorzystywanie wiedzy i doskonalenie zawodowe, współpraca. Brak podległych pracowników.",
  },
  {
    id: "dwm-wkam-1",
    symbol: "DWM WKAM 1",
    jobTitle: "naczelnik wydziału",
    orgUnit:
      "Departament Współpracy Międzynarodowej / Wydział Koordynacji Aktywności Międzynarodowych",
    label: "DWM WKAM 1 — naczelnik wydziału",
    pdf: "/osp/naczelnik_wydzia_u.pdf",
    textFile: "/osp/dwm-wkam-1.txt",
    suggestedSheet: "B",
    managesPeople: true,
    purpose:
      "Organizacja aktywności międzynarodowej kierownictwa MC, koordynacja spraw budżetowych Departamentu oraz umów biletowych/delegacji.",
    softCompetenciesHint:
      "zarządzanie ludźmi; podejmowanie decyzji i odpowiedzialność; wykorzystywanie wiedzy i doskonalenie zawodowe; organizacja pracy i orientacja na cele; współpraca",
    ospExcerpt:
      "CEL: organizacja wizyt międzynarodowych kierownictwa MC; koordynacja budżetu/dotacji DWM; umowy biletowe i delegacje. ZADANIA: kierowanie zespołem (5–9 osób) — planowanie, delegowanie, motywowanie; nadzór nad wizytami zagranicznymi; budżet i decyzje administracyjne; materiały tezowe; wydarzenia międzynarodowe; zamówienia publiczne. KOMPETENCJE MIĘKKIE Z OSP: zarządzanie ludźmi, podejmowanie decyzji i odpowiedzialność, wykorzystywanie wiedzy, organizacja pracy i orientacja na cele, współpraca. Stanowisko z kierowaniem ludźmi → arkusz B.",
  },
];

/** Unikalne nazwy stanowisk występujące w OSP z paczki. */
export const OSP_JOB_TITLES: string[] = [
  ...new Set(OSP_PRESETS.map((p) => p.jobTitle)),
];

export function findOspPreset(id: string): OspPreset | undefined {
  return OSP_PRESETS.find((p) => p.id === id);
}

export function findOspPresetByJobAndUnit(
  jobTitle: string | null | undefined,
  orgUnit: string | null | undefined,
): OspPreset | undefined {
  const jt = (jobTitle || "").trim().toLowerCase();
  const ou = (orgUnit || "").trim().toLowerCase();
  if (!jt) return undefined;
  const exact = OSP_PRESETS.find(
    (p) =>
      p.jobTitle.toLowerCase() === jt &&
      (!ou || p.orgUnit.toLowerCase() === ou || ou.includes(p.orgUnit.toLowerCase().slice(0, 40))),
  );
  if (exact) return exact;
  return OSP_PRESETS.find((p) => p.jobTitle.toLowerCase() === jt);
}
