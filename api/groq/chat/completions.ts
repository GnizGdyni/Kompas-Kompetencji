/**
 * Vercel Serverless: POST /api/groq/chat/completions
 * → https://api.groq.com/openai/v1/chat/completions
 *
 * Wymaga env: GROQ_API_KEY (bez prefiksu VITE_) oraz VITE_SUPABASE_URL
 * i VITE_SUPABASE_ANON_KEY do weryfikacji tokenu użytkownika.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED_MODELS = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
const MAX_BODY_CHARS = 60_000;
const MAX_COMPLETION_TOKENS = 6000;

async function isLoggedInUser(authHeader: string | undefined): Promise<boolean> {
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return false;

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!url || !anonKey) return false;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({
      error:
        "Brak GROQ_API_KEY w Vercel → Settings → Environment Variables (Production + Preview), potem Redeploy",
    });
  }

  if (!(await isLoggedInUser(req.headers.authorization))) {
    return res.status(401).json({ error: "Zaloguj się, aby korzystać z AI." });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw = JSON.stringify(body);
  if (raw.length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: "Zapytanie do AI jest za duże." });
  }
  if (typeof body.model !== "string" || !ALLOWED_MODELS.has(body.model)) {
    return res.status(400).json({ error: "Niedozwolony model." });
  }
  const requested = Number(body.max_completion_tokens) || 900;
  body.max_completion_tokens = Math.min(requested, MAX_COMPLETION_TOKENS);

  try {
    const upstream = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "User-Agent": "kompas-kompetencji/vercel",
        },
        body: JSON.stringify(body),
      },
    );

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json",
    );
    return res.send(text);
  } catch (e: unknown) {
    return res.status(502).json({
      error: e instanceof Error ? e.message : "Błąd proxy Groq",
    });
  }
}
