/**
 * Vercel Serverless: POST /api/groq/chat/completions
 * → https://api.groq.com/openai/v1/chat/completions
 *
 * Wymaga env: GROQ_API_KEY (bez prefiksu VITE_)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({
      error:
        "Brak GROQ_API_KEY w Vercel → Settings → Environment Variables (Production + Preview), potem Redeploy",
    });
  }

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
        body: JSON.stringify(req.body ?? {}),
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
