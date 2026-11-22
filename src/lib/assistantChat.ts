/** Asystent AI — baza prawna + kontekst otwartego procesu (zoptymalizowane tokeny). */

import { GROQ_MODEL_DEFAULT, groqChatCompletion } from "./groqClient";
import { getLegalContextForAssistant } from "./legalKnowledge";
import {
  INTERVIEW_SHEET_GUIDANCE,
  SCREEN_GLOSSARY,
  buildNextSteps,
  formatOpenProcessBlock,
  type OpenProcessContext,
} from "./processAssistantHints";

export { GROQ_MODEL_DEFAULT };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const HISTORY_TURNS = 4;
const HISTORY_MSG_MAX = 900;

function systemPrompt(legalBlock: string, compactGlossary: boolean): string {
  return [
    "ROLA: Asystent przełożonego (Kompas Kompetencji / służba cywilna).",
    "Pomagasz: przepisy, etap procesu, ekran, wskazówki do rozmowy/arkusza. Nie oceniasz za użytkownika. Nie zmyślaj faktów.",
    "",
    "BAZA WIEDZY:",
    legalBlock,
    "",
    compactGlossary
      ? "EKRAN: B=kierowanie, C=pozostałe; 1. ocena 3/5/7; okresowa 1–9; uzasadnienie obowiązkowe przy NEGATYWNEJ; HR bez prowadzenia oceny."
      : SCREEN_GLOSSARY,
    "",
    compactGlossary
      ? "ROZMOWA/ARKUSZ: tylko wskazówki; fakty z uwag/sprawozdania/OSP; bez werdyktu za przełożonego."
      : INTERVIEW_SHEET_GUIDANCE,
    "",
    "WYMAGANIA: cytuj z bazy lub powiedz „brak w bazie”; przy otwartym procesie trzymaj się etapu; Markdown (**bold**, listy); bez imion; decyzja = przełożony.",
  ].join("\n");
}

function trimHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  const slice = (history || []).slice(-HISTORY_TURNS);
  return slice.map((m) => ({
    role: m.role,
    content:
      m.content.length > HISTORY_MSG_MAX
        ? `${m.content.slice(0, HISTORY_MSG_MAX)}…`
        : m.content,
  }));
}

/** Lokalna odpowiedź bez API — zero tokenów, ta sama treść kroków. */
export function localNextStepsReply(
  openProcess: OpenProcessContext | null | undefined,
): string {
  if (!openProcess) {
    return [
      "Nie mam otwartego procesu. Otwórz sprawę w Kompasie, a podpowiem 2–3 kroki na bieżącym etapie.",
      "",
      "Ogólnie:",
      "1. **Pierwsza ocena** — rozmowa wstępna → okres/sprawozdanie → arkusz (3/5/7) i werdykt.",
      "2. **Okresowa** — kryteria (B/C) → okres → arkusz (1–9) i werdykt.",
      "3. Przy **negatywnej** uzupełnij **uzasadnienie** (obowiązkowe).",
    ].join("\n");
  }

  const steps = buildNextSteps(openProcess);
  const kind =
    openProcess.evaluationType === "periodic"
      ? "ocena okresowa"
      : "pierwsza ocena";
  const sheet =
    openProcess.sheetType && openProcess.sheetType !== "first"
      ? ` · arkusz ${openProcess.sheetType}`
      : "";

  return [
    `Na **etapie ${openProcess.viewStage}/3** (${kind}${sheet}) warto teraz:`,
    "",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "_To wskazówka procesowa — decyzje merytoryczne należą do przełożonego._",
  ].join("\n");
}

export function isNextStepsQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /co mam teraz (zrobić|robic)/i.test(t) ||
    /co dalej\??$/i.test(t) ||
    /następn(y|e) krok/i.test(t) ||
    t.includes("co mam teraz zrobić?")
  );
}

export async function askAssistant(input: {
  userText: string;
  history?: ChatMessage[];
  profileContext?: {
    jobTitle?: string | null;
    orgUnit?: string | null;
  };
  openProcess?: OpenProcessContext | null;
}): Promise<string> {
  const userText = input.userText.trim();
  if (!userText) {
    throw new Error("Wpisz pytanie do asystenta.");
  }

  const open = input.openProcess ?? null;

  // Ścieżka bez tokenów API
  if (isNextStepsQuestion(userText)) {
    return localNextStepsReply(open);
  }

  const { formattedPromptContext, sources } = await getLegalContextForAssistant({
    evaluationType: open?.evaluationType,
    viewStage: open?.viewStage ?? null,
    query: userText,
    maxChars: 5500,
    maxDocs: 3,
  });

  const contextBlock = [
    formatOpenProcessBlock(open),
    "",
    "PROFIL PRZEŁOŻONEGO:",
    `- ${input.profileContext?.jobTitle || "—"} / ${input.profileContext?.orgUnit || "—"}`,
    sources.length
      ? `Źródła: ${sources.map((s) => s.code).join(", ")}`
      : "Źródła: fallback",
  ].join("\n");

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt(formattedPromptContext, true),
    },
    ...trimHistory(input.history).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user" as const,
      content: [`KONTEKST:\n${contextBlock}`, `PYTANIE:\n${userText}`].join(
        "\n\n",
      ),
    },
  ];

  try {
    const { text } = await groqChatCompletion({
      messages,
      temperature: 0.2,
      maxCompletionTokens: 900,
    });
    return text;
  } catch (e: unknown) {
    throw new Error(
      e instanceof Error
        ? `Asystent AI niedostępny: ${e.message}`
        : "Asystent AI niedostępny",
    );
  }
}
