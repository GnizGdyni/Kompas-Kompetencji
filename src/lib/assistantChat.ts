/** Asystent AI — baza prawna + kontekst otwartego procesu (zoptymalizowane tokeny). */

import { GROQ_MODEL_DEFAULT, groqChatCompletion } from "./groqClient";
import { getLegalContextForAssistant } from "./legalKnowledge";
import {
  INTERVIEW_SHEET_GUIDANCE,
  SCREEN_GLOSSARY,
  buildNextSteps,
  formatOpenProcessBlock,
  reportUploadGuide,
  type OpenProcessContext,
} from "./processAssistantHints";

export { GROQ_MODEL_DEFAULT };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const HISTORY_TURNS = 3;
const HISTORY_MSG_MAX = 500;
const ASSISTANT_MAX_TOKENS = 420;

function systemPrompt(legalBlock: string, compactGlossary: boolean): string {
  return [
    "ROLA: Asystent przełożonego (Kompas Kompetencji).",
    "Pomagasz krótko: przepisy, etap, ekran. Nie oceniasz za użytkownika. Nie zmyślaj faktów ani menu UI.",
    "",
    "BAZA WIEDZY:",
    legalBlock,
    "",
    compactGlossary
      ? "UI: Procesy→otwórz sprawę→etapy 1–3. Sprawozdanie=etap 2 sekcja Sprawozdanie (Wybierz plik+data+Zapisz). Brak menu „Oceny okresowe”/zakładki poza kartą. B=kierowanie C=inne; 1.ocena 3/5/7; okresowa 1–9; uzasadnienie przy NEGATYWNEJ; HR bez prowadzenia oceny."
      : SCREEN_GLOSSARY,
    "",
    compactGlossary
      ? "ROZMOWA/ARKUSZ: wskazówki; fakty z uwag/sprawozdania/OSP."
      : INTERVIEW_SHEET_GUIDANCE,
    "",
    "STYL: max 6–8 krótkich linii lub lista 3–5 punktów; bez esejów i powtórzeń; Markdown oszczędnie.",
    "NIE wstawiaj w tytułach/nawiasach stanowiska ani komórki (np. „naczelnik… / Departament…”) — to kontekst wewnętrzny, nie treść odpowiedzi.",
    "WYMAGANIA: cytuj bazę lub „brak w bazie”; nie wymyślaj przycisków/zakładek spoza UI; bez imion; decyzja=przełożony.",
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

/** Pytania o miejsce wgrania / złożenia sprawozdania w Kompasie. */
export function isReportWhereQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!/sprawozd/.test(t)) return false;
  return (
    /gdzie|wgra|załad|zalad|dodaj|umieści|umiesci|złożyć|zlozyc|złoż|wrzu|upload|plik|sekcj|etap 2|etapie 2/.test(
      t,
    ) || /jak.*(złożyć|zlozyc|wgra|dodac|dodać).*sprawozd/.test(t)
  );
}

/** Jak przeprowadzić / zacząć pierwszą ocenę — lokalnie, bez profilu w nagłówku. */
export function isFirstEvalHowQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!/pierwsz/.test(t)) return false;
  return /jak|przeprowadz|rozpoczn|zaczn|krok|etap|zrobić|zrobic/.test(t);
}

export function localFirstEvalGuide(): string {
  return [
    "**Pierwsza ocena — kroki w Kompasie**",
    "",
    "1. **Procesy** → **Nowy proces** (albo otwórz istniejącą sprawę).",
    "2. **Etap 1** — rozmowa wstępna (checklista, data, termin sprawozdania) → **Zapisz**.",
    "3. **Etap 2** — okres; sekcja **Sprawozdanie** (plik + data) → **Zapisz**.",
    "4. **Etap 3** — rozmowa i arkusz (3/5/7), werdykt; przy negatywnej — uzasadnienie.",
    "5. **Zapisz** → PDF (opcjonalnie) → zakończ proces.",
  ].join("\n");
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

  // Ścieżki bez tokenów API
  if (isNextStepsQuestion(userText)) {
    return localNextStepsReply(open);
  }
  if (isReportWhereQuestion(userText)) {
    return reportUploadGuide(open);
  }
  if (isFirstEvalHowQuestion(userText)) {
    return localFirstEvalGuide();
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
      maxCompletionTokens: ASSISTANT_MAX_TOKENS,
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
