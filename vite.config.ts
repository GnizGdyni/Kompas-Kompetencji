import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const groqKey = (env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || "").trim();
  if (!groqKey) {
    console.warn("[vite] Brak GROQ_API_KEY — proxy /api/groq nie doda Authorization");
  } else {
    console.info("[vite] Groq proxy OK (klucz załadowany)");
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Omija CORS: przeglądarka → /api/groq → api.groq.com
        "/api/groq": {
          target: "https://api.groq.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/groq/, "/openai/v1"),
          headers: groqKey
            ? {
                Authorization: `Bearer ${groqKey}`,
                "User-Agent": "kompas-kompetencji/1.0",
              }
            : { "User-Agent": "kompas-kompetencji/1.0" },
        },
      },
    },
  };
});
