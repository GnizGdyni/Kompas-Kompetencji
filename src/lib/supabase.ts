import { createClient } from "@supabase/supabase-js";
import type { AppRole, EvaluationCase, Profile } from "../types";

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Brak VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY w .env");
}

export const supabase = createClient(url ?? "", key ?? "");

export type { AppRole, EvaluationCase, Profile };
