import { groqHeaders } from "./groqClient";
import {
  findOspPresetByJobAndUnit,
  type OspPreset,
} from "./ospPositions";

const GROQ_URL = "/api/groq/chat/completions";
export const GROQ_MODEL_DEFAULT = "openai/gpt-oss-20b";

export type InterviewQuestion = {
  question: string;
  focus?: string;
  source?: string;
};

export type QuestionsSuggestion = {
  questions: InterviewQuestion[];
  sources: string[];
  model: string;
};

async function loadOspFullText(preset: OspPreset): Promise<string | null> {
  try {
    const res = await fetch(preset.textFile);
    if (!res.ok) return null;
    return (await res.text()).slice(0, 7000);
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

/** Lokalne pytania z zadań OSP — gdy AI niedostępne. */
export function questionsFromOspText(input: {
  ospText: string;
  softHint?: string;
  jobTitle?: string;
}): InterviewQuestion[] {
  const out: InterviewQuestion[] = [];
  const taskRe =
    /Zadanie\s*\d+\s*[:.]?\s*([^\n]+(?:\n(?!Zadanie\s*\d+)[^\n]+){0,3})/gi;
  let m: RegExpExecArray | null;
  while ((m = taskRe.exec(input.ospText)) && out.length < 3) {
    const raw = m[1].replace(/\s+/g, " ").trim();
    if (raw.length < 40) continue;
    const short = raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
    out.push({
      question: `Jak w praktyce realizujesz zadanie: „${short}”? Podaj konkretny przykład z ostatniego okresu.`,
      focus: "obowiązki z OSP",
      source: "OSP: zadania",
    });
  }

  if (input.softHint) {
    const softParts = input.softHint
      .split(/[;•\-–—]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8)
      .slice(0, 2);
    for (const soft of softParts) {
      if (out.length >= 3) break;
      out.push({
        question: `W kontekście kompetencji „${soft}” — jak wygląda to na Twoim stanowisku${
          input.jobTitle ? ` (${input.jobTitle})` : ""
        }? Opisz konkretną sytuację.`,
        focus: soft,
        source: "OSP: kompetencje miękkie",
      });
    }
  }

  if (!out.length) {
    out.push({
      question:
        "Jakie są Twoje główne obowiązki wynikające z opisu stanowiska i jak je obecnie realizujesz?",
      focus: "obowiązki z OSP",
      source: "szablon rozmowy wstępnej",
    });
    out.push({
      question:
        "Czego oczekujesz ode mnie jako przełożonego, żeby dobrze wystartować na tym stanowisku?",
      focus: "oczekiwania",
      source: "szablon rozmowy wstępnej",
    });
  }

  return out.slice(0, 3);
}

/**
 * Propozycje pytań do rozmowy wstępnej / o kryteriach — na podstawie OSP.
 */
export async function suggestIntroQuestions(input: {
  jobTitle: string;
  orgUnit?: string | null;
  kind: "first_intro" | "periodic_criteria";
}): Promise<QuestionsSuggestion> {
  const model =
    (import.meta.env.VITE_GROQ_MODEL as string | undefined) ||
    GROQ_MODEL_DEFAULT;

  const preset = findOspPresetByJobAndUnit(
    input.jobTitle,
    input.orgUnit ?? null,
  );
  const fullText = preset ? await loadOspFullText(preset) : null;
  const ospCorpus = [
    preset?.purpose,
    preset?.softCompetenciesHint,
    preset?.ospExcerpt,
    fullText,
  ]
    .filter(Boolean)
    .join("\n");

  const local = questionsFromOspText({
    ospText: ospCorpus || input.jobTitle,
    softHint: preset?.softCompetenciesHint,
    jobTitle: input.jobTitle,
  });

  const contextLabel =
    input.kind === "first_intro"
      ? "rozmowa wstępna (pierwsza ocena w służbie cywilnej)"
      : "rozmowa o kryteriach (ocena okresowa)";

  const system = [
    `Jesteś asystentem przełożonego w służbie cywilnej. Proponujesz pytania do: ${contextLabel}.`,
    "Pytania mają być krótkie, konkretne, oparte WYŁĄCZNIE na OSP (cel, zadania, kompetencje miękkie, wymagana wiedza).",
    "Nie wymyślaj faktów spoza OSP. Dokładnie 3 pytania (ani mniej, ani więcej jeśli da się z OSP).",
    "Każde pytanie: behawioralne lub sprawdzające zrozumienie obowiązków (nie quiz prawniczy).",
    'JSON only: {"questions":[{"question":"...","focus":"kompetencja lub temat","source":"fragment OSP"}],"sources":["..."]}',
  ].join(" ");

  const user = [
    `Stanowisko: ${input.jobTitle}`,
    `Komórka: ${input.orgUnit || "—"}`,
    preset
      ? `OSP: ${preset.label} | PDF: ${preset.pdf}`
      : "Brak dopasowanego pliku OSP — pytania ogólne o obowiązki stanowiska.",
    "",
    "LIMIT: zwróć maksymalnie 3 pytania.",
    "",
    ospCorpus
      ? `TREŚĆ OSP:\n${ospCorpus.slice(0, 4000)}`
      : "Brak treści OSP.",
  ].join("\n");

  let questions = local;
  let sources: string[] = local
    .map((q) => q.source)
    .filter((s): s is string => Boolean(s));
  let usedModel = `lokalne+${model}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: await groqHeaders(),
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_completion_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Groq HTTP ${res.status}${body ? `: ${body.slice(0, 240)}` : ""}`,
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
      questions?: unknown;
      sources?: unknown;
    };
    const aiQs: InterviewQuestion[] = [];
    if (Array.isArray(parsed.questions)) {
      for (const item of parsed.questions) {
        if (!item || typeof item !== "object") continue;
        const q = item as Record<string, unknown>;
        const question = String(q.question || "").trim();
        if (question.length < 12) continue;
        aiQs.push({
          question,
          focus: q.focus ? String(q.focus).trim() : undefined,
          source: q.source ? String(q.source).trim() : undefined,
        });
      }
    }
    if (aiQs.length) {
      questions = aiQs.slice(0, 3);
      usedModel = model;
    }
    if (Array.isArray(parsed.sources)) {
      sources = parsed.sources
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 5);
    }
  } catch (e) {
    if (!local.length) {
      throw e instanceof Error ? e : new Error("Nie udało się sugerować pytań");
    }
    usedModel = "lokalne (OSP)";
  }

  if (preset) {
    sources = [
      `OSP PDF: ${preset.pdf} (${preset.symbol})`,
      ...sources.filter((s) => !s.includes(preset.pdf)),
    ].slice(0, 5);
  }

  return { questions: questions.slice(0, 3), sources, model: usedModel };
}
