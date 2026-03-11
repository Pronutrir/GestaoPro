import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isAdmin: false,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const [{ data: profileData }, { data: roleData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      ]);
      setProfile(profileData);
      setIsAdmin(!!roleData);
    } catch (error) {
      console.error("Error fetching user data:", error);
      setProfile(null);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Safety timeout to prevent infinite loading
    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading safety timeout reached");
        setLoading(false);
      }
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      // Don't await inside onAuthStateChange - use setTimeout to avoid deadlocks
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
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
