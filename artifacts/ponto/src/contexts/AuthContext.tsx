import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { setEmpresaId, setAuthTokenGetter } from "@workspace/api-client-react";
import { baseUrl } from "@/lib/utils";

export interface AuthEmpresa {
  id: number;
  nome: string;
  slug: string;
}

export interface AuthUser {
  id: number;
  nome?: string;
  email: string;
  role: "super_admin" | "admin" | string;
  empresa_id: number | null;
}

interface LoginInput {
  email: string;
  senha: string;
  empresa_slug?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  empresa: AuthEmpresa | null;
  empresas: AuthEmpresa[];
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  setActiveEmpresa: (empresa: AuthEmpresa) => void;
  reloadEmpresas: () => Promise<void>;
}

const TOKEN_KEY = "ponto.auth.token";
const ACTIVE_EMPRESA_KEY = "ponto.auth.activeEmpresaId";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  empresa: null,
  empresas: [],
  loading: true,
  login: async () => {},
  logout: () => {},
  setActiveEmpresa: () => {},
  reloadEmpresas: async () => {},
});

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function getStoredActiveEmpresa(): number | null {
  try {
    const v = localStorage.getItem(ACTIVE_EMPRESA_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function setStoredActiveEmpresa(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_EMPRESA_KEY);
    else localStorage.setItem(ACTIVE_EMPRESA_KEY, String(id));
  } catch {
    /* ignore */
  }
}

// Configure the api-client to attach the JWT to every request.
setAuthTokenGetter(() => getStoredToken());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [empresa, setEmpresa] = useState<AuthEmpresa | null>(null);
  const [empresas, setEmpresas] = useState<AuthEmpresa[]>([]);
  const [loading, setLoading] = useState(true);

  const applyEmpresa = useCallback((e: AuthEmpresa | null) => {
    setEmpresa(e);
    setEmpresaId(e?.id ?? null);
    setStoredActiveEmpresa(e?.id ?? null);
  }, []);

  const loadEmpresasForUser = useCallback(
    async (currentUser: AuthUser, fallbackEmpresa: AuthEmpresa | null): Promise<void> => {
      const token = getStoredToken();
      if (!token) return;
      try {
        const res = await fetch(`${baseUrl()}/api/empresas`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setEmpresas(fallbackEmpresa ? [fallbackEmpresa] : []);
          return;
        }
        const list = (await res.json()) as AuthEmpresa[];
        setEmpresas(list);

        if (currentUser.role === "super_admin") {
          if (list.length === 0) {
            applyEmpresa(null);
            return;
          }
          const stored = getStoredActiveEmpresa();
          const match = list.find((e) => e.id === stored) ?? list[0]!;
          applyEmpresa(match);
        } else if (fallbackEmpresa) {
          applyEmpresa(fallbackEmpresa);
        }
      } catch {
        setEmpresas(fallbackEmpresa ? [fallbackEmpresa] : []);
      }
    },
    [applyEmpresa],
  );

  // Bootstrap: try to restore session from token.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setStoredToken(null);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { usuario: AuthUser; empresa: AuthEmpresa | null };
        setUser(data.usuario);
        await loadEmpresasForUser(data.usuario, data.empresa);
      } catch {
        setStoredToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadEmpresasForUser]);

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await fetch(`${baseUrl()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Falha no login");
      }
      const payload = data as {
        token: string;
        usuario: AuthUser;
        empresa: AuthEmpresa | null;
      };
      setStoredToken(payload.token);
      setUser(payload.usuario);
      await loadEmpresasForUser(payload.usuario, payload.empresa);
    },
    [loadEmpresasForUser],
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setStoredActiveEmpresa(null);
    setUser(null);
    setEmpresa(null);
    setEmpresas([]);
    setEmpresaId(null);
  }, []);

  const setActiveEmpresa = useCallback(
    (e: AuthEmpresa) => {
      applyEmpresa(e);
    },
    [applyEmpresa],
  );

  const reloadEmpresas = useCallback(async () => {
    if (!user) return;
    await loadEmpresasForUser(user, empresa);
  }, [user, empresa, loadEmpresasForUser]);

  return (
    <AuthContext.Provider
      value={{ user, empresa, empresas, loading, login, logout, setActiveEmpresa, reloadEmpresas }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
