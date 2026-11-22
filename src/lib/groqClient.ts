/** Wspólny klient Groq: łańcuch modeli z fallbackiem. */

export const GROQ_URL = "/api/groq/chat/completions";

/** Preferowany: 120b → fallback 20b */
export const GROQ_MODELS_CHAIN = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
] as const;

export const GROQ_MODEL_DEFAULT = GROQ_MODELS_CHAIN[0];

export type GroqChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Kolejność: VITE_GROQ_MODEL (jeśli ustawione) → 120b → 20b (bez duplikatów). */
export function groqModelsToTry(): string[] {
  const preferred = (
    import.meta.env.VITE_GROQ_MODEL as string | undefined
  )?.trim();
  const out: string[] = [];
  const push = (m: string) => {
    if (m && !out.includes(m)) out.push(m);
  };
  if (preferred) push(preferred);
  for (const m of GROQ_MODELS_CHAIN) push(m);
  return out;
}

export async function groqChatCompletion(input: {
  messages: GroqChatMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  /** Dodatkowe pola body (np. response_format). */
  extra?: Record<string, unknown>;
}): Promise<{ text: string; model: string }> {
  const models = groqModelsToTry();
  let lastError = "Brak odpowiedzi z modeli Groq.";

  for (const model of models) {
    const payload: Record<string, unknown> = {
      model,
      temperature: input.temperature ?? 0.2,
      max_completion_tokens: input.maxCompletionTokens ?? 900,
      messages: input.messages,
      ...(input.extra || {}),
    };
    if (model.startsWith("openai/gpt-oss")) {
      payload.reasoning_effort = "low";
    }

    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = `Groq ${model} HTTP ${res.status}${
          body ? `: ${body.slice(0, 180)}` : ""
        }`;
        console.warn(`[groq] ${lastError}`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: {
          message?: { content?: string | null; reasoning?: string | null };
        }[];
      };
      const text =
        data.choices?.[0]?.message?.content?.trim() ||
        data.choices?.[0]?.message?.reasoning?.trim() ||
        "";
      if (!text) {
        lastError = `Groq ${model}: pusta odpowiedź`;
        console.warn(`[groq] ${lastError}`);
        continue;
      }
      return { text, model };
    } catch (e: unknown) {
      lastError =
        e instanceof Error ? `${model}: ${e.message}` : `${model}: błąd sieci`;
      console.warn(`[groq] ${lastError}`);
    }
  }

  throw new Error(lastError);
}
