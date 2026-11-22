/** Sugestia AI: plusy/minusy vs pełny model kompetencji + wskaźniki (małe pytania). */

import { parseModelJson } from "./parseModelJson";

const GROQ_URL = "/api/groq/chat/completions";
export const GROQ_MODEL_DEFAULT = "openai/gpt-oss-20b";

export type EvidenceSourceKind =
  | "sprawozdanie"
  | "notatka"
  | "uwaga";

export type CompetencyEvidence = {
  code: string;
  name: string;
  lean: "plus" | "minus" | "neutral" | "brak_danych";
  /** 1–2 zdania, ścisłe fakty + cytat/odniesienie. */
  hint: string;
  sources: { kind: EvidenceSourceKind; quote: string }[];
};

export type IndicatorEvidence = {
  indicatorTitle: string;
  competencyCode: string;
  lean: "plus" | "minus" | "neutral" | "brak_danych";
  hint: string;
  sources: { kind: EvidenceSourceKind; quote: string }[];
};

export type EvidenceSuggestion = {
  summaryPlus: CompetencyEvidence[];
  summaryMinus: CompetencyEvidence[];
  byCompetency: Record<string, CompetencyEvidence>;
  byIndicator: Record<string, IndicatorEvidence>;
  sourcesUsed: string[];
  model: string;
  emptyReason?: string;
};

export type EvidenceInputNote = {
  tone: "positive" | "negative";
  subject: string;
  body: string;
  noted_at: string;
};

function buildFactsBlock(input: {
  reportNotes: string | null;
  reportFileName: string | null;
  interviewNotes?: string | null;
  notes: EvidenceInputNote[];
}): { facts: string; labels: string[] } {
  const parts: string[] = [];
  const labels: string[] = [];

  if (input.notes.length > 0) {
    parts.push(
      `[SEKCJA: UWAGI O PRACOWNIKU — ${input.notes.length} wpis(ów); traktuj jako kluczowe fakty]`,
    );
    input.notes.forEach((n, i) => {
      const tag = n.tone === "positive" ? "UWAGA +" : "UWAGA −";
      parts.push(
        `[${tag} #${i + 1} | data ${n.noted_at} | temat: ${n.subject || "—"}]\n${n.body}`,
      );
      labels.push(
        `uwaga ${n.tone === "positive" ? "+" : "−"}: ${n.subject || n.noted_at}`,
      );
    });
  }

  const report = (input.reportNotes || "").trim();
  if (report) {
    parts.push(`[SPRAWOZDANIE — opis/notatka]\n${report}`);
    labels.push("sprawozdanie (opis)");
  }
  if (input.reportFileName) {
    parts.push(
      `[SPRAWOZDANIE — plik: ${input.reportFileName}; treść PDF nieodczytywana — opieraj się na opisie i uwagach]`,
    );
    labels.push(`plik: ${input.reportFileName}`);
  }

  const interview = (input.interviewNotes || "").trim();
  if (interview) {
    parts.push(`[NOTATKI Z ROZMOWY]\n${interview}`);
    labels.push("notatki z rozmowy");
  }

  return { facts: parts.join("\n\n"), labels };
}

/**
 * Mapuje fakty na KAŻDĄ kompetencję arkusza i jej wskaźniki (małe pytania).
 * Zakaz opinii — tylko to, co wynika wprost ze źródeł.
 */
export async function suggestEvidenceFromFacts(input: {
  jobTitle: string;
  reportNotes: string | null;
  reportFileName: string | null;
  interviewNotes?: string | null;
  notes: EvidenceInputNote[];
  competencies: {
    code: string;
    name: string;
    indicators: { id: string; title: string }[];
  }[];
}): Promise<EvidenceSuggestion> {
  const model =
    (import.meta.env.VITE_GROQ_MODEL as string | undefined) ||
    GROQ_MODEL_DEFAULT;

  const { facts, labels } = buildFactsBlock(input);
  const hasUwagi = input.notes.length > 0;
  const hasReport = Boolean(input.reportNotes?.trim());
  const hasInterview = Boolean(input.interviewNotes?.trim());
  if (!hasUwagi && !hasReport && !hasInterview) {
    return {
      summaryPlus: [],
      summaryMinus: [],
      byCompetency: {},
      byIndicator: {},
      sourcesUsed: labels,
      model,
      emptyReason:
        "Brak tekstu do analizy. Dodaj uwagi o pracowniku i/lub opis sprawozdania.",
    };
  }

  const allCodes = input.competencies.map((c) => c.code);
  const allIndIds = input.competencies.flatMap((c) =>
    c.indicators.map((i) => i.id),
  );
  const indCount = allIndIds.length;

  const system = [
    "Jesteś asystentem przełożonego w służbie cywilnej (Kompas Kompetencji).",
    "Porównujesz FAKTY z pełnym MODELEM KOMPETENCJI tej oceny: każda kompetencja + każde małe pytanie (wskaźnik).",
    "PRIORYTET ŹRÓDEŁ: 1) UWAGI o pracowniku, 2) opis sprawozdania, 3) notatki z rozmowy.",
    "ZASADY:",
    "1) Nie wymyślaj faktów. Hint tylko gdy fakt dotyczy treści kompetencji/pytania.",
    "2) Przejdź WSZYSTKIE kompetencje z listy (pole competencies) — dla każdej: lean + hint.",
    "3) Przejdź WSZYSTKIE wskaźniki/pytania (pole indicators) — dla każdego id z listy.",
    "4) lean=plus|minus gdy fakt wspiera/osłabia; lean=brak_danych gdy brak dowodu (wtedy hint: „Brak istotnych informacji.”).",
    "5) UWAGI + → zwykle plus; UWAGI − → zwykle minus, jeśli temat pasuje do kompetencji/pytania.",
    "6) sources: kind=uwaga|sprawozdanie|notatka; quote=krótki fragment (puste przy brak_danych).",
    "7) codes i indicator id WYŁĄCZNIE z listy — żadnych nowych.",
    "8) Stringi JSON bez surowych znaków nowej linii.",
    'JSON: {"competencies":[{"code":"...","lean":"plus|minus|neutral|brak_danych","hint":"...","sources":[...]}],"indicators":[{"id":"...","lean":"...","hint":"...","sources":[...]}]}',
  ].join(" ");

  const modelBlock = input.competencies
    .map((c, ci) => {
      const inds = c.indicators
        .map((i, ii) => `    ${ii + 1}. id=${i.id} | pytanie: ${i.title}`)
        .join("\n");
      return `${ci + 1}) ${c.code} — ${c.name}\n   Wskaźniki (małe pytania arkusza):\n${inds || "   (brak)"}`;
    })
    .join("\n\n");

  const user = [
    `Stanowisko: ${input.jobTitle}`,
    `Liczba kompetencji do przejścia: ${input.competencies.length}`,
    `Liczba wskaźników/pytań do przejścia: ${indCount}`,
    "",
    "FAKTY (jedyne źródło prawdy):",
    facts.slice(0, 6000),
    "",
    "MODEL KOMPETENCJI TEJ OCENY (porównaj fakty z KAŻDĄ pozycją):",
    modelBlock,
    "",
    `Wymagane: tablica competencies z dokładnie tymi kodami: ${allCodes.join(", ")}.`,
    `Wymagane: tablica indicators z wszystkimi id wskaźników (${indCount} szt.).`,
  ].join("\n");

  const payloadBase = {
    model,
    temperature: 0.05,
    max_completion_tokens: Math.min(8000, 1800 + indCount * 120),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

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
  const message = data.choices?.[0]?.message;
  const content =
    message?.content?.trim() || message?.reasoning?.trim() || "";
  if (!content) throw new Error("Pusta odpowiedź modelu.");

  let parsed: {
    competencies?: unknown;
    summaryPlus?: unknown;
    summaryMinus?: unknown;
    indicators?: unknown;
  };
  try {
    parsed = parseModelJson(content) as typeof parsed;
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? e.message
        : "Nie udało się odczytać odpowiedzi AI (JSON).",
    );
  }

  const byCode = new Map(input.competencies.map((c) => [c.code, c]));
  const indMeta = new Map<string, { code: string; title: string }>();
  for (const c of input.competencies) {
    for (const ind of c.indicators) {
      indMeta.set(ind.id, { code: c.code, title: ind.title });
    }
  }

  function parseSources(
    raw: unknown,
  ): { kind: EvidenceSourceKind; quote: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { kind: EvidenceSourceKind; quote: string }[] = [];
    for (const s of raw) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      const kindRaw = String(o.kind || "notatka");
      const kind: EvidenceSourceKind =
        kindRaw === "sprawozdanie" || kindRaw === "uwaga"
          ? kindRaw
          : "notatka";
      const quote = String(o.quote || "").trim();
      if (quote) out.push({ kind, quote: quote.slice(0, 280) });
    }
    return out.slice(0, 4);
  }

  function parseLean(raw: unknown): CompetencyEvidence["lean"] {
    const leanRaw = String(raw || "brak_danych");
    if (
      leanRaw === "plus" ||
      leanRaw === "minus" ||
      leanRaw === "neutral" ||
      leanRaw === "brak_danych"
    ) {
      return leanRaw;
    }
    return "brak_danych";
  }

  /** Ujednolicenie pustych / „brak faktów…” podpowiedzi. */
  function normalizeEmptyHint(
    hint: string,
    lean: CompetencyEvidence["lean"],
  ): string {
    if (lean !== "brak_danych") return hint;
    const t = hint.toLowerCase();
    if (
      !hint ||
      t.includes("brak fakt") ||
      t.includes("brak dowod") ||
      t.includes("brak danych") ||
      t.includes("brak informacji") ||
      t.includes("brak istotn") ||
      t.includes("nie znaleziono") ||
      t.includes("brak w źródł")
    ) {
      return "Brak istotnych informacji.";
    }
    return hint;
  }

  const byCompetency: Record<string, CompetencyEvidence> = {};

  // Nowy format: competencies[]
  if (Array.isArray(parsed.competencies)) {
    for (const item of parsed.competencies) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const code = String(o.code || "");
      const meta = byCode.get(code);
      if (!meta) continue;
      const lean = parseLean(o.lean);
      const hint =
        String(o.hint || "").trim().slice(0, 320) ||
        (lean === "brak_danych" ? "Brak istotnych informacji." : "");
      if (!hint) continue;
      byCompetency[code] = {
        code,
        name: meta.name,
        lean,
        hint: normalizeEmptyHint(hint, lean),
        sources: lean === "brak_danych" ? [] : parseSources(o.sources),
      };
    }
  }

  // Stary format: summaryPlus / summaryMinus
  function absorbLegacyList(raw: unknown, forceLean?: "plus" | "minus") {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const code = String(o.code || "");
      const meta = byCode.get(code);
      if (!meta || byCompetency[code]) continue;
      const lean = forceLean ?? parseLean(o.lean);
      const hint = String(o.hint || "").trim().slice(0, 320);
      if (!hint) continue;
      byCompetency[code] = {
        code,
        name: meta.name,
        lean,
        hint: normalizeEmptyHint(hint, lean),
        sources: parseSources(o.sources),
      };
    }
  }
  absorbLegacyList(parsed.summaryPlus, "plus");
  absorbLegacyList(parsed.summaryMinus, "minus");

  // Uzupełnij brakujące kompetencje z listy
  for (const c of input.competencies) {
    if (byCompetency[c.code]) continue;
    byCompetency[c.code] = {
      code: c.code,
      name: c.name,
      lean: "brak_danych",
      hint: "Brak istotnych informacji.",
      sources: [],
    };
  }

  const byIndicator: Record<string, IndicatorEvidence> = {};
  if (Array.isArray(parsed.indicators)) {
    for (const item of parsed.indicators) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = String(o.id || "");
      const meta = indMeta.get(id);
      if (!meta) continue;
      const lean = parseLean(o.lean);
      const hint =
        String(o.hint || "").trim().slice(0, 320) ||
        (lean === "brak_danych" ? "Brak istotnych informacji." : "");
      if (!hint) continue;
      byIndicator[id] = {
        indicatorTitle: meta.title,
        competencyCode: meta.code,
        lean,
        hint: normalizeEmptyHint(hint, lean),
        sources: lean === "brak_danych" ? [] : parseSources(o.sources),
      };
    }
  }

  // Uzupełnij brakujące wskaźniki
  for (const [id, meta] of indMeta) {
    if (byIndicator[id]) continue;
    byIndicator[id] = {
      indicatorTitle: meta.title,
      competencyCode: meta.code,
      lean: "brak_danych",
      hint: "Brak istotnych informacji.",
      sources: [],
    };
  }

  // Jeśli kompetencja ma brak_danych, a wskaźnik ma plus/minus — podnieś kompetencję
  for (const ind of Object.values(byIndicator)) {
    if (ind.lean !== "plus" && ind.lean !== "minus") continue;
    const cur = byCompetency[ind.competencyCode];
    if (!cur || cur.lean === "brak_danych" || cur.lean === "neutral") {
      const comp = byCode.get(ind.competencyCode);
      if (!comp) continue;
      byCompetency[ind.competencyCode] = {
        code: ind.competencyCode,
        name: comp.name,
        lean: ind.lean,
        hint: ind.hint,
        sources: ind.sources,
      };
    }
  }

  const summaryPlus = Object.values(byCompetency).filter(
    (c) => c.lean === "plus",
  );
  const summaryMinus = Object.values(byCompetency).filter(
    (c) => c.lean === "minus",
  );

  return {
    summaryPlus,
    summaryMinus,
    byCompetency,
    byIndicator,
    sourcesUsed: labels,
    model,
  };
}
