/**
 * Odporne wyciąganie JSON z odpowiedzi LLM (ucięty tekst, trailing comma, itp.).
 */

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return t.trim();
}

function sliceBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // ucięty — domknij otwarte struktury
  let repaired = text.slice(start);
  if (inStr) repaired += '"';
  // policz otwarte
  let openBrace = 0;
  let openBracket = 0;
  inStr = false;
  esc = false;
  for (const ch of repaired) {
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") openBrace++;
    else if (ch === "}") openBrace--;
    else if (ch === "[") openBracket++;
    else if (ch === "]") openBracket--;
  }
  // usuń wiszący przecinek na końcu
  repaired = repaired.replace(/,\s*$/, "");
  while (openBracket > 0) {
    repaired += "]";
    openBracket--;
  }
  while (openBrace > 0) {
    repaired += "}";
    openBrace--;
  }
  return repaired;
}

function softRepair(jsonText: string): string {
  let t = jsonText;
  // trailing commas przed ] lub }
  t = t.replace(/,\s*([\]}])/g, "$1");
  // smart quotes
  t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // niepoprawne kontrolne w stringach: zamień nagie newline w stringach na \n (przybliżenie)
  t = t.replace(/"([^"\\]|\\.)*"/gs, (m) =>
    m.replace(/\r\n/g, "\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\n"),
  );
  return t;
}

export function parseModelJson(text: string): unknown {
  const cleaned = stripFences(text);
  const attempts: string[] = [];

  attempts.push(cleaned);
  const balanced = sliceBalancedObject(cleaned);
  if (balanced) attempts.push(balanced);

  const errors: string[] = [];
  for (const raw of attempts) {
    for (const candidate of [raw, softRepair(raw)]) {
      try {
        return JSON.parse(candidate);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  throw new Error(
    `Model zwrócił niepoprawny JSON (${errors[0] || "parse error"}). Spróbuj Odśwież.`,
  );
}
