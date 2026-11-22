/**
 * Proxy Groq na Vercel (zastępuje vite server.proxy z dev).
 * Przeglądarka → /api/groq/... → https://api.groq.com/openai/v1/...
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    return res.status(204).end();
  }

  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({
      error: "Brak GROQ_API_KEY w zmiennych środowiskowych Vercel",
    });
  }

  const raw = req.query.path;
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!parts.length) {
    return res.status(400).json({ error: "Brak ścieżki API Groq" });
  }

  const target = `https://api.groq.com/openai/v1/${parts.map(encodeURIComponent).join("/")}`;

  try {
    const upstream = await fetch(target, {
      method: req.method || "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "kompas-kompetencji/vercel",
      },
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : JSON.stringify(req.body ?? {}),
    });

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
