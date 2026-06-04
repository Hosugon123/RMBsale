import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { serverApi, useServerDataMode } from "../lib/serverApi";
import type { AppUser } from "../lib/types";
import { loadState, getSessionUser, saveState } from "../lib/localStore";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const serverMode = useServerDataMode();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (serverMode) {
      try {
        setUser(await serverApi.me());
      } catch {
        setUser(null);
      }
      return;
    }
    const state = loadState();
    setUser(getSessionUser(state));
  }, [serverMode]);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (username: string, password: string) => {
    if (serverMode) {
      setUser(await serverApi.login(username, password));
      return;
    }
    const state = loadState();
    const matched = state.users.find(
      (item) => item.username === username && item.password === password && item.isActive
    );
    if (!matched) throw new Error("帳號或密碼錯誤");
    state.sessionUserId = matched.id;
    saveState(state);
    setUser(getSessionUser(state));
  };

  const logout = async () => {
    if (serverMode) {
      await serverApi.logout();
    } else {
      const state = loadState();
      state.sessionUserId = 0;
      saveState(state);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
