import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, LOGOUT_EVENT, tokenStore } from './api';
import type { Role, User } from './types';

export type RegisterInput = { name: string; email: string; password: string; role: Exclude<Role, 'ADMIN'>; businessName?: string; farmLocation?: string };
type AuthState = {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void; setUser: (u: User) => void; refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!tokenStore.get());

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return;
    try { setUser(await api<User>('/auth/me')); } catch { /* 401 already cleared the token; offline keeps the session for later */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const onLogout = () => setUser(null); window.addEventListener(LOGOUT_EVENT, onLogout); return () => window.removeEventListener(LOGOUT_EVENT, onLogout); }, []);

  const session = (r: { token: string; user: User }) => { tokenStore.set(r.token); setUser(r.user); return r.user; };
  const value: AuthState = {
    user, loading, setUser, refresh,
    login: async (email, password) => session(await api('/auth/login', { method: 'POST', json: { email, password } })),
    register: async (input) => session(await api('/auth/register', { method: 'POST', json: input })),
    logout: () => { tokenStore.clear(); setUser(null); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
