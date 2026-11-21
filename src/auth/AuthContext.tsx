import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(
  userId: string,
): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetchProfile", error);
    return { profile: null, error: error.message };
  }

  return { profile: data as Profile | null, error: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const result = await fetchProfile(userId);
    setProfile(result.profile);
    setProfileError(result.error);
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1) Startowa sesja
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // 2) Zmiany sesji — NIE robimy await w callbacku (deadlock Supabase)
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);

        // setTimeout: unikamy deadlocku przy async w onAuthStateChange
        setTimeout(() => {
          void (async () => {
            if (!mounted) return;
            if (nextSession?.user) {
              await loadProfile(nextSession.user.id);
            } else {
              setProfile(null);
              setProfileError(null);
            }
            if (event !== "INITIAL_SESSION") {
              setLoading(false);
            }
          })();
        }, 0);
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return error.message;
        if (data.user) {
          await loadProfile(data.user.id);
        }
        return null;
      },
      async signOut() {
        await supabase.auth.signOut();
        setProfile(null);
        setProfileError(null);
      },
      async refreshProfile() {
        if (!session?.user) return;
        await loadProfile(session.user.id);
      },
    }),
    [loading, session, profile, profileError, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth musi być w AuthProvider");
  return ctx;
}
