import { groqHeaders } from "./groqClient";
import type { PeriodicSheet } from "./periodicEvaluation";
import {
  findOspPresetByJobAndUnit,
  type OspPreset,
} from "./ospPositions";

/** Proxy Vite → Groq (bez CORS i bez klucza w przeglądarce). */
const GROQ_URL = "/api/groq/chat/completions";
export const GROQ_MODEL_DEFAULT = "openai/gpt-oss-20b";

export type CriteriaCandidate = { code: string; name: string };

export type CriteriaSuggestion = {
  codes: string[];
  rationale: string;
  sources: string[];
  model: string;
};

/** Frazy z OSP / zadań → kody kompetencji (gdy są na liście kandydatów). */
const OSP_CODE_HINTS: { needles: string[]; code: string; label: string }[] = [
  {
    needles: ["myślenie analityczne", "myslenie analityczne", "analiza i dokonuje oceny"],
    code: "myslenie_analityczne",
    label: "myślenie analityczne",
  },
  {
    needles: ["kreatywność", "kreatywnosc"],
    code: "kreatywnosc",
    label: "kreatywność",
  },
  {
    needles: [
      "radzenie sobie w sytuacjach kryzysowych",
      "zarządzania kryzysowego",
      "zarzadzania kryzysowego",
      "sytuacje kryzysowe",
      "reagowania na zagrożenia",
    ],
    code: "radzenie_sobie_w_sytuacjach_kryzysowych",
    label: "radzenie sobie w sytuacjach kryzysowych",
  },
  {
    needles: ["negocjowanie", "negocjac"],
    code: "negocjowanie",
    label: "negocjowanie",
  },
  {
    needles: ["wystąpienia publiczne", "wystapienia publiczne", "konferencje, kongresy"],
    code: "wystapienia_publiczne",
    label: "wystąpienia publiczne",
  },
  {
    needles: ["orientacja na klienta", "interesanta"],
    code: "orientacja_na_klienta",
    label: "orientacja na klienta/interesanta",
  },
  {
    needles: ["zarządzanie strategiczne", "zarzadzanie strategiczne", "polityki międzynarodowej"],
    code: "zarzadzanie_strategiczne",
    label: "zarządzanie strategiczne",
  },
  {
    needles: ["zarządzanie ludźmi", "zarzadzanie ludzmi", "kierowanie zespołem", "nadzorowanie realizacji"],
    code: "zarzadzanie_ludzmi",
    label: "zarządzanie ludźmi",
  },
  {
    needles: ["podejmowanie decyzji", "odpowiedzialność"],
    code: "podejmowanie_decyzji",
    label: "podejmowanie decyzji i odpowiedzialność",
  },
  {
    needles: [
      "wykorzystywanie wiedzy",
      "doskonalenie zawodowe",
      "wiedza i doskonalenie",
    ],
    code: "wiedza",
    label: "wykorzystywanie wiedzy i doskonalenie zawodowe",
  },
  {
    needles: ["organizacja pracy", "orientacja na osiąganie celów", "orientacja na cele"],
    code: "organizacja",
    label: "organizacja pracy i orientacja na cele",
  },
  {
    needles: ["współpraca", "wspolpraca"],
    code: "wspolpraca",
    label: "współpraca",
  },
  {
    needles: ["komunikacja"],
    code: "komunikacja",
    label: "komunikacja",
  },
  {
    needles: ["rzetelność", "rzetelnosc"],
    code: "rzetelnosc",
    label: "rzetelność",
  },
];

function normalizePl(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function loadOspFullText(preset: OspPreset): Promise<string | null> {
  try {
    const res = await fetch(preset.textFile);
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 6000);
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model nie zwrócił poprawnego JSON.");
  }
}

function resolveCandidateToken(
  token: string,
  candidates: CriteriaCandidate[],
): string | null {
  const raw = token.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();
  const byCode = candidates.find((c) => c.code.toLowerCase() === t);
  if (byCode) return byCode.code;
  const byNameExact = candidates.find((c) => c.name.toLowerCase() === t);
  if (byNameExact) return byNameExact.code;
  const byNameLoose = candidates.find((c) => {
    const n = c.name.toLowerCase();
    return n.includes(t) || t.includes(n);
  });
  return byNameLoose?.code ?? null;
}

function normalizeCodes(
  raw: unknown,
  candidates: CriteriaCandidate[],
): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(candidates.map((c) => c.code));
  const out: string[] = [];
  for (const item of raw) {
    const resolved = resolveCandidateToken(String(item), candidates);
    if (resolved && allowed.has(resolved) && !out.includes(resolved)) {
      out.push(resolved);
    }
  }
  return out.slice(0, 3);
}

/**
 * Deterministyczne dopasowanie: kompetencje miękkie + frazy z OSP → kody z listy.
 * Działa nawet gdy model zwróci pustą listę.
 */
export function matchOspToCandidates(input: {
  ospText: string;
  softHint?: string;
  candidates: CriteriaCandidate[];
  mandatoryCodes: Set<string>;
}): { codes: string[]; sources: string[] } {
  const hay = normalizePl(
    [input.softHint || "", input.ospText].filter(Boolean).join("\n"),
  );
  const allowed = new Map(input.candidates.map((c) => [c.code, c]));
  const codes: string[] = [];
  const sources: string[] = [];

  // 1) Najpierw soft competencies z OSP (najwyższa pewność)
  const softNorm = normalizePl(input.softHint || "");
  if (softNorm) {
    for (const hint of OSP_CODE_HINTS) {
      if (codes.length >= 3) break;
      if (input.mandatoryCodes.has(hint.code)) continue;
      if (!allowed.has(hint.code)) continue;
      if (codes.includes(hint.code)) continue;
      const hit = hint.needles.some((n) => softNorm.includes(normalizePl(n)));
      if (hit) {
        codes.push(hint.code);
        sources.push(`OSP kompetencje miękkie → ${hint.label} (${hint.code})`);
      }
    }
  }

  // 2) Uzupełnij z celów/zadań OSP
  for (const hint of OSP_CODE_HINTS) {
    if (codes.length >= 3) break;
    if (input.mandatoryCodes.has(hint.code)) continue;
    if (!allowed.has(hint.code)) continue;
    if (codes.includes(hint.code)) continue;
    const hit = hint.needles.some((n) => hay.includes(normalizePl(n)));
    if (hit) {
      codes.push(hint.code);
      sources.push(`OSP treść → ${hint.label} (${hint.code})`);
    }
  }

  // 3) Bezpośrednie porównanie nazw kandydatów z tekstem OSP
  for (const c of input.candidates) {
    if (codes.length >= 3) break;
    if (input.mandatoryCodes.has(c.code)) continue;
    if (codes.includes(c.code)) continue;
    const nameNorm = normalizePl(c.name);
    if (nameNorm.length >= 8 && hay.includes(nameNorm)) {
      codes.push(c.code);
      sources.push(`OSP zawiera nazwę kompetencji „${c.name}”`);
    }
  }

  return { codes: codes.slice(0, 3), sources };
}

function mergeCodes(
  primary: string[],
  secondary: string[],
  max = 3,
): string[] {
  const out = [...primary];
  for (const c of secondary) {
    if (out.length >= max) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, max);
}

/**
 * Sugeruje max 3 kryteria dodatkowe na podstawie treści OSP + listy kandydatów.
 * Lokalne mapowanie OSP ma pierwszeństwo; AI uzupełnia / uzasadnia.
 */
export async function suggestExtraCriteria(input: {
  jobTitle: string;
  orgUnit?: string | null;
  sheet: PeriodicSheet;
  mandatory: CriteriaCandidate[];
  candidates: CriteriaCandidate[];
}): Promise<CriteriaSuggestion> {
  const model =
    (import.meta.env.VITE_GROQ_MODEL as string | undefined) ||
    GROQ_MODEL_DEFAULT;

  if (input.candidates.length === 0) {
    return {
      codes: [],
      rationale: "Brak dostępnych kryteriów dodatkowych do wyboru.",
      sources: [],
      model,
    };
  }

  const mandatoryCodes = new Set(input.mandatory.map((c) => c.code));
  const preset = findOspPresetByJobAndUnit(
    input.jobTitle,
    input.orgUnit ?? null,
  );
  const fullText = preset ? await loadOspFullText(preset) : null;
  const ospCorpus = [
    preset?.softCompetenciesHint,
    preset?.purpose,
    preset?.ospExcerpt,
    fullText,
  ]
    .filter(Boolean)
    .join("\n");

  const local = matchOspToCandidates({
    ospText: ospCorpus,
    softHint: preset?.softCompetenciesHint,
    candidates: input.candidates,
    mandatoryCodes,
  });

  const ospBlock = fullText
    ? `PEŁNY TEKST OSP (skrócony):\n${fullText}`
    : preset
      ? `SKRÓT OSP (${preset.symbol} — ${preset.jobTitle}):\n${preset.ospExcerpt}\nKomórka: ${preset.orgUnit}\nKompetencje miękkie z OSP: ${preset.softCompetenciesHint}`
      : `Brak dopasowanego pliku OSP. Stanowisko: ${input.jobTitle}. Komórka: ${input.orgUnit || "—"}.`;

  const candidateBlock = input.candidates
    .map((c) => `- code="${c.code}" | name="${c.name}"`)
    .join("\n");

  const localHint =
    local.codes.length > 0
      ? `Lokalne dopasowanie z OSP (preferuj, możesz uzupełnić do 3): ${local.codes.join(", ")}`
      : "Lokalne dopasowanie nie znalazło kodów — dobierz rozsądnie z listy na podstawie zadań OSP.";

  const system = [
    "Jesteś asystentem przełożonego w służbie cywilnej (Kompas Kompetencji).",
    "Dobierasz max 3 kryteria dodatkowe do oceny okresowej WYŁĄCZNIE z listy kandydatów.",
    "Kompetencje miękkie wskazane w OSP, które są na liście kandydatów, MUSZĄ trafić do codes (o ile nie są obowiązkowe).",
    "ZADANIA z OSP mogą uzasadnić dodatkowe kody (np. zarządzanie kryzysowe → radzenie_sobie_w_sytuacjach_kryzysowych).",
    "ZASADY:",
    "1) codes = wyłącznie dokładne code= z listy kandydatów (nie obowiązkowe).",
    "2) Nie wymyślaj kompetencji spoza listy.",
    "3) sources: konkretne fragmenty OSP + wskazane code=.",
    "4) Wolisz 1–3 sensowne dopasowania niż pustą listę, gdy OSP wprost wskazuje kompetencję z listy.",
    'JSON only: {"codes":["kod"],"sources":["krótki fragment OSP"],"uncertain":false}. Bez długiego rationale.',
  ].join(" ");

  const user = [
    `Arkusz: ${input.sheet}`,
    preset
      ? `Dopasowany OSP: ${preset.label} | PDF: ${preset.pdf}`
      : "Brak dopasowanego OSP z katalogu.",
    localHint,
    "",
    ospBlock,
    "",
    "KRYTERIA OBOWIĄZKOWE (pomiń — już są w arkuszu):",
    ...input.mandatory.map((c) => `- ${c.code} (${c.name})`),
    "",
    "KANDYDACI (wybieraj tylko code=):",
    candidateBlock,
  ].join("\n");

  let aiCodes: string[] = [];
  let aiRationale = "";
  let aiSources: string[] = [];
  let usedModel = `lokalne+${model}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: await groqHeaders(),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_completion_tokens: 1800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Groq HTTP ${res.status}${body ? `: ${body.slice(0, 280)}` : ""}`,
      );
    }

    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string | null; reasoning?: string | null };
      }[];
    };
    const message = data.choices?.[0]?.message;
    const content =
      message?.content?.trim() || message?.reasoning?.trim() || "";
    if (!content) throw new Error("Pusta odpowiedź modelu.");

    const parsed = extractJsonObject(content) as {
      codes?: unknown;
      rationale?: unknown;
      sources?: unknown;
    };
    aiCodes = normalizeCodes(parsed.codes, input.candidates).filter(
      (c) => !mandatoryCodes.has(c),
    );
    aiSources = Array.isArray(parsed.sources)
      ? parsed.sources.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : [];
    aiRationale =
      typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
  } catch (e) {
    // Lokalne dopasowanie i tak wraca — AI jest bonusem
    if (!local.codes.length) {
      throw e instanceof Error ? e : new Error("Nie udało się pobrać sugestii AI");
    }
    usedModel = "lokalne (OSP)";
    aiRationale =
      "Sugestia z bezpośredniego dopasowania kompetencji miękkich / treści OSP (AI niedostępne).";
  }

  // Lokalne soft-skills mają pierwszeństwo; AI uzupełnia do 3
  const codes = mergeCodes(local.codes, aiCodes, 3);
  const sources = [
    ...(preset ? [`OSP PDF: ${preset.pdf} (${preset.symbol})`] : []),
    ...local.sources,
    ...aiSources,
  ].slice(0, 12);

  let rationale = aiRationale;
  if (!codes.length) {
    rationale =
      rationale ||
      "Nie znaleziono kompetencji dodatkowych z listy odpowiadających OSP (wiele wskazanych w OSP jest już obowiązkowych w arkuszu).";
  } else if (!rationale) {
    rationale =
      local.codes.length > 0
        ? `Bezpośrednie dopasowanie z OSP: ${local.codes.join(", ")}.`
        : "Dobór na podstawie zadań i kompetencji miękkich z OSP.";
  } else if (local.codes.length > 0 && !local.codes.every((c) => aiCodes.includes(c))) {
    rationale = `${rationale} Uzupełniono o bezpośrednie dopasowanie z OSP: ${local.codes.join(", ")}.`;
  }

  return { codes, rationale, sources, model: usedModel };
}
