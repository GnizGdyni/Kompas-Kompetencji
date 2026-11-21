import type { PeriodicSheet } from "./periodicEvaluation";
import { OSP_PRESETS } from "./ospPositions";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Szybki model free-tier Groq — wystarczy do sugestii kryteriów / asystenta. */
export const GROQ_MODEL_DEFAULT = "openai/gpt-oss-20b";

export type CriteriaCandidate = { code: string; name: string };

export type CriteriaSuggestion = {
  codes: string[];
  rationale: string;
  model: string;
};

function ospContextForJob(jobTitle: string, orgUnit: string | null): string {
  const jt = jobTitle.trim().toLowerCase();
  const match = OSP_PRESETS.find((p) => p.jobTitle.toLowerCase() === jt);
  if (match) {
    return [
      `Przykładowe OSP: ${match.label}`,
      `Symbol: ${match.symbol}`,
      `Komórka z OSP (referencyjna): ${match.orgUnit}`,
    ].join("\n");
  }
  return [
    `Stanowisko: ${jobTitle}`,
    orgUnit ? `Komórka organizacyjna: ${orgUnit}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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

/**
 * Sugeruje max 3 kryteria dodatkowe (spośród kandydatów) na podstawie OSP / stanowiska.
 */
export async function suggestExtraCriteria(input: {
  jobTitle: string;
  orgUnit?: string | null;
  sheet: PeriodicSheet;
  mandatory: CriteriaCandidate[];
  candidates: CriteriaCandidate[];
}): Promise<CriteriaSuggestion> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  const model =
    (import.meta.env.VITE_GROQ_MODEL as string | undefined) ||
    GROQ_MODEL_DEFAULT;

  if (!apiKey) {
    throw new Error(
      "Brak VITE_GROQ_API_KEY w pliku .env — dodaj klucz Groq i zrestartuj Vite.",
    );
  }
  if (input.candidates.length === 0) {
    return {
      codes: [],
      rationale: "Brak dostępnych kryteriów dodatkowych do wyboru.",
      model,
    };
  }

  const allowed = new Set(input.candidates.map((c) => c.code));
  const system = [
    "Jesteś asystentem przełożonego w służbie cywilnej (Kompas Kompetencji).",
    "Na podstawie opisu stanowiska (OSP) dobierasz kryteria dodatkowe do oceny okresowej.",
    "Wybierz od 1 do 3 kodów WYŁĄCZNIE z listy kandydatów.",
    "Nie powtarzaj kryteriów obowiązkowych.",
    "Odpowiadasz TYLKO poprawnym JSON: {\"codes\":[\"kod1\",\"kod2\"],\"rationale\":\"krótko po polsku\"}.",
  ].join(" ");

  const user = [
    `Arkusz: ${input.sheet}`,
    ospContextForJob(input.jobTitle, input.orgUnit ?? null),
    "",
    "Kryteria obowiązkowe (już ustalone, nie wybieraj ponownie):",
    ...input.mandatory.map((c) => `- ${c.code}: ${c.name}`),
    "",
    "Kandydaci na kryteria dodatkowe (wybierz max 3 kody):",
    ...input.candidates.map((c) => `- ${c.code}: ${c.name}`),
  ].join("\n");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Groq HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Pusta odpowiedź modelu.");

  const parsed = extractJsonObject(content) as {
    codes?: unknown;
    rationale?: unknown;
  };
  const rawCodes = Array.isArray(parsed.codes) ? parsed.codes : [];
  const codes = [
    ...new Set(
      rawCodes
        .map((c) => String(c))
        .filter((c) => allowed.has(c)),
    ),
  ].slice(0, 3);

  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? parsed.rationale.trim()
      : codes.length
        ? "Sugestia na podstawie stanowiska / OSP."
        : "Model nie wskazał dopasowanych kryteriów.";

  return { codes, rationale, model };
}
