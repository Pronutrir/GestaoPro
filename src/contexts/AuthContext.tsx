'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  isGestor: boolean;
  canManage: boolean; // admin OR gestor — has all permissions except settings
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isAdmin: false,
  isGestor: false,
  canManage: false,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGestor, setIsGestor] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [{ data: profileData, error: profileError }, { data: rolesData, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      if (profileError?.code) throw profileError;
      if (rolesError?.code) throw rolesError;

      setProfile(profileData);
      const roles = (rolesData || []).map((r: any) => r.role);
      setIsAdmin(roles.includes("admin"));
      setIsGestor(roles.includes("gestor"));
    } catch (error: any) {
      const serialized = error == null
        ? String(error)
        : Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = error[k];
            return acc;
          }, {});
      console.error("Error fetching user data:", serialized);
      setProfile(null);
      setIsAdmin(false);
      setIsGestor(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading safety timeout reached");
        // Re-attempt getSession before giving up
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!mounted) return;
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchUserData(session.user.id).finally(() => {
              if (mounted) setLoading(false);
            });
          } else {
            setLoading(false);
          }
        }).catch(() => {
          if (mounted) setLoading(false);
        });
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setIsAdmin(false);
        setIsGestor(false);
        setLoading(false);
        return;
      }
      setTimeout(() => {
        if (!mounted) return;
        fetchUserData(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchUserData, loading]);

  useEffect(() => {
    if (!user?.id) return;

    const refreshUserData = () => {
      fetchUserData(user.id).catch((error) => {
        console.error("Error refreshing user data:", error);
      });
    };

    const handleFocus = () => refreshUserData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshUserData();
      }
    };
    const intervalId = window.setInterval(refreshUserData, 10000);

    const channel = supabase
      .channel(`auth-user-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        refreshUserData
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        refreshUserData
      )
      .subscribe();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [fetchUserData, user?.id]);

  const signOut = useCallback(async () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    setIsGestor(false);
    await supabase.auth.signOut();
  }, []);

  const canManage = isAdmin || isGestor;

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, isGestor, canManage, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
