/** Sugestia AI: ogólne wnioski — nad czym warto popracować. */

import { parseModelJson } from "./parseModelJson";

const GROQ_URL = "/api/groq/chat/completions";
export const GROQ_MODEL_DEFAULT = "openai/gpt-oss-20b";

export type DevelopmentAction = {
  /** Zawsze „obszar” — ogólny kierunek rozwoju. */
  kind: "obszar";
  competencyCode?: string;
  competencyName?: string;
  /** Krótko: nad czym popracować (1–2 zdania, ogólnie). */
  action: string;
};

export type DevelopmentSuggestion = {
  actions: DevelopmentAction[];
  /** Gotowy tekst do wklejenia w pole „Wnioski rozwojowe”. */
  text: string;
  weakCompetencies: { code: string; name: string; score: number }[];
  model: string;
  emptyReason?: string;
};

export type ScoredCompetency = {
  code: string;
  name: string;
  score: number;
};

/** Wybiera 2–3 najsłabsze ocenione kompetencje. */
export function pickWeakCompetencies(
  scored: ScoredCompetency[],
  max = 3,
): ScoredCompetency[] {
  const withScore = scored
    .filter((c) => Number.isFinite(c.score))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "pl"));
  if (!withScore.length) return [];

  const lowest = withScore[0].score;
  const near = withScore.filter((c) => c.score <= lowest + 2);
  return (near.length >= 2 ? near : withScore).slice(0, max);
}

function formatActionsText(actions: DevelopmentAction[]): string {
  const intro =
    "Na podstawie oceny warto szczególnie popracować nad następującymi obszarami:";
  const bullets = actions
    .map((a, i) => {
      const name = a.competencyName ? `„${a.competencyName}”` : "ten obszar";
      return `${i + 1}. ${name} — ${a.action}`;
    })
    .join("\n");
  return `${intro}\n${bullets}`;
}

/** Lokalny fallback — ogólne wskazanie obszarów. */
export function developmentFromWeakLocal(
  weak: ScoredCompetency[],
  jobTitle: string,
): DevelopmentAction[] {
  const job = jobTitle || "stanowisku";
  return weak.slice(0, 3).map((c) => ({
    kind: "obszar" as const,
    competencyCode: c.code,
    competencyName: c.name,
    action: `Warto wzmocnić tę kompetencję w codziennej pracy na stanowisku ${job} — to obecnie słabszy obszar w arkuszu.`,
  }));
}

/**
 * Ogólnie wskazuje, nad czym pracownik powinien popracować
 * (na podstawie najniższych ocen cząstkowych).
 */
export async function suggestDevelopmentActions(input: {
  jobTitle: string;
  orgUnit?: string | null;
  evaluationType: "first" | "periodic" | string;
  verdict?: "positive" | "negative" | "" | null;
  scoredCompetencies: ScoredCompetency[];
  justification?: string | null;
  notesSummary?: string | null;
}): Promise<DevelopmentSuggestion> {
  const model =
    (import.meta.env.VITE_GROQ_MODEL as string | undefined) ||
    GROQ_MODEL_DEFAULT;

  const weak = pickWeakCompetencies(input.scoredCompetencies, 3);
  if (!weak.length) {
    return {
      actions: [],
      text: "",
      weakCompetencies: [],
      model,
      emptyReason:
        "Uzupełnij oceny kompetencji w arkuszu — wtedy AI wskaże, nad czym warto popracować.",
    };
  }

  const local = developmentFromWeakLocal(weak, input.jobTitle);
  const localText = formatActionsText(local);

  const system = [
    "Jesteś asystentem przełożonego w służbie cywilnej (Kompas Kompetencji).",
    "Piszesz OGÓLNE wnioski rozwojowe: nad czym pracownik powinien popracować.",
    "NIE proponuj konkretnych szkoleń, kursów, mentoringu ani planu zadań.",
    "Dla każdej słabej kompetencji: 1–2 zdania po polsku, spokojnym tonem urzędowym.",
    "Odnieś się do nazwy kompetencji i stanowiska. Bez ocen liczbowych w tekście działania.",
    "Nie wymyślaj faktów o pracowniku spoza kontekstu.",
    'JSON only: {"actions":[{"competencyCode":"...","competencyName":"...","action":"..."}]}',
  ].join(" ");

  const user = [
    `Stanowisko: ${input.jobTitle}`,
    `Komórka: ${input.orgUnit || "—"}`,
    `Typ oceny: ${input.evaluationType === "periodic" ? "okresowa" : "pierwsza"}`,
    input.verdict
      ? `Werdykt: ${input.verdict === "positive" ? "pozytywna" : "negatywna"}`
      : "",
    "",
    "SŁABSZE KOMPETENCJE (nad tym popracować):",
    ...weak.map((c) => `- ${c.code} — ${c.name}: ${c.score} pkt`),
    "",
    "WSZYSTKIE OCENY CZĄSTKOWE:",
    ...input.scoredCompetencies
      .slice()
      .sort((a, b) => a.score - b.score)
      .map((c) => `- ${c.code} — ${c.name}: ${c.score} pkt`),
    input.justification?.trim()
      ? `\nUzasadnienie przełożonego:\n${input.justification.trim().slice(0, 1200)}`
      : "",
    input.notesSummary?.trim()
      ? `\nKontekst z uwag (skrót):\n${input.notesSummary.trim().slice(0, 1500)}`
      : "",
    "",
    "Zwróć 2 lub 3 actions — po jednym obszarze na słabą kompetencję. Ton ogólny.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const payloadBase = {
    model,
    temperature: 0.2,
    max_completion_tokens: 900,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  try {
    let res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payloadBase,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 400) {
        res = await fetch(GROQ_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadBase),
        });
        if (!res.ok) {
          const body2 = await res.text().catch(() => "");
          throw new Error(
            `Groq HTTP ${res.status}${body2 ? `: ${body2.slice(0, 280)}` : ""}`,
          );
        }
      } else {
        throw new Error(
          `Groq HTTP ${res.status}${body ? `: ${body.slice(0, 280)}` : ""}`,
        );
      }
    }

    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string | null; reasoning?: string | null };
      }[];
    };
    const content =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning ||
      "";
    const parsed = parseModelJson(content) as {
      actions?: {
        competencyCode?: string;
        competencyName?: string;
        action?: string;
      }[];
    };

    const weakByCode = new Map(weak.map((w) => [w.code, w]));

    const actions: DevelopmentAction[] = (parsed.actions || [])
      .map((raw) => {
        const action = (raw.action || "").trim();
        if (!action) return null;
        const code = (raw.competencyCode || "").trim();
        const fromWeak = code ? weakByCode.get(code) : undefined;
        return {
          kind: "obszar" as const,
          competencyCode: fromWeak?.code || code || undefined,
          competencyName:
            fromWeak?.name ||
            (raw.competencyName || "").trim() ||
            undefined,
          action: action.length > 350 ? `${action.slice(0, 347)}…` : action,
        } satisfies DevelopmentAction;
      })
      .filter((a): a is DevelopmentAction => a != null)
      .slice(0, 3);

    if (!actions.length) {
      return {
        actions: local,
        text: localText,
        weakCompetencies: weak,
        model,
      };
    }

    return {
      actions,
      text: formatActionsText(actions),
      weakCompetencies: weak,
      model,
    };
  } catch {
    return {
      actions: local,
      text: localText,
      weakCompetencies: weak,
      model: `${model} (lokalnie)`,
    };
  }
}
