import { supabase } from "./supabase";

export type LegalStage =
  | "GENERAL"
  | "ALL_STAGES"
  | "INITIAL_TALK"
  | "REPORT"
  | "FINAL_EVALUATION"
  | "PERIODIC";

export type LegalDocument = {
  id: string;
  code: string;
  title: string;
  stage: LegalStage | string;
  content: string;
  sort_order?: number;
};

let cachedDocs: LegalDocument[] | null = null;
let cacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

/** Fallback gdy tabela jeszcze nie istnieje / RLS / sieć. */
export const LEGAL_FALLBACK = `
[ŹRÓDŁO: Dz. U. 2015 poz. 1144 — skrót awaryjny]
Rozmowa wstępna w 21 dni; 5 elementów (rzetelność, wiedza, organizacja pracy, komunikacja, współpraca); sprawozdanie (termin po 8 mies., okres ≥ 7 mies.); skala 3/5/7; pozytywna: egzamin (gdy dotyczy) + sprawozdanie w terminie + ≤1× ocena 3 + średnia ≥ 5; negatywna → uzasadnienie.

[ŹRÓDŁO: Dz. U. 2016 poz. 470 — skrót awaryjny]
Ocena okresowa: arkusze B/C; kryteria obowiązkowe + max 3 dodatkowe; skala 1–9; pozytywna przy poziomie ≥ „na poziomie oczekiwań” i bez cząstkowej 1; cykl 24 mies.
`.trim();

export function stagesForAssistantContext(input?: {
  evaluationType?: string | null;
  viewStage?: 1 | 2 | 3 | null;
}): LegalStage[] {
  const stages: LegalStage[] = ["GENERAL", "ALL_STAGES"];
  if (input?.evaluationType === "periodic") {
    stages.push("PERIODIC");
    return stages;
  }
  if (input?.viewStage === 1) stages.push("INITIAL_TALK");
  else if (input?.viewStage === 2) stages.push("REPORT", "INITIAL_TALK");
  else if (input?.viewStage === 3) stages.push("FINAL_EVALUATION", "REPORT");
  else stages.push("INITIAL_TALK", "FINAL_EVALUATION");
  return stages;
}

/** Dobór źródeł pod treść pytania — mniej tokenów, bez utraty trafności. */
export function rankLegalDocsForQuery(
  docs: LegalDocument[],
  query: string,
): LegalDocument[] {
  const q = query.toLowerCase();
  const scored = docs.map((doc) => {
    let score = 0;
    const boost = (re: RegExp, w: number) => {
      if (re.test(q)) score += w;
    };
    boost(/sprawozd|termin|8 mies|21 dn/, 5);
    boost(/rozmow|wstępn|checklist|oczekiwan/, 4);
    boost(/werdykt|pozytyw|negatyw|uzasadni|średni/, 5);
    boost(/arkusz|skal|3\s*\/\s*5|1\s*\/\s*3|punkt/, 4);
    boost(/okresow|arkusz b|arkusz c|\bb\b.*\bc\b|24 mies/, 5);
    boost(/kryter|dodatkow|osp/, 3);
    boost(/służb.*przygot|egzamin|ksap/, 3);
    boost(/rzetel|komunik|współpr|organizacj|wiedzy/, 3);
    boost(/kompas|etap|hr|przełoż/, 2);

    if (doc.stage === "GENERAL") score += 1;
    if (doc.stage === "ALL_STAGES") score += 2;
    if (
      doc.code
        .toLowerCase()
        .split("_")
        .some((p) => p.length > 3 && q.includes(p))
    ) {
      score += 2;
    }
    if (!score && /przepis|rozporząd|paragraf|§|ustaw/.test(q)) score += 1;
    score += 0.01 * (100 - (doc.sort_order ?? 50));
    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.doc);
}

export async function loadLegalDocuments(
  force = false,
): Promise<LegalDocument[]> {
  const now = Date.now();
  if (!force && cachedDocs && now - cacheAt < CACHE_MS) {
    return cachedDocs;
  }

  const { data, error } = await supabase
    .from("legal_documents")
    .select("id, code, title, stage, content, sort_order")
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    if (error) {
      console.warn("[legalKnowledge]", error.message);
    }
    return [];
  }

  cachedDocs = data as LegalDocument[];
  cacheAt = now;
  return cachedDocs;
}

export async function getLegalContextForAssistant(input?: {
  evaluationType?: string | null;
  viewStage?: 1 | 2 | 3 | null;
  query?: string | null;
  /** Limit znaków w prompcie. */
  maxChars?: number;
  /** Max liczba dokumentów. */
  maxDocs?: number;
}): Promise<{ formattedPromptContext: string; sources: LegalDocument[] }> {
  const maxChars = input?.maxChars ?? 5500;
  const maxDocs = input?.maxDocs ?? 3;
  const wanted = new Set(stagesForAssistantContext(input));
  const docs = await loadLegalDocuments();

  let pool =
    docs.length > 0
      ? docs.filter((d) => wanted.has(d.stage as LegalStage))
      : [];

  if (!pool.length) {
    return {
      formattedPromptContext: LEGAL_FALLBACK,
      sources: [],
    };
  }

  if (input?.query?.trim()) {
    pool = rankLegalDocsForQuery(pool, input.query);
  }

  const sources: LegalDocument[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const doc of pool) {
    if (sources.length >= maxDocs) break;
    const block = `[ŹRÓDŁO: ${doc.code} — ${doc.title}]\n${doc.content.trim()}`;
    if (used + block.length + 2 > maxChars) {
      // spróbuj skrócić ostatni blok zamiast pomijać całkowicie przy pierwszym
      if (!sources.length) {
        const cut = block.slice(0, maxChars - 80) + "\n[…]";
        parts.push(cut);
        sources.push(doc);
      }
      break;
    }
    parts.push(block);
    sources.push(doc);
    used += block.length + 2;
  }

  return {
    formattedPromptContext: parts.join("\n\n") || LEGAL_FALLBACK,
    sources,
  };
}
